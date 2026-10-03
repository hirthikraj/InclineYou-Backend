package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientSummary;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on the {@code client} row: create and patch, the state verbs' writes
 * to the client and its packages, and the roster reads (the L3 summary and the
 * pre-v1 legacy row). Sessions and slots are {@link ClientScheduleJdbcRepository}'s;
 * notes are {@link ClientNoteJdbcRepository}'s.
 *
 * <p>No {@code tenant_id} anywhere: RLS scopes the reads and {@code stamp_tenant_id}
 * stamps the writes (TENANCY.md). A {@code DuplicateKeyException} is left to the
 * caller, which knows which constraint means what.
 */
@Repository
@RequiredArgsConstructor
public class ClientJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The client row a PATCH decides on, locked. */
    public record PatchTarget(String phone, String version) {}

    /** A running pack and what is still owed on it. */
    public record OpenPackage(String id, BigDecimal due) {}

    /** The client's own fields the file header draws beside the summary. */
    public record OwnFields(String dateOfBirth, BigDecimal heightCm, String activityLevel, String goal) {}

    // ── ownership ──────────────────────────────────────────────────────────────

    /** Whose client this id is, in any state, deleted included — what an id replay checks. */
    public Optional<UUID> ownerOf(UUID clientId) {
        return jdbc.queryForList("SELECT trainer_id::text FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), String.class).stream().findFirst().map(UUID::fromString);
    }

    public boolean isOwned(UUID trainerId, UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, params(trainerId, clientId), Boolean.class));
    }

    // ── create and patch ───────────────────────────────────────────────────────

    /** tenant_id is stamp_tenant_id's; the client_schedule row is ensure_client_schedule's. */
    public void insert(UUID id, UUID trainerId, CreateClientRequest req) {
        var p = params(trainerId, id);
        p.put("name", req.name());
        p.put("phone", req.phone());
        p.put("dob", req.dateOfBirth() == null ? null : Date.valueOf(req.dateOfBirth()));
        p.put("type", req.clientType());
        p.put("status", req.status());
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, date_of_birth, client_type, status)
                VALUES (:cid::uuid, :tid::uuid, :name, :phone, :dob, :type, :status)
                """, p);
    }

    public Optional<PatchTarget> lockForPatch(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT phone, updated_at FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL FOR UPDATE
                """, params(trainerId, clientId), (rs, i) -> new PatchTarget(rs.getString("phone"),
                String.valueOf(rs.getTimestamp("updated_at").getTime()))).stream().findFirst();
    }

    /** Only the fields that were sent; the caller has refused an empty patch. */
    public void update(UUID clientId, UpdateClientRequest req) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        var sets = new StringBuilder();
        set(sets, p, "name", "name", req.name());
        set(sets, p, "phone", "phone", req.phone());
        if (req.dateOfBirth() != null) {
            LocalDate dob = req.dateOfBirth().value();
            p.put("dob", dob == null ? null : Date.valueOf(dob));
            sets.append(", date_of_birth = :dob");
        }
        set(sets, p, "client_type", "type", req.clientType());
        set(sets, p, "goal", "goal", req.goal());
        set(sets, p, "height_cm", "height", req.heightCm());
        set(sets, p, "activity_level", "activity", req.activityLevel());
        jdbc.update("UPDATE client SET " + sets.substring(2) + " WHERE id = :cid::uuid", p);
    }

    private static void set(StringBuilder sets, Map<String, Object> p, String column, String param, Patch<?> field) {
        if (field == null) return;
        p.put(param, field.value());
        sets.append(", ").append(column).append(" = :").append(param);
    }

    // ── the state verbs ────────────────────────────────────────────────────────

    public void pause(UUID clientId, LocalDate until) {
        jdbc.update("""
                UPDATE client SET status = 'paused', paused_at = now(), paused_until = :until
                WHERE id = :cid::uuid
                """, until(clientId, until));
    }

    public void setPausedUntil(UUID clientId, LocalDate until) {
        jdbc.update("UPDATE client SET paused_until = :until WHERE id = :cid::uuid", until(clientId, until));
    }

    /**
     * Every running pack stops its clock with the client (R19). The adjustment's
     * trigger sets package.paused_at; resume measures the days.
     */
    public int pausePackages(UUID clientId, String reason) {
        return jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, reason)
                SELECT trainer_id, id, client_id, 'pause', :reason FROM package
                WHERE client_id = :cid::uuid AND status = 'active' AND paused_at IS NULL AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "reason", reason));
    }

    public void resume(UUID clientId) {
        jdbc.update("""
                UPDATE client SET status = 'active', paused_at = NULL, paused_until = NULL WHERE id = :cid::uuid
                """, Map.of("cid", clientId.toString()));
    }

    /** Only the packs this client's pause stopped: one paused on its own stays paused. */
    public int resumePackages(UUID clientId, String reason) {
        return jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind)
                SELECT k.trainer_id, k.id, k.client_id, 'resume' FROM package k
                WHERE k.client_id = :cid::uuid AND k.status = 'active' AND k.paused_at IS NOT NULL AND k.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM package_adjustment a
                              WHERE a.package_id = k.id AND a.kind = 'pause' AND a.reason = :reason
                                AND a.effective_at >= k.paused_at)
                """, Map.of("cid", clientId.toString(), "reason", reason));
    }

    public void archive(UUID clientId, String reason, String note) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("reason", reason);
        p.put("note", note);
        jdbc.update("""
                UPDATE client SET status = 'archived', archived_at = now(), archive_reason = :reason, archive_note = :note,
                       paused_at = NULL, paused_until = NULL, membership_status = 'removed', removed_at = now()
                WHERE id = :cid::uuid
                """, p);
    }

    public List<OpenPackage> activePackages(UUID clientId) {
        return jdbc.query("""
                SELECT k.id::text AS id,
                       k.amount - coalesce((SELECT sum(y.amount) FROM payment y WHERE y.package_id = k.id
                                            AND y.deleted_at IS NULL AND y.status IN ('paid', 'write_off')), 0) AS due
                FROM package k WHERE k.client_id = :cid::uuid AND k.status = 'active' AND k.deleted_at IS NULL
                """, Map.of("cid", clientId.toString()),
                (rs, i) -> new OpenPackage(rs.getString("id"), rs.getBigDecimal("due")));
    }

    public void closePackages(List<String> packageIds) {
        if (packageIds.isEmpty()) return;
        jdbc.update("""
                UPDATE package SET status = 'cancelled', closed_at = now() WHERE id = ANY(CAST(:close AS uuid[]))
                """, Map.of("close", packageIds.toArray(String[]::new)));
    }

    /**
     * The irreversible verb, and not the hard delete its own copy warns the
     * trainer about: {@code deleted_at} is the same tombstone every soft
     * delete in this schema uses, so this row — and the payments and packages
     * that point at it — survive for the money book and for GST records.
     * {@code uq_client_phone_live} already excludes {@code deleted_at IS NOT
     * NULL}, so the number needs no separate release. What IS cleared is the
     * contact surface nothing reads historically: {@code name} stays,
     * because {@code PAYMENT_SELECT} reads it straight off this row for every
     * past payment, and blanking it would blank the trainer's own ledger, not
     * just this client's file. {@code status} and its pause/archive columns
     * are left exactly as they were — {@code client_status_dates} ties them
     * together, and touching one without the other would fail that check.
     */
    public void delete(UUID clientId) {
        jdbc.update("""
                UPDATE client SET deleted_at = now(), phone = NULL, date_of_birth = NULL, goal = NULL,
                       height_cm = NULL, activity_level = NULL, metadata = NULL,
                       membership_status = 'removed', removed_at = now()
                WHERE id = :cid::uuid
                """, Map.of("cid", clientId.toString()));
    }

    /** Throws DuplicateKeyException when uq_client_phone_live says the number was taken meanwhile. */
    public void unarchive(UUID clientId) {
        jdbc.update("""
                UPDATE client SET status = 'active', archived_at = NULL, archive_reason = NULL, archive_note = NULL,
                       membership_status = 'not_invited', removed_at = NULL
                WHERE id = :cid::uuid
                """, Map.of("cid", clientId.toString()));
    }

    // ── the client file ────────────────────────────────────────────────────────

    public OwnFields ownFields(UUID clientId) {
        return jdbc.queryForObject("""
                SELECT date_of_birth::text AS dob, height_cm, activity_level, goal FROM client WHERE id = :cid::uuid
                """, Map.of("cid", clientId.toString()), (rs, i) -> new OwnFields(rs.getString("dob"),
                rs.getBigDecimal("height_cm"), rs.getString("activity_level"), rs.getString("goal")));
    }

    // ── the L3 summary ─────────────────────────────────────────────────────────

    private static final ClientSummary.Stats NO_SESSIONS = new ClientSummary.Stats(0, null, null, 0);
    private static final ClientSummary.Schedule NO_SCHEDULE = new ClientSummary.Schedule(null, null, null, null);

    /**
     * Every client with their schedule, recurring slots, the one active program and
     * four session aggregates, in three queries whatever the roster size.
     *
     * @param clientId null for the roster; one id folds into every predicate, so one
     *                 client costs one client's rows
     */
    public List<ClientSummary> summaries(UUID trainerId, List<String> statuses, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("statuses", statuses);
        p.put("cid", clientId == null ? null : clientId.toString());

        var slots = slotsByClient(p);
        var stats = statsByClient(p);

        return jdbc.query("""
                SELECT c.id::text AS id, c.name, c.phone, c.status, c.paused_at, c.paused_until::text AS paused_until,
                       c.archived_at, c.archive_reason, c.archive_note, c.created_at, c.updated_at,
                       c.membership_status, c.client_type,
                       EXISTS (SELECT 1 FROM client_note n
                               WHERE n.client_id = c.id AND n.pinned AND n.deleted_at IS NULL) AS has_pinned_note,
                       cs.client_id IS NOT NULL AS has_schedule,
                       cs.sessions_per_week, cs.session_duration_minutes, cs.delivery_mode,
                       cs.updated_at AS schedule_updated_at,
                       p.id::text AS program_id, p.name AS program_name, p.weeks, p.days,
                       p.start_date::text AS start_date, p.end_date::text AS end_date
                FROM client c
                LEFT JOIN client_schedule cs ON cs.client_id = c.id
                -- uq_program_client_active guarantees at most one row here.
                LEFT JOIN program p ON p.client_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL
                WHERE c.trainer_id = :tid::uuid AND c.deleted_at IS NULL AND c.status IN (:statuses)
                  AND (CAST(:cid AS uuid) IS NULL OR c.id = CAST(:cid AS uuid))
                ORDER BY lower(c.name), c.id
                """, p, (rs, i) -> {
            String id = rs.getString("id");
            return new ClientSummary(
                    id,
                    rs.getString("name"),
                    rs.getString("phone"),
                    rs.getString("status"),
                    epochOrNull(rs.getTimestamp("paused_at")),
                    rs.getString("paused_until"),
                    epochOrNull(rs.getTimestamp("archived_at")),
                    rs.getString("archive_reason"),
                    rs.getString("archive_note"),
                    rs.getString("membership_status"),
                    rs.getString("client_type"),
                    rs.getBoolean("has_pinned_note"),
                    // Never null on the wire: ensure_client_schedule gives every
                    // client a row, and a missing one (it cannot happen, but a
                    // hand-edited database can) draws as a schedule never set.
                    rs.getBoolean("has_schedule")
                            ? new ClientSummary.Schedule(intOrNull(rs, "sessions_per_week"),
                                                         intOrNull(rs, "session_duration_minutes"),
                                                         rs.getString("delivery_mode"),
                                                         String.valueOf(rs.getTimestamp("schedule_updated_at").getTime()))
                            : NO_SCHEDULE,
                    slots.getOrDefault(id, List.of()),
                    rs.getString("program_id") == null ? null
                            : new ClientSummary.Program(rs.getString("program_id"), rs.getString("program_name"),
                                                        rs.getInt("weeks"), rs.getInt("days"),
                                                        rs.getString("start_date"), rs.getString("end_date")),
                    stats.getOrDefault(id, NO_SESSIONS),
                    rs.getTimestamp("created_at").getTime(),
                    String.valueOf(rs.getTimestamp("updated_at").getTime()));
        });
    }

    private Map<String, List<ClientSummary.Slot>> slotsByClient(Map<String, Object> p) {
        var out = new HashMap<String, List<ClientSummary.Slot>>();
        jdbc.query("""
                SELECT s.client_id::text AS client_id, s.id::text AS id, s.weekday,
                       to_char(s.start_time, 'HH24:MI') AS start_hm, s.program_day, s.duration_minutes, s.delivery_mode
                FROM client_schedule_slot s
                JOIN client c ON c.id = s.client_id
                WHERE c.trainer_id = :tid::uuid AND c.deleted_at IS NULL AND c.status IN (:statuses)
                  AND (CAST(:cid AS uuid) IS NULL OR c.id = CAST(:cid AS uuid))
                  AND s.deleted_at IS NULL
                ORDER BY s.weekday, s.start_time, s.id
                """, p, rs -> {
            out.computeIfAbsent(rs.getString("client_id"), k -> new ArrayList<>()).add(new ClientSummary.Slot(
                    rs.getString("id"), rs.getInt("weekday"), rs.getString("start_hm"),
                    intOrNull(rs, "program_day"), intOrNull(rs, "duration_minutes"), rs.getString("delivery_mode")));
        });
        return out;
    }

    /**
     * One grouped pass over the roster's sessions, on idx_scheduled_session_client.
     *
     * <p>Filtered by the CLIENT being this trainer's, not by the session's
     * {@code trainer_id}: a reassigned client's logged sessions keep their original
     * coach, and "sessions done" is about the client's history, not about who ran
     * each one.
     *
     * <p>The streak counts no-shows from the newest settled session backwards and
     * stops at the first delivered one. Cancelled sessions and past sessions nobody
     * marked are not settled and say nothing either way, so they are left out.
     */
    private Map<String, ClientSummary.Stats> statsByClient(Map<String, Object> p) {
        var out = new HashMap<String, ClientSummary.Stats>();
        jdbc.query("""
                WITH roster AS (
                    SELECT id FROM client
                    WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status IN (:statuses)
                      AND (CAST(:cid AS uuid) IS NULL OR id = CAST(:cid AS uuid))
                ),
                agg AS (
                    SELECT s.client_id,
                           count(*) FILTER (WHERE s.status = 'done') AS done,
                           max(s.scheduled_at) FILTER (WHERE s.status = 'done') AS last_done,
                           min(s.scheduled_at) FILTER (WHERE s.status = 'scheduled' AND s.scheduled_at >= now()) AS next_at
                    FROM scheduled_session s
                    WHERE s.client_id IN (SELECT id FROM roster) AND s.deleted_at IS NULL
                    GROUP BY s.client_id
                ),
                settled AS (
                    SELECT s.client_id, s.status,
                           count(*) FILTER (WHERE s.status = 'done')
                               OVER (PARTITION BY s.client_id ORDER BY s.scheduled_at DESC, s.id DESC) AS done_since
                    FROM scheduled_session s
                    WHERE s.client_id IN (SELECT id FROM roster) AND s.deleted_at IS NULL
                      AND s.status IN ('done', 'no_show') AND s.scheduled_at < now()
                ),
                streak AS (
                    SELECT client_id, count(*) AS missed FROM settled WHERE done_since = 0 GROUP BY client_id
                )
                SELECT a.client_id::text AS client_id, a.done, a.last_done, a.next_at,
                       coalesce(st.missed, 0) AS missed
                FROM agg a LEFT JOIN streak st ON st.client_id = a.client_id
                """, p, rs -> {
            out.put(rs.getString("client_id"), new ClientSummary.Stats(
                    rs.getInt("done"),
                    epochOrNull(rs.getTimestamp("last_done")),
                    epochOrNull(rs.getTimestamp("next_at")),
                    rs.getInt("missed")));
        });
        return out;
    }


    // ── helpers ────────────────────────────────────────────────────────────────

    static Map<String, Object> params(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        return p;
    }

    /** {@code Map.of} refuses nulls, and an open-ended pause is one. */
    private static Map<String, Object> until(UUID clientId, LocalDate until) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("until", until == null ? null : Date.valueOf(until));
        return p;
    }

    static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }
}
