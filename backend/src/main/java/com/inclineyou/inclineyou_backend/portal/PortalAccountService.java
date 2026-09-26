package com.inclineyou.inclineyou_backend.portal;

import com.inclineyou.inclineyou_backend.auth.AuthPrincipal;
import com.inclineyou.inclineyou_backend.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.auth.JwtService;
import com.inclineyou.inclineyou_backend.auth.OtpService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

import static com.inclineyou.inclineyou_backend.portal.PortalReadService.*;

/**
 * Module 11e · the client's account — the number they sign in with, a copy of
 * their data, correcting their own details, and leaving a trainer.
 *
 * <h2>Changing a number proves BOTH numbers</h2>
 *
 * The trainer's ladder (V36), the same four steps: a code to the current number,
 * that code back for a ten-minute signed ticket, the new number (checked free
 * BEFORE an SMS is spent on it), and the new number's code. The OTP service owns
 * the sending, the three-wrong lock and the daily ceiling; nothing here
 * re-implements them. The swap moves the number on every client row that carries
 * it — every roster, every workspace — and on the identity row, in one
 * transaction (V19's function), and hands back a fresh client credential,
 * because the old one's phone no longer resolves.
 *
 * <h2>Leaving is a membership exit, not an erasure</h2>
 *
 * By the product owner's decision (23 Sep 2026): the typed number is re-checked
 * here, not only in the web; THAT roster's client row is soft-deleted with the
 * client's own data about it — preferences (the nominee erased outright), their
 * bell, their assessments and their workout feedback — and its future bookings
 * are called off. The trainer's records are kept: payments, packages, logged
 * workouts and the trainer's private notes. Other rosters on the same phone are
 * untouched — it removes the membership, not the person. A DPDP erasure is a
 * separate, policy-first piece of work.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PortalAccountService {

    private static final String PHONE_PATTERN = "^[6-9]\\d{9}$";
    private static final int MAX_HEALTH = 2000;

    private final NamedParameterJdbcTemplate jdbc;
    private final OtpService otp;
    private final JwtService jwt;
    private final AuthTokenService tokens;
    private final PortalReadService reads;
    private final PortalPrefsService prefs;

    public record OtpBody(String otp) {}

    public record NewPhoneBody(String ticket, String phone) {}

    public record ConfirmBody(String ticket, String phone, String otp) {}

    public record Ticket(String ticket) {}

    public record PhoneChanged(String phone, String token) {}

    public record Details(String id, String phone, String health) {}

    public record LeaveBody(String confirmation) {}

    // ── The number ────────────────────────────────────────────────────────────

    public void challenge(PortalScope.Me me) {
        otp.send(me.phone());
    }

    /** Wrong code → the OTP service's own `OTP_WRONG` / `OTP_EXPIRED` / `OTP_LOCKED`, unchanged. */
    public Ticket verify(PortalScope.Me me, OtpBody body) {
        otp.verify(me.phone(), body == null ? null : body.otp());
        return new Ticket(jwt.generatePhoneChangeTicket(me.clientId(), me.phone()));
    }

    /** Checked before the SMS is spent: the shape, a real move, and nobody on InclineYou holding it. */
    public void request(PortalScope.Me me, NewPhoneBody body) {
        requireTicket(me, body == null ? null : body.ticket());
        String phone = requireAvailable(me, body.phone());
        otp.send(phone);
    }

    @Transactional
    public PhoneChanged confirm(PortalScope.Me me, ConfirmBody body) {
        requireTicket(me, body == null ? null : body.ticket());
        String phone = requireAvailable(me, body.phone());
        otp.verify(phone, body.otp());
        Integer moved = jdbc.queryForObject("SELECT portal_change_client_phone(:old, :new)",
                Map.of("old", me.phone(), "new", phone), Integer.class);
        log.info("client phone changed on {} roster row(s)", moved);
        String token = tokens.issueForCurrentRequest(
                new AuthPrincipal(phone, phone, JwtService.ROLE_CLIENT, null, null)).value();
        return new PhoneChanged(phone, token);
    }

    private void requireTicket(PortalScope.Me me, String ticket) {
        if (ticket == null || ticket.isBlank()) throw unproven();
        Claims claims;
        try {
            claims = jwt.parse(ticket);
        } catch (JwtException e) {
            throw unproven();
        }
        boolean ok = JwtService.ROLE_PHONE_CHANGE.equals(jwt.extractRole(claims))
                && me.clientId().toString().equals(claims.getSubject())
                && me.phone().equals(claims.get("phone", String.class));
        if (!ok) throw unproven();
    }

    private String requireAvailable(PortalScope.Me me, String raw) {
        String phone = raw == null ? "" : raw.strip();
        if (!phone.matches(PHONE_PATTERN)) throw PortalRuleException.validation("phone: a 10-digit mobile number");
        if (phone.equals(me.phone())) {
            throw new PortalRuleException(HttpStatus.BAD_REQUEST, "PHONE_UNCHANGED",
                    "That is the number you are already signed in with.");
        }
        Boolean taken = jdbc.queryForObject("SELECT portal_phone_in_use(:p)", Map.of("p", phone), Boolean.class);
        if (Boolean.TRUE.equals(taken)) {
            // Deliberately does not say WHO holds it — the route would otherwise
            // answer "is this number on InclineYou" for any number in India.
            throw new PortalRuleException(HttpStatus.CONFLICT, "PHONE_TAKEN",
                    "That number already belongs to somebody on InclineYou.");
        }
        return phone;
    }

    private static PortalRuleException unproven() {
        return new PortalRuleException(HttpStatus.UNAUTHORIZED, "PHONE_CHANGE_UNPROVEN",
                "Confirm your current number again — that step timed out.");
    }

    // ── Correcting their own details ──────────────────────────────────────────

    /**
     * The one field a client corrects here is {@code health}, stored in
     * {@code client.metadata.health}. Health data by the product's standing
     * rule; accepted by the product owner's recorded decision to "include
     * everything now and strip health collection later if required" (23 Sep
     * 2026). A {@code phone} is REFUSED — the number moves only through the
     * two-code ladder above, never in one field.
     */
    @Transactional
    public Details patchMe(PortalScope.Me me, Map<String, Object> body) {
        var b = body == null ? Map.<String, Object>of() : body;
        if (b.containsKey("phone")) {
            throw PortalRuleException.validation("phone: change it through the phone-change steps, which prove both numbers");
        }
        if (b.containsKey("health")) {
            String health = b.get("health") instanceof String h ? h.strip() : "";
            if (health.length() > MAX_HEALTH) throw PortalRuleException.validation("health: at most " + MAX_HEALTH + " characters");
            var p = params(me);
            p.put("health", health);
            jdbc.update("""
                    UPDATE client SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{health}', to_jsonb(CAST(:health AS text))),
                        updated_at = now()
                    WHERE id = :cid::uuid AND deleted_at IS NULL
                    """, p);
        }
        var row = jdbc.queryForMap("SELECT id::text, phone, metadata->>'health' AS health FROM client WHERE id = :cid::uuid", params(me));
        return new Details(s(row.get("id")), s(row.get("phone")), Objects.requireNonNullElse(s(row.get("health")), ""));
    }

    // ── A copy of their data ──────────────────────────────────────────────────

    /**
     * One document with everything the portal shows about this roster. Every
     * part is a FIELD-LISTED projection — the client row without the trainer's
     * or team's arrangement (split and margin percentages, who assigned them,
     * staleness markers), payments without the gym's side — so a column added
     * tomorrow cannot leak into a download. The trainer's private notes are not
     * in it; notes the trainer shared are, as messages.
     */
    public Map<String, Object> export(PortalScope.Me me) {
        var client = jdbc.queryForMap("""
                SELECT id::text, name, phone, goal, status, membership_status, delivery_mode, sessions_per_week,
                       session_duration_minutes, weekly_schedule::text AS weekly_schedule, height_cm,
                       date_of_birth::text AS date_of_birth, activity_level, metadata->>'health' AS health,
                       invited_at, accepted_at, created_at
                FROM client WHERE id = :cid::uuid
                """, params(me));
        var clientOut = new LinkedHashMap<String, Object>();
        client.forEach((k, v) -> clientOut.put(camel(k), k.endsWith("_at") ? msOrNull(v)
                : k.equals("weekly_schedule") ? listOfMaps(s(v)) : v));

        var payments = jdbc.queryForList("""
                SELECT id::text, package_id::text AS package_id, amount, method, status, upi_reference, paid_at, note, created_at
                FROM payment WHERE client_id = :cid::uuid AND deleted_at IS NULL ORDER BY created_at, id
                """, params(me)).stream().map(r -> {
            var m = new LinkedHashMap<String, Object>();
            m.put("id", s(r.get("id")));
            m.put("packageId", s(r.get("package_id")));
            m.put("amount", r.get("amount"));
            m.put("method", s(r.get("method")));
            m.put("status", s(r.get("status")));
            m.put("upiReference", s(r.get("upi_reference")));
            m.put("paidAt", msOrNull(r.get("paid_at")));
            m.put("note", s(r.get("note")));
            m.put("createdAt", ms(r.get("created_at")));
            return m;
        }).toList();

        var feedback = jdbc.queryForList("""
                SELECT workout_session_id::text AS workout_id, effort, note, at FROM workout_feedback
                WHERE client_id = :cid::uuid AND deleted_at IS NULL ORDER BY at
                """, params(me)).stream().map(r -> Map.of(
                "workoutId", s(r.get("workout_id")), "effort", Objects.requireNonNullElse(s(r.get("effort")), ""),
                "note", Objects.requireNonNullElse(s(r.get("note")), ""), "at", ms(r.get("at")))).toList();

        var assessments = reads.assessments(me).stream().map(a -> reads.assessment(me, UUID.fromString(a.id()))).toList();
        var me0 = reads.me(me);
        var settingsRow = jdbc.queryForList("SELECT 1 FROM client_prefs WHERE client_id = :cid::uuid AND deleted_at IS NULL", params(me));

        var out = new LinkedHashMap<String, Object>();
        out.put("exportedAt", Instant.now().toEpochMilli());
        out.put("client", clientOut);
        out.put("trainer", me0.trainer());
        out.put("sessions", reads.sessions(me, null, null));
        out.put("workouts", reads.workouts(me, null));
        out.put("sets", reads.sets(me));
        out.put("measurements", reads.metrics(me));
        out.put("packages", reads.packages(me));
        out.put("payments", payments);
        out.put("messagesFromTrainer", reads.messages(me));
        out.put("feedback", feedback);
        out.put("milestones", reads.milestones(me));
        out.put("assessments", assessments);
        out.put("settings", settingsRow.isEmpty() ? null : prefs.prefs(me));
        return out;
    }

    // ── Leaving ───────────────────────────────────────────────────────────────

    /** A membership exit — see the class note. The typed number must match, on its last ten digits. */
    @Transactional
    public void leave(PortalScope.Me me, LeaveBody body) {
        String typed = body == null || body.confirmation() == null ? "" : body.confirmation().replaceAll("\\D", "");
        String phone = me.phone().replaceAll("\\D", "");
        if (typed.length() < 10 || !typed.endsWith(phone.substring(Math.max(0, phone.length() - 10)))) {
            throw new PortalRuleException(HttpStatus.BAD_REQUEST, "DELETE_NOT_CONFIRMED",
                    "That is not the number on this account. Type it exactly to confirm.");
        }
        var p = params(me);
        // The client's own data about this membership.
        jdbc.update("""
                UPDATE client_prefs SET nominee_name = NULL, nominee_phone = NULL, deleted_at = now()
                WHERE client_id = :cid::uuid
                """, p);
        jdbc.update("UPDATE client_notification SET deleted_at = now() WHERE client_id = :cid::uuid AND deleted_at IS NULL", p);
        jdbc.update("UPDATE assessment SET deleted_at = now(), updated_at = now() WHERE client_id = :cid::uuid AND deleted_at IS NULL", p);
        jdbc.update("UPDATE workout_feedback SET deleted_at = now(), updated_at = now() WHERE client_id = :cid::uuid AND deleted_at IS NULL", p);
        // Bookings still to come are called off; the diary's past stays the trainer's record.
        jdbc.update("""
                UPDATE scheduled_session SET deleted_at = now(), updated_at = now()
                WHERE client_id = :cid::uuid AND deleted_at IS NULL AND status = 'scheduled' AND scheduled_at > now()
                """, p);
        // And the membership itself. Payments, packages, workouts and the trainer's notes stay.
        jdbc.update("UPDATE client SET deleted_at = now(), updated_at = now() WHERE id = :cid::uuid AND deleted_at IS NULL", p);
        log.info("client {} left the roster of trainer {}", me.clientId(), me.trainerId());
    }

    private static String camel(String snake) {
        var out = new StringBuilder();
        boolean up = false;
        for (char ch : snake.toCharArray()) {
            if (ch == '_') { up = true; continue; }
            out.append(up ? Character.toUpperCase(ch) : ch);
            up = false;
        }
        return out.toString();
    }
}
