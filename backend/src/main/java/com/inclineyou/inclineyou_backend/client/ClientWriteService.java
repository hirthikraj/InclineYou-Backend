package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * api-contract 1.1 Clients A4–A6: the phone check, {@code POST /v1/clients} and
 * {@code PATCH /v1/clients/{id}}. Every answer is the L3 summary row, so the add
 * flow and the roster read one shape.
 *
 * <p>Bodies are maps, not records: the wire rejects unknown keys (400), and a
 * PATCH has to tell an absent key (leave it) from a null (clear it).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientWriteService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ClientPhoneGuard phoneGuard;
    private final ClientSummaryService summaries;
    private final WorkspaceClock clock;

    private static final Set<String> CREATE_KEYS = Set.of("id", "name", "phone", "dateOfBirth", "clientType", "schedule");
    private static final Set<String> SCHEDULE_KEYS = Set.of("deliveryMode", "sessionDurationMinutes", "sessionsPerWeek");
    private static final Set<String> PATCH_KEYS =
            Set.of("name", "phone", "dateOfBirth", "clientType", "goal", "heightCm", "activityLevel");
    private static final Set<String> CLIENT_TYPES = Set.of("independent", "gym");
    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    private static final Set<String> ACTIVITY = Set.of("sedentary", "light", "moderate", "active", "very_active");

    /** The row and whether this call made it (201) or a replay found it (200). */
    public record Created(ClientSummaryService.ClientSummary client, boolean created) {}

    public ClientPhoneGuard.Verdict phoneCheck(UUID trainerId, Map<String, Object> body) {
        if (body == null || !(body.get("phone") instanceof String phone) || phone.isBlank()) {
            throw ApiException.validation("phone: required");
        }
        for (String key : body.keySet()) if (!"phone".equals(key)) throw unknown(key);
        return phoneGuard.check(trainerId.toString(), phone.strip(), true);
    }

    @Transactional
    public Created create(UUID trainerId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("body: required");
        for (String key : body.keySet()) if (!CREATE_KEYS.contains(key)) throw unknown(key);
        UUID id = uuid(body.get("id"), "id");
        String name = name(body.get("name"));
        String phone = phone(body.get("phone"));
        LocalDate dob = birthDate(body.get("dateOfBirth"));
        if (!(body.get("clientType") instanceof String type) || !CLIENT_TYPES.contains(type)) {
            throw ApiException.validation("clientType: independent or gym, required");
        }
        Map<String, Object> schedule = schedule(body.get("schedule"));

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        if (id != null) {
            var replay = replay(trainerId, id);
            if (replay != null) return new Created(replay, false);
        }
        requirePhone(trainerId, phone);

        p.put("name", name);
        p.put("phone", phone);
        p.put("dob", dob == null ? null : Date.valueOf(dob));
        p.put("type", type);
        try {
            // tenant_id is stamp_tenant_id's; the client_schedule row is ensure_client_schedule's.
            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, phone, date_of_birth, client_type)
                    VALUES (:id::uuid, :tid::uuid, :name, :phone, :dob, :type)
                    """, p);
        } catch (DuplicateKeyException e) {
            throw duplicate(trainerId, phone, e);
        }
        if (schedule != null) {
            p.putAll(schedule);
            jdbc.update("""
                    UPDATE client_schedule SET delivery_mode = :deliveryMode,
                           session_duration_minutes = :sessionDurationMinutes, sessions_per_week = :sessionsPerWeek
                    WHERE client_id = :id::uuid
                    """, p);
        }
        UUID cid = UUID.fromString((String) p.get("id"));
        log.info("client created trainer={} client={} type={}", trainerId, cid, type);
        return new Created(summaries.one(trainerId, cid).orElseThrow(), true);
    }

    @Transactional
    public ClientSummaryService.ClientSummary patch(UUID trainerId, UUID clientId, Map<String, Object> body,
                                                     String ifMatch) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: send at least one field");
        for (String key : body.keySet()) {
            if ("status".equals(key)) throw ApiException.validation("status: use pause, resume, archive or unarchive");
            if (!PATCH_KEYS.contains(key)) throw unknown(key);
        }
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        var rows = jdbc.queryForList("""
                SELECT phone, updated_at FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL FOR UPDATE
                """, p);
        if (rows.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        var row = rows.getFirst();
        checkVersion(ifMatch, String.valueOf(((java.sql.Timestamp) row.get("updated_at")).getTime()));

        var sets = new StringBuilder();
        if (body.containsKey("name")) { p.put("name", name(body.get("name"))); sets.append(", name = :name"); }
        if (body.containsKey("phone")) {
            String phone = phone(body.get("phone"));
            // Only when it moves: re-saving an accepted number never starts failing.
            if (phone != null && !phone.equals(row.get("phone"))) requirePhone(trainerId, phone);
            p.put("phone", phone);
            sets.append(", phone = :phone");
        }
        if (body.containsKey("dateOfBirth")) {
            LocalDate dob = birthDate(body.get("dateOfBirth"));
            p.put("dob", dob == null ? null : Date.valueOf(dob));
            sets.append(", date_of_birth = :dob");
        }
        if (body.containsKey("clientType")) {
            if (!(body.get("clientType") instanceof String t) || !CLIENT_TYPES.contains(t)) {
                throw ApiException.validation("clientType: independent or gym");
            }
            p.put("type", t);
            sets.append(", client_type = :type");
        }
        if (body.containsKey("goal")) {
            Object g = body.get("goal");
            if (g != null && !(g instanceof String)) throw ApiException.validation("goal: text or null");
            String goal = g == null || ((String) g).isBlank() ? null : ((String) g).strip();
            if (goal != null && goal.length() > 1000) throw ApiException.validation("goal: at most 1000 characters");
            p.put("goal", goal);
            sets.append(", goal = :goal");
        }
        if (body.containsKey("heightCm")) {
            Object h = body.get("heightCm");
            if (h != null && !(h instanceof Number)) throw ApiException.validation("heightCm: a number or null");
            BigDecimal height = h == null ? null : new BigDecimal(h.toString());
            if (height != null && (height.doubleValue() < 50 || height.doubleValue() > 250)) {
                throw ApiException.validation("heightCm: between 50 and 250");
            }
            p.put("height", height);
            sets.append(", height_cm = :height");
        }
        if (body.containsKey("activityLevel")) {
            Object a = body.get("activityLevel");
            if (a != null && !(a instanceof String s && ACTIVITY.contains(s))) {
                throw ApiException.validation("activityLevel: sedentary, light, moderate, active, very_active or null");
            }
            p.put("activity", a);
            sets.append(", activity_level = :activity");
        }
        try {
            jdbc.update("UPDATE client SET " + sets.substring(2) + " WHERE id = :cid::uuid", p);
        } catch (DuplicateKeyException e) {
            throw duplicate(trainerId, (String) p.get("phone"), e);
        }
        return summaries.one(trainerId, clientId).orElseThrow();
    }

    /** Optional If-Match on a PATCH: honoured when sent, 412 when stale. */
    static void checkVersion(String ifMatch, String version) {
        if (ifMatch == null || ifMatch.isBlank() || "*".equals(ifMatch.strip())) return;
        String want = ifMatch.strip().replaceFirst("^W/", "").replace("\"", "");
        if (!want.equals(version)) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This client changed since you opened it.");
        }
    }

    /** A replay of this trainer's own id answers the row; the id anywhere else is a clash. */
    private ClientSummaryService.ClientSummary replay(UUID trainerId, UUID id) {
        var owner = jdbc.queryForList("SELECT trainer_id::text FROM client WHERE id = :id::uuid",
                Map.of("id", id.toString()), String.class);
        if (owner.isEmpty()) return null;
        if (!trainerId.toString().equals(owner.getFirst())) throw ApiException.idConflict();
        return summaries.one(trainerId, id).orElseThrow(ApiException::idConflict);
    }

    private void requirePhone(UUID trainerId, String phone) {
        var verdict = phoneGuard.check(trainerId.toString(), phone);
        if (verdict.available()) return;
        if (ClientPhoneGuard.CODE_INVALID.equals(verdict.code())) throw ApiException.validation("phone: " + verdict.message());
        throw new PhoneUnavailableException(verdict.code(), verdict.message());
    }

    /** A check isn't a lock: two adds racing for one number meet uq_client_phone_live here. */
    private RuntimeException duplicate(UUID trainerId, String phone, DuplicateKeyException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        if (!msg.contains("uq_client_phone_live")) return ApiException.idConflict();
        var verdict = phoneGuard.check(trainerId.toString(), phone);
        return verdict.available()
                ? new PhoneUnavailableException(ClientPhoneGuard.CODE_OTHER_ROSTER, "This number was just added to a roster.")
                : new PhoneUnavailableException(verdict.code(), verdict.message());
    }

    private static String name(Object raw) {
        if (!(raw instanceof String s) || s.isBlank()) throw ApiException.validation("name: required");
        String name = s.strip();
        if (name.length() > 100) throw ApiException.validation("name: at most 100 characters");
        return name;
    }

    /** Null or blank is no number; anything else must be E.164 (client_phone_format). */
    private static String phone(Object raw) {
        if (raw == null || raw instanceof String s && s.isBlank()) return null;
        if (!(raw instanceof String s) || !ClientPhoneGuard.validFormat(s.strip())) {
            throw ApiException.validation("phone: E.164, and an Indian number is +91 and ten digits");
        }
        return s.strip();
    }

    /** 18+ in the workspace's calendar (R20, MUST-22) — 422, since it can never succeed as written. */
    private LocalDate birthDate(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation("dateOfBirth: yyyy-MM-dd or null");
        LocalDate dob = WorkspaceClock.parseDate(s, "dateOfBirth");
        if (dob == null) return null;
        if (dob.isBefore(LocalDate.of(1900, 1, 1))) throw ApiException.validation("dateOfBirth: before 1900");
        if (dob.isAfter(WorkspaceClock.today(clock.zone()).minusYears(18))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CLIENT_UNDER_18",
                    "Clients must be 18 or older.");
        }
        return dob;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> schedule(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof Map<?, ?> m)) throw ApiException.validation("schedule: an object");
        var s = (Map<String, Object>) m;
        for (String key : s.keySet()) if (!SCHEDULE_KEYS.contains(key)) throw unknown("schedule." + key);
        var out = new HashMap<String, Object>();
        Object mode = s.get("deliveryMode");
        if (mode != null && !(mode instanceof String v && MODES.contains(v))) {
            throw ApiException.validation("schedule.deliveryMode: floor, home_visit or remote");
        }
        out.put("deliveryMode", mode);
        out.put("sessionDurationMinutes", whole(s.get("sessionDurationMinutes"), 1, 480, "schedule.sessionDurationMinutes"));
        out.put("sessionsPerWeek", whole(s.get("sessionsPerWeek"), 0, 14, "schedule.sessionsPerWeek"));
        return out;
    }

    static Integer whole(Object raw, int min, int max, String field) {
        if (raw == null) return null;
        if (!(raw instanceof Number n) || n.doubleValue() != n.intValue() || n.intValue() < min || n.intValue() > max) {
            throw ApiException.validation(field + ": a whole number between " + min + " and " + max);
        }
        return n.intValue();
    }

    static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw).strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    static ApiException unknown(String key) {
        return ApiException.validation(key + ": not a field this route takes");
    }
}
