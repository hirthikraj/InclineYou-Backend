package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.EndResult;
import com.inclineyou.inclineyou_backend.core.session.dto.EndResults;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResult;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResults;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionIdsRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * The v1 diary batch writes on {@code scheduled_session} — api-contract *Today* actions ({@code POST /v1/sessions/end}
 * and {@code /done}); the one-session verbs are {@link SessionStateService}'s.
 *
 * <p>There is no {@code workout_session} in v1: a session's log is the session row itself ({@code started_at} /
 * {@code ended_at}), so closing a log is one column on this table.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionWriteService {

    private final SessionStateJdbcRepository repo;
    private final SessionChargeService charges;
    /** One transaction per session for {@link #markDone}; see there. */
    private final TransactionTemplate tx;

    /** A batch is the queue's rows for one client; fifty is far past any real one. */
    static final int MAX_BATCH = 50;

    /**
     * {@code POST /v1/sessions/end} — close logs left open; the end time is the last set done, else the planned length (16 Nov 2026).
     *
     * <p>One UPDATE, conditional on the log being open (any open log — a running one simply ends), so a log someone else already closed keeps its time and a
     * double click closes nothing twice. It does not change the session's status: closing a log is not marking the
     * session delivered, and it does not charge the pack.
     *
     * <p>Then one read of the ids the UPDATE did not return, to say why. An id that is not this trainer's comes back
     * {@code not_found} — what a 404 means — so the answer never says whether somebody else's session exists.
     */
    @Transactional
    public EndResults end(UUID trainerId, SessionIdsRequest req) {
        List<UUID> ids = ids(req);
        var closed = repo.closeLogs(trainerId, ids);
        var neverStarted = repo.neverStarted(trainerId, ids);

        var results = new ArrayList<EndResult>(ids.size());
        for (UUID id : ids) {
            String sid = id.toString();
            if (closed.contains(sid)) results.add(new EndResult(sid, "closed", null));
            else if (neverStarted.containsKey(sid)) {
                results.add(new EndResult(sid, "skipped", neverStarted.get(sid) ? "NOT_STARTED" : "ALREADY_CLOSED"));
            } else results.add(new EndResult(sid, "not_found", null));
        }
        log.info("logs closed trainer={} closed={} of={}", trainerId, closed.size(), ids.size());
        return new EndResults(results);
    }

    /**
     * {@code POST /v1/sessions/done} — mark past sessions delivered, charging a pack for each where one should pay.
     *
     * <p>Processed in {@code scheduled_at} order, because the pack is consumed in the order the sessions happened — and
     * answered in request order. <b>Each session is its own transaction</b>, so one refusal cannot roll back the others
     * and the response can honestly say "2 of 3 marked" with the reason for the third.
     *
     * <p>The charge is a {@code package_adjustment(kind = 'session')} row; the database does the rest —
     * {@code apply_package_adjustment} locks the pack and decrements it, refuses a paused or closed pack, and
     * {@code uq_package_adjustment_live_charge} allows one live charge per session. So two tabs marking at once cannot
     * lose a decrement, which is why the browser's one-at-a-time loop can go.
     */
    public MarkResults markDone(UUID trainerId, SessionIdsRequest req) {
        List<UUID> ids = ids(req);
        // Order by when they happened; an id that is not this trainer's sorts last and reports not_found.
        var order = repo.scheduledAtOf(trainerId, ids);
        var sorted = new ArrayList<>(ids);
        sorted.sort((a, b) -> Long.compare(order.getOrDefault(a.toString(), Long.MAX_VALUE),
                                           order.getOrDefault(b.toString(), Long.MAX_VALUE)));

        // Charged in the order they happened, ANSWERED in the order asked: one result per id sent, at the same
        // position, so a caller can zip them.
        var byId = new HashMap<UUID, MarkResult>();
        for (UUID id : sorted) byId.put(id, markInItsOwnTransaction(trainerId, id));
        var results = ids.stream().map(byId::get).toList();
        log.info("sessions marked trainer={} results={}", trainerId, results.stream().map(MarkResult::outcome).toList());
        return new MarkResults(results);
    }

    /**
     * One session in a transaction of its own. A refusal the database raises while marking it — a pack paused or
     * closed by another device in the same instant, a charge the triggers will not take — rolls back THIS session
     * only and answers {@code failed} (13 Nov 2026). It used to escape the loop and answer the whole request 500,
     * although the sessions before it had been marked and committed, so the screen said "did not go through" about
     * work that had gone through. Marking again is safe: a marked one answers {@code already_done}.
     */
    private MarkResult markInItsOwnTransaction(UUID trainerId, UUID sessionId) {
        try {
            return tx.execute(status -> markOne(trainerId, sessionId));
        } catch (org.springframework.dao.DataAccessException e) {
            log.warn("session mark refused trainer={} session={}: {}", trainerId, sessionId,
                    e.getMostSpecificCause().getMessage());
            return new MarkResult(sessionId.toString(), "failed", null, null, "MARK_FAILED");
        }
    }

    /**
     * One session, inside the caller's transaction. Also what the single form {@code POST /v1/sessions/{id}/done} is to
     * run, so the two cannot disagree (api-contract Today A4).
     */
    MarkResult markOne(UUID trainerId, UUID sessionId) {
        String sid = sessionId.toString();
        var found = repo.lockForMark(trainerId, sessionId);
        if (found.isEmpty()) return new MarkResult(sid, "not_found", null, null, null);
        var target = found.get();
        UUID clientId = UUID.fromString(target.clientId());

        // The charge this session already carries, if any — a no-show that cost a session has one, and one session
        // gets one charge. Read in the lock's own statement.
        var charge = java.util.Optional.ofNullable(target.liveCharge());

        switch (target.status()) {
            case "done" -> {
                return charge.isEmpty()
                        ? new MarkResult(sid, "already_done", null, null, null)
                        : new MarkResult(sid, "already_done", charge.get().packageId(), charge.get().sessionsRemaining(), null);
            }
            case "cancelled" -> { return new MarkResult(sid, "skipped", null, null, "SESSION_CANCELLED"); }
            default -> { /* scheduled or no_show: mark it below */ }
        }
        // A future session can't have been delivered — UNLESS its log was opened: a trainer who starts early has begun
        // delivering it, and must be able to finish it (notStarted is false once started_at is set). Checked after
        // `done`, so a session somebody marked early still answers already_done.
        if (target.notStarted()) return new MarkResult(sid, "skipped", null, null, "SESSION_NOT_STARTED");

        repo.markDone(sessionId);

        // Decided 27 Sep (1.1): a no-show can be marked done — the client came after all. If the no-show already cost a
        // session, that charge stands and nothing more is taken.
        if (charge.isPresent()) {
            return new MarkResult(sid, "done", charge.get().packageId(), charge.get().sessionsRemaining(), null);
        }

        var c = charges.charge(trainerId, clientId, sessionId, target.service(), target.billing());
        return new MarkResult(sid, c.charged() ? "done" : "not_charged", c.packageId(), c.sessionsRemaining(), c.reason());
    }

    /**
     * 1–50 distinct UUIDs, in the order given; 400 {@code VALIDATION} otherwise. A repeated id is refused rather than
     * folded (1.1): a caller that sent one twice has a bug worth hearing about, and one answer per id sent is what lets
     * it match results to rows by position.
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
