package com.inclineyou.inclineyou_backend.nudge;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.payment.PackageReadService;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code POST /v1/clients/{clientId}/nudges} — draft a WhatsApp message, log it,
 * hand back a {@code wa.me} link (api-contract Today A2). On the v1
 * {@code nudge_log}; the 1.0 {@code …/nudge} route in {@link NudgeService} writes
 * columns v1 no longer has and is left for the screens that still call it.
 *
 * <p>Nothing is sent: the trainer sends it from their own WhatsApp, which is the
 * product (see {@link NudgeService}). Every figure in the message is read here —
 * the amount owed comes from the package, never from the caller — so the message
 * and the money book cannot disagree.
 *
 * <p>No cooldown refusal, by design: the queue goes quiet about somebody already
 * contacted, and a server that said no would teach the trainer to open WhatsApp
 * directly and lose the log for everybody.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeDraftService {

    private final NamedParameterJdbcTemplate jdbc;
    private final PackageReadService packages;
    private final WorkspaceClock clock;

    /**
     * {@code nudge_log.reason} derived from the template, so the caller never
     * sends it. {@code re_engagement} and {@code session_summary} have no agreed
     * reason yet (R64): until one is confirmed against {@code nudge_log_reason}
     * and {@code nudge_log_subject}, they are refused rather than guessed.
     */
    private static final Map<String, String> REASON = Map.of(
            "payment_reminder", "dues",
            "renewal", "pack_ending",
            "missed_session", "no_show",
            "check_in", "lapsed",
            "well_done", "manual",
            "session_reminder", "session");
    private static final Set<String> TEMPLATES = Set.of("payment_reminder", "renewal", "missed_session",
            "re_engagement", "session_reminder", "session_summary", "well_done", "check_in");
    private static final Set<String> TAKES_PACKAGE = Set.of("payment_reminder", "renewal");
    private static final Set<String> TAKES_SESSION = Set.of("missed_session", "session_reminder", "session_summary");
    /** {@code nudge_log.message} is varchar(1000). */
    private static final int MAX_MESSAGE = 1000;

    public record DraftRequest(String id, String template, String packageId, String sessionId) {}

    public record Draft(String id, String message, String whatsappUrl, long sentAt) {}

    /** The draft, and whether this call wrote it (201) or a replay found it (200). */
    public record Drafted(Draft draft, boolean created) {}

    @Transactional
    public Drafted draft(UUID trainerId, UUID clientId, DraftRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = uuid(req.id(), "id");
        String template = req.template();
        if (template == null || !TEMPLATES.contains(template)) {
            throw ApiException.validation("template: one of " + String.join(", ", TEMPLATES.stream().sorted().toList()));
        }
        String reason = REASON.get(template);
        if (reason == null) {
            throw ApiException.validation("template: " + template + " is not available yet");
        }
        UUID packageId = uuid(req.packageId(), "packageId");
        UUID sessionId = uuid(req.sessionId(), "sessionId");
        // nudge_log_subject: a package only on a money reason, a session only on a session one.
        if (packageId != null && !TAKES_PACKAGE.contains(template)) {
            throw ApiException.validation("packageId: " + template + " doesn't take a package");
        }
        if (sessionId != null && !TAKES_SESSION.contains(template)) {
            throw ApiException.validation("sessionId: " + template + " doesn't take a session");
        }

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        var clients = jdbc.queryForList("""
                SELECT c.name, c.phone, t.name AS trainer_name
                FROM client c JOIN trainer t ON t.id = :tid::uuid
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                """, p);
        if (clients.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        var client = clients.getFirst();
        String phone = waNumber((String) client.get("phone"));

        // A replay is answered from the row it wrote — the stored message rebuilds
        // the same link, and no second row skews the cooldown.
        if (id != null) {
            p.put("id", id.toString());
            var existing = jdbc.queryForList("""
                    SELECT trainer_id::text AS tid, client_id::text AS cid, message, sent_at
                    FROM nudge_log WHERE id = :id::uuid
                    """, p);
            if (!existing.isEmpty()) {
                var e = existing.getFirst();
                if (!trainerId.toString().equals(e.get("tid")) || !clientId.toString().equals(e.get("cid"))) {
                    throw ApiException.idConflict();
                }
                String message = (String) e.get("message");
                return new Drafted(new Draft(id.toString(), message, link(phone, clientName(client), message),
                        ((java.sql.Timestamp) e.get("sent_at")).getTime()), false);
            }
        }
        if (phone == null) {
            // 409, not 422 (1.1): adding a number makes the same request work.
            throw ApiException.conflict("CLIENT_NO_PHONE", clientName(client) + " has no phone number on file.");
        }

        if (packageId != null) {
            p.put("pid", packageId.toString());
            if (jdbc.queryForList("SELECT 1 FROM package WHERE id = :pid::uuid AND client_id = :cid::uuid "
                    + "AND trainer_id = :tid::uuid AND deleted_at IS NULL", p).isEmpty()) {
                throw ApiException.validation("packageId: not a package of this client");
            }
        }
        if (sessionId != null) {
            p.put("sid", sessionId.toString());
            if (jdbc.queryForList("SELECT 1 FROM scheduled_session WHERE id = :sid::uuid AND client_id = :cid::uuid "
                    + "AND trainer_id = :tid::uuid AND deleted_at IS NULL", p).isEmpty()) {
                throw ApiException.validation("sessionId: not a session of this client");
            }
        }

        // Day counts in the message are read on the workspace's calendar, not the
        // server's or the database's clock: "due 1 day ago" at 02:00 in Chennai
        // must not say 0 because the JVM runs in UTC.
        var zone = clock.zone();
        p.put("tz", zone.getId());
        p.put("today", java.sql.Date.valueOf(WorkspaceClock.today(zone)));
        String body = overrideFor(trainerId, template);
        String message = NudgeService.interpolate(body, variables(p, template, packageId,
                clientName(client), (String) client.get("trainer_name")));
        if (message.length() > MAX_MESSAGE) message = message.substring(0, MAX_MESSAGE);

        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("reason", reason);
        p.put("template", template);
        p.put("message", message);
        p.put("pid", packageId == null ? null : packageId.toString());
        p.put("sid", sessionId == null ? null : sessionId.toString());
        Long sentAt;
        try {
            // tenant_id is stamped by the trigger. Append-only: never updated.
            sentAt = jdbc.queryForObject("""
                    INSERT INTO nudge_log (id, trainer_id, client_id, reason, template, channel,
                                           package_id, session_id, message)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :reason, :template, 'whatsapp_manual',
                            :pid::uuid, :sid::uuid, :message)
                    RETURNING (extract(epoch FROM sent_at) * 1000)::bigint
                    """, p, Long.class);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();   // an id taken by a row this trainer cannot see
        }
        log.info("nudge drafted trainer={} client={} template={}", trainerId, clientId, template);
        return new Drafted(new Draft((String) p.get("id"), message, link(phone, clientName(client), message),
                sentAt == null ? System.currentTimeMillis() : sentAt), true);
    }

    /** The trainer's own wording if they have one, else the built-in (nudge_template is an override). */
    private String overrideFor(UUID trainerId, String template) {
        List<String> rows = jdbc.queryForList(
                "SELECT body FROM nudge_template WHERE trainer_id = :tid::uuid AND template = :t",
                Map.of("tid", trainerId.toString(), "t", template), String.class);
        if (!rows.isEmpty()) return rows.getFirst();
        var t = NudgeTemplateCatalog.find(template);
        return t != null ? t.body() : NudgeTemplateCatalog.FALLBACK_BODY;
    }

    /**
     * Every variable this template could use, read from v1 tables. One count per
     * template, so {@code {count}} can never mean two things in one message.
     */
    private Map<String, String> variables(Map<String, Object> p, String template, UUID packageId,
                                          String clientName, String trainerName) {
        var vars = new HashMap<String, String>();
        vars.put("{name}", first(clientName, "there"));
        vars.put("{trainer}", first(trainerName, "your trainer"));
        switch (template) {
            case "renewal" -> {
                var pack = pack(p, packageId, false);
                int left = pack == null || pack.sessionsRemaining() == null ? 0 : pack.sessionsRemaining();
                vars.put("{count}", String.valueOf(left));
                vars.put("{nth}", NudgeService.ordinal(left));
                vars.put("{package}", pack == null ? "pack" : pack.name());
            }
            case "payment_reminder" -> {
                // The named package's amountDue, else everything the client owes —
                // the same ledger L5 and the money card read.
                var owed = owing(p, packageId);
                vars.put("{amount}", NudgeService.rupees(owed.amount()));
                vars.put("{package}", owed.packageName());
                vars.put("{days}", String.valueOf(owed.days()));
                vars.put("{count}", String.valueOf(owed.days()));
            }
            case "missed_session" -> {
                Integer n = jdbc.queryForObject("""
                        SELECT count(*)::int FROM scheduled_session
                        WHERE client_id = :cid::uuid AND status = 'no_show' AND deleted_at IS NULL
                          AND scheduled_at >= now() - interval '30 days'
                        """, p, Integer.class);
                vars.put("{count}", String.valueOf(n == null ? 0 : n));
                vars.put("{nth}", NudgeService.ordinal(n == null ? 0 : n));
            }
            case "well_done" -> {
                // The count L3's stats.sessionsDone reports, so the message says
                // the number on the row the trainer pressed.
                Integer n = jdbc.queryForObject("""
                        SELECT count(*)::int FROM scheduled_session
                        WHERE client_id = :cid::uuid AND status = 'done' AND deleted_at IS NULL
                        """, p, Integer.class);
                vars.put("{count}", String.valueOf(n == null ? 0 : n));
                vars.put("{nth}", NudgeService.ordinal(n == null ? 0 : n));
            }
            case "check_in" -> {
                Integer days = jdbc.queryForObject("""
                        SELECT (:today - max((scheduled_at AT TIME ZONE :tz)::date))::int FROM scheduled_session
                        WHERE client_id = :cid::uuid AND status = 'done' AND deleted_at IS NULL
                        """, p, Integer.class);
                // Nothing ever delivered: a word, not "0 days", which would be a lie.
                vars.put("{days}", days == null ? "a few" : String.valueOf(days));
            }
            default -> { /* session_reminder: name and trainer only */ }
        }
        return vars;
    }

    private PackageReadService.CurrentPackage pack(Map<String, Object> p, UUID packageId, boolean owingOnly) {
        var trainer = UUID.fromString((String) p.get("tid"));
        if (packageId != null) return packages.one(trainer, packageId).orElse(null);
        return packages.list(trainer, true, UUID.fromString((String) p.get("cid"))).stream()
                .filter(k -> owingOnly ? new BigDecimal(k.amountDue()).signum() > 0 : "active".equals(k.status()))
                .findFirst().orElse(null);
    }

    private record Owed(BigDecimal amount, String packageName, int days) {}

    private Owed owing(Map<String, Object> p, UUID packageId) {
        var trainer = UUID.fromString((String) p.get("tid"));
        List<PackageReadService.CurrentPackage> owing = packageId != null
                ? packages.one(trainer, packageId).stream().toList()
                : packages.list(trainer, true, UUID.fromString((String) p.get("cid"))).stream()
                        .filter(k -> new BigDecimal(k.amountDue()).signum() > 0).toList();
        BigDecimal total = owing.stream().map(k -> new BigDecimal(k.amountDue())).reduce(BigDecimal.ZERO, BigDecimal::add);
        String name = owing.size() == 1 ? owing.getFirst().name() : "pack";
        // How long it has been outstanding: from the earliest due date still owed.
        int days = owing.stream().map(PackageReadService.CurrentPackage::dueDate)
                .filter(d -> d != null)
                .map(d -> (int) Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(
                        java.time.LocalDate.parse(d), ((java.sql.Date) p.get("today")).toLocalDate())))
                .max(Integer::compare).orElse(0);
        return new Owed(total, name, days);
    }

    private static String clientName(Map<String, Object> client) {
        return (String) client.get("name");
    }

    private static String link(String phone, String clientName, String message) {
        if (phone == null) throw ApiException.conflict("CLIENT_NO_PHONE", clientName + " has no phone number on file.");
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
    }

    /** E.164 without the plus, as wa.me wants; ten Indian digits get their 91. Null if unusable. */
    private static String waNumber(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 10) return "91" + digits;
        if (digits.length() >= 11 && digits.length() <= 15) return digits;
        return null;
    }

    private static String first(String full, String fallback) {
        if (full == null || full.isBlank()) return fallback;
        return full.trim().split("\\s+")[0];
    }

    private static UUID uuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}
