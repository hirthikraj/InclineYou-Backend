package com.inclineyou.inclineyou_backend.session;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The v1 diary writes on {@code scheduled_session} — api-contract *Today*
 * actions. Kept apart from {@link ScheduledSessionService}, which still speaks
 * the pre-v1 schema, so each write moves over as it is rebuilt.
 *
 * <p>There is no {@code workout_session} in v1: a session's log is the session
 * row itself ({@code started_at} / {@code ended_at}), so closing a log is one
 * column on this table.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionWriteService {

    private final NamedParameterJdbcTemplate jdbc;
    /** One transaction per session for {@link #markDone}; see there. */
    private final TransactionTemplate tx;

    /** A batch is the queue's rows for one client; fifty is far past any real one. */
    static final int MAX_BATCH = 50;

    public record SessionIdsRequest(List<String> sessionIds) {}

    /**
     * One session's outcome in a batch close.
     *
     * @param outcome {@code closed} · {@code skipped} · {@code not_found}
     * @param reason  on {@code skipped}: {@code ALREADY_CLOSED} · {@code NOT_STARTED}
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record EndResult(String sessionId, String outcome, String reason) {}

    /** The same {@code results[]} shape as {@link MarkResults} — 1.1 gave the two batch routes one answer. */
    public record EndResults(List<EndResult> results) {}

    /**
     * {@code POST /v1/sessions/end} — close logs left open on sessions that are over.
     *
     * <p>One UPDATE, conditional on the log being open, so a log someone else
     * already closed keeps its time and a double click closes nothing twice. It
     * does not change the session's status: closing a log is not marking the
     * session delivered, and it does not charge the pack.
     *
     * <p>Then one read of the ids the UPDATE did not return, to say why. An id
     * that is not this trainer's comes back {@code not_found} — what a 404 means
     * — so the answer never says whether somebody else's session exists.
     */
    @Transactional
    public EndResults end(UUID trainerId, SessionIdsRequest req) {
        List<UUID> ids = ids(req);
        var p = Map.of("ids", ids, "tid", trainerId.toString());
        var closed = new java.util.HashSet<>(jdbc.queryForList("""
                UPDATE scheduled_session
                SET ended_at = now(), updated_at = now()
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND started_at IS NOT NULL AND ended_at IS NULL
                RETURNING id::text
                """, p, String.class));

        var why = new HashMap<String, String>();
        jdbc.query("""
                SELECT id::text AS id, started_at IS NULL AS never_started
                FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p, rs -> {
            why.put(rs.getString("id"), rs.getBoolean("never_started") ? "NOT_STARTED" : "ALREADY_CLOSED");
        });

        var results = new ArrayList<EndResult>(ids.size());
        for (UUID id : ids) {
            String sid = id.toString();
            if (closed.contains(sid)) results.add(new EndResult(sid, "closed", null));
            else if (why.containsKey(sid)) results.add(new EndResult(sid, "skipped", why.get(sid)));
            else results.add(new EndResult(sid, "not_found", null));
        }
        log.info("logs closed trainer={} closed={} of={}", trainerId, closed.size(), ids.size());
        return new EndResults(results);
    }

    /**
     * One session's outcome in a batch mark.
     *
     * @param outcome  {@code done} (marked, and charged if a pack took it) ·
     *                 {@code already_done} · {@code not_charged} (marked, no pack
     *                 took it — {@code reason} says why) · {@code skipped} (not
     *                 marked — cancelled, or its start time hasn't come) ·
     *                 {@code not_found}
     * @param reason   {@code PACKAGE_PAUSED} · {@code PACKAGE_EMPTY} ·
     *                 {@code NO_PACKAGE} · {@code SESSION_CANCELLED} · {@code SESSION_NOT_STARTED}
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MarkResult(String sessionId, String outcome, String packageId,
                             Integer sessionsRemaining, String reason) {}

    public record MarkResults(List<MarkResult> results) {}

    /**
     * {@code POST /v1/sessions/done} — mark past sessions delivered, charging a
     * pack for each where one should pay.
     *
     * <p>Processed in {@code scheduled_at} order, because the pack is consumed in
     * the order the sessions happened — and answered in request order. <b>Each session is its own transaction</b>, so one
     * refusal cannot roll back the others and the response can honestly say
     * "2 of 3 marked" with the reason for the third.
     *
     * <p>The charge is a {@code package_adjustment(kind = 'session')} row; the
     * database does the rest — {@code apply_package_adjustment} locks the pack
     * and decrements it, refuses a paused or closed pack, and
     * {@code uq_package_adjustment_live_charge} allows one live charge per
     * session. So two tabs marking at once cannot lose a decrement, which is why
     * the browser's one-at-a-time loop can go.
     */
    public MarkResults markDone(UUID trainerId, SessionIdsRequest req) {
        List<UUID> ids = ids(req);
        // Order by when they happened; an id that is not this trainer's sorts
        // last and reports not_found.
        var order = new HashMap<String, Long>();
        jdbc.query("""
                SELECT id::text AS id, scheduled_at FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("ids", ids, "tid", trainerId.toString()),
                rs -> { order.put(rs.getString("id"), rs.getTimestamp("scheduled_at").getTime()); });
        var sorted = new ArrayList<>(ids);
        sorted.sort((a, b) -> Long.compare(order.getOrDefault(a.toString(), Long.MAX_VALUE),
                                           order.getOrDefault(b.toString(), Long.MAX_VALUE)));

        // Charged in the order they happened, ANSWERED in the order asked: one
        // result per id sent, at the same position, so a caller can zip them.
        var byId = new HashMap<UUID, MarkResult>();
        for (UUID id : sorted) byId.put(id, tx.execute(status -> markOne(trainerId, id)));
        var results = ids.stream().map(byId::get).toList();
        log.info("sessions marked trainer={} results={}", trainerId,
                results.stream().map(MarkResult::outcome).toList());
        return new MarkResults(results);
    }

    /**
     * One session, inside the caller's transaction. Also what the single form
     * {@code POST /v1/sessions/{id}/done} is to run, so the two cannot disagree
     * (api-contract Today A4).
     */
    MarkResult markOne(UUID trainerId, UUID sessionId) {
        var p = new HashMap<String, Object>();
        p.put("sid", sessionId.toString());
        p.put("tid", trainerId.toString());

        // The session row is locked first, so a second mark of the same session
        // waits and then reads `done`. The service a pack must match is the
        // session's own mode, else its slot's, else the client's default.
        var rows = jdbc.queryForList("""
                SELECT s.status, s.client_id::text AS client_id, s.scheduled_at > now() AS not_started,
                       coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') AS service
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                FOR UPDATE OF s
                """, p);
        if (rows.isEmpty()) return new MarkResult(sessionId.toString(), "not_found", null, null, null);
        var row = rows.getFirst();
        String status = (String) row.get("status");
        p.put("cid", row.get("client_id"));
        p.put("service", row.get("service"));

        // The charge this session already carries, if any — a no-show that cost
        // a session has one, and one session gets one charge
        // (uq_package_adjustment_live_charge).
        var charge = jdbc.queryForList("""
                SELECT a.package_id::text AS package_id, k.sessions_remaining
                FROM package_adjustment a JOIN package k ON k.id = a.package_id
                WHERE a.session_id = :sid::uuid AND a.kind = 'session' AND a.reversed_at IS NULL
                """, p);

        switch (status) {
            case "done" -> {
                return charge.isEmpty()
                        ? new MarkResult(sessionId.toString(), "already_done", null, null, null)
                        : new MarkResult(sessionId.toString(), "already_done",
                                (String) charge.getFirst().get("package_id"),
                                (Integer) charge.getFirst().get("sessions_remaining"), null);
            }
            case "cancelled" -> { return new MarkResult(sessionId.toString(), "skipped", null, null, "SESSION_CANCELLED"); }
            default -> { /* scheduled or no_show: mark it below */ }
        }
        // A future session can't have been delivered. Checked after `done`, so a
        // session somebody marked early still answers already_done.
        if (Boolean.TRUE.equals(row.get("not_started"))) {
            return new MarkResult(sessionId.toString(), "skipped", null, null, "SESSION_NOT_STARTED");
        }

        // Delivered: and a log left open on it is over too (A4 "closes an open log").
        jdbc.update("""
                UPDATE scheduled_session
                SET status = 'done', updated_at = now(),
                    ended_at = CASE WHEN started_at IS NOT NULL AND ended_at IS NULL THEN now() ELSE ended_at END
                WHERE id = :sid::uuid
                """, p);

        /*
         * Decided 27 Sep (1.1): a no-show can be marked done — the client came
         * after all. If the no-show already cost a session, that charge stands
         * and nothing more is taken.
         */
        if (!charge.isEmpty()) {
            return new MarkResult(sessionId.toString(), "done",
                    (String) charge.getFirst().get("package_id"),
                    (Integer) charge.getFirst().get("sessions_remaining"), null);
        }

        /*
         * Which pack pays: this client's live session pack for the same service
         * (floor, home_visit or remote). A running, unpaused pack with sessions
         * left comes first, and among those the oldest (idx_package_charge), so
         * packs are used up in the order they were sold — a pre-sold second pack
         * waits its turn. If the best candidate is paused or empty the session is
         * still delivered — it just is not charged, and the result says why.
         */
        var packs = jdbc.queryForList("""
                SELECT id::text AS id, sessions_remaining, paused_at IS NOT NULL AS paused
                FROM package
                WHERE client_id = :cid::uuid AND service = :service AND basis = 'sessions'
                  AND status = 'active' AND deleted_at IS NULL
                ORDER BY (paused_at IS NULL AND sessions_remaining > 0) DESC,
                         start_date NULLS LAST, created_at, id
                LIMIT 1
                """, p);
        if (packs.isEmpty()) return new MarkResult(sessionId.toString(), "not_charged", null, null, "NO_PACKAGE");
        var pack = packs.getFirst();
        String packageId = (String) pack.get("id");
        if (Boolean.TRUE.equals(pack.get("paused"))) {
            return new MarkResult(sessionId.toString(), "not_charged", packageId, (Integer) pack.get("sessions_remaining"), "PACKAGE_PAUSED");
        }
        if (((Number) pack.get("sessions_remaining")).intValue() <= 0) {
            return new MarkResult(sessionId.toString(), "not_charged", packageId, 0, "PACKAGE_EMPTY");
        }

        p.put("pid", packageId);
        // tenant_id is stamped by the trigger; the decrement is apply_package_adjustment's.
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'session', -1, :sid::uuid)
                """, p);
        // The charge that uses up the last session closes the pack in the same
        // transaction (1.1, L5): an exhausted pack no longer stays `active` until
        // something else happens to touch it.
        Integer left = jdbc.queryForObject("""
                UPDATE package
                SET status = CASE WHEN sessions_remaining = 0 THEN 'completed' ELSE status END,
                    closed_at = CASE WHEN sessions_remaining = 0 THEN now() ELSE closed_at END
                WHERE id = :pid::uuid
                RETURNING sessions_remaining
                """, p, Integer.class);
        return new MarkResult(sessionId.toString(), "done", packageId, left, null);
    }

    /**
     * 1–50 distinct UUIDs, in the order given; 400 {@code VALIDATION} otherwise. A
     * repeated id is refused rather than folded (1.1): a caller that sent one
     * twice has a bug worth hearing about, and one answer per id sent is what
     * lets it match results to rows by position.
     */
    private static List<UUID> ids(SessionIdsRequest req) {
        if (req == null || req.sessionIds() == null || req.sessionIds().isEmpty()) {
            throw ApiException.validation("sessionIds: at least one id");
        }
        if (req.sessionIds().size() > MAX_BATCH) {
            throw ApiException.validation("sessionIds: at most " + MAX_BATCH + " at once");
        }
        var out = new LinkedHashSet<UUID>();
        for (String raw : req.sessionIds()) {
            UUID id;
            try {
                id = UUID.fromString(raw.strip());
            } catch (IllegalArgumentException | NullPointerException e) {
                throw ApiException.validation("sessionIds: not a session id: " + raw);
            }
            if (!out.add(id)) throw ApiException.validation("sessionIds: " + id + " is repeated");
        }
        return List.copyOf(out);
    }
}
