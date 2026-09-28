package com.inclineyou.inclineyou_backend.client;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/clients[?view=summary]} — api-contract Today L3, reused by Clients.
 * Since 1.1 this is the default shape of {@code GET /v1/clients}; the pre-v1 one
 * is {@code view=legacy} until the screens still reading it move over.
 *
 * <p>Every client with their schedule, recurring slots, the one active program and
 * four session aggregates, in three queries whatever the roster size. It replaces
 * the old screen's {@code GET /v1/programs} and, more importantly, the unbounded
 * {@code GET /v1/workouts}: <i>gone quiet</i> and <i>100th session</i> need only
 * the last delivered session and the count, so the server sends those two numbers
 * rather than the whole history.
 */
@Service
@RequiredArgsConstructor
public class ClientSummaryService {

    private final NamedParameterJdbcTemplate jdbc;

    /** Archived is left out unless asked for — Today has no use for them, Clients counts them. */
    private static final List<String> DEFAULT_STATUSES = List.of("active", "paused", "inactive");
    private static final Set<String> STATUSES = Set.of("active", "paused", "inactive", "archived");

    /**
     * @param version opaque — {@code client_schedule.updated_at} as epoch ms, the
     *                {@code If-Match} value for {@code PUT /v1/clients/{id}/schedule}
     */
    public record Schedule(Integer sessionsPerWeek, Integer sessionDurationMinutes, String deliveryMode,
                           String version) {}

    /** @param programDay the program day this slot books (V2, R45); null = the sequence rule */
    public record Slot(String id, int weekday, String start, Integer programDay, Integer durationMinutes,
                       String deliveryMode) {}

    public record Program(String id, String name, int weeks, int days, String startDate, String endDate) {}

    /**
     * @param lastDoneAt    epoch ms of the newest delivered session, null if none
     * @param nextSessionAt epoch ms of the soonest booked session still to come
     * @param missedStreak  consecutive no-shows among the newest settled sessions
     */
    public record Stats(int sessionsDone, Long lastDoneAt, Long nextSessionAt, int missedStreak) {}

    public record ClientSummary(
            String id,
            String name,
            String phone,
            String status,
            /** Epoch ms; set while paused. */
            Long pausedAt,
            String pausedUntil,
            /** Epoch ms and the reason, set while archived — the Archived list reads them. */
            Long archivedAt,
            String archiveReason,
            String archiveNote,
            String membershipStatus,
            String clientType,
            boolean hasPinnedNote,
            Schedule schedule,
            List<Slot> slots,
            Program program,
            Stats stats,
            long createdAt,
            /** {@code client.updated_at} as epoch ms — If-Match for {@code PATCH /v1/clients/{id}}. */
            String version
    ) {}

    private static final Stats NO_SESSIONS = new Stats(0, null, null, 0);
    private static final Schedule NO_SCHEDULE = new Schedule(null, null, null, null);

    /**
     * @param status comma list of client statuses, or {@code all}. Unknown names
     *               are ignored; a list of only unknown names falls back to the
     *               default rather than answering an empty roster for a typo.
     */
    public List<ClientSummary> list(UUID trainerId, String status) {
        return query(trainerId, statuses(status), null);
    }

    /** One client in the L3 shape, whatever their status — what every Clients write answers with. */
    public java.util.Optional<ClientSummary> one(UUID trainerId, UUID clientId) {
        return query(trainerId, List.copyOf(STATUSES), clientId).stream().findFirst();
    }

    private List<ClientSummary> query(UUID trainerId, List<String> statuses, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("statuses", statuses);
        // Folded into every roster predicate below, so one client costs one client's rows.
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
                            ? new Schedule(intOrNull(rs, "sessions_per_week"),
                                           intOrNull(rs, "session_duration_minutes"),
                                           rs.getString("delivery_mode"),
                                           String.valueOf(rs.getTimestamp("schedule_updated_at").getTime()))
                            : NO_SCHEDULE,
                    slots.getOrDefault(id, List.of()),
                    rs.getString("program_id") == null ? null
                            : new Program(rs.getString("program_id"), rs.getString("program_name"),
                                          rs.getInt("weeks"), rs.getInt("days"),
                                          rs.getString("start_date"), rs.getString("end_date")),
                    stats.getOrDefault(id, NO_SESSIONS),
                    rs.getTimestamp("created_at").getTime(),
                    String.valueOf(rs.getTimestamp("updated_at").getTime()));
        });
    }

    private Map<String, List<Slot>> slotsByClient(Map<String, Object> p) {
        var out = new HashMap<String, List<Slot>>();
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
            out.computeIfAbsent(rs.getString("client_id"), k -> new ArrayList<>()).add(new Slot(
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
    private Map<String, Stats> statsByClient(Map<String, Object> p) {
        var out = new HashMap<String, Stats>();
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
            out.put(rs.getString("client_id"), new Stats(
                    rs.getInt("done"),
                    epochOrNull(rs.getTimestamp("last_done")),
                    epochOrNull(rs.getTimestamp("next_at")),
                    rs.getInt("missed")));
        });
        return out;
    }

    private List<String> statuses(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_STATUSES;
        if ("all".equalsIgnoreCase(raw.strip())) return List.copyOf(STATUSES);
        var wanted = new LinkedHashSet<String>();
        for (String s : raw.split(",")) if (STATUSES.contains(s.strip())) wanted.add(s.strip());
        return wanted.isEmpty() ? DEFAULT_STATUSES : List.copyOf(wanted);
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }
}
