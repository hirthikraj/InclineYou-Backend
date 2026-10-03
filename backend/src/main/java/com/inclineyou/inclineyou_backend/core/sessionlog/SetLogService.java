package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.sessionlog.SetLogJdbcRepository.SetCtx;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.*;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The hot path: log a set, correct one, skip a planned one, add an extra, delete an extra (api-contract Log session
 * A3 · A4). A small request and a small answer — {@code {set, totals, isBest}} — so the console updates in place.
 *
 * <p>What the schema forces, and so what these rules are: a DONE set carries at least one of load / effort
 * ({@code set_log_done}); a NOT-done set carries no actuals and must be a planned one — so an extra set exists only
 * as a logged one, and "skipping" a planned set is clearing it, never deleting it. {@code done_at} is stamped on the
 * first done and kept on every resend, which is what makes a retried tap harmless.
 */
@Service
@RequiredArgsConstructor
public class SetLogService {

    private final SetLogJdbcRepository sets;
    private final LogExerciseJdbcRepository exercises;
    private final SessionLogJdbcRepository log;

    private static final Set<String> PATCH_KEYS = Set.of("done", "loadValue", "effortValue", "rpe", "notes");
    private static final Set<String> LOAD_KINDS = Set.of("percent_1rm", "level", "weight", "weight_range", "bodyweight", "rpe_level", "rpe_weight");
    private static final Set<String> EFFORT_KINDS = Set.of("reps", "rep_interval", "time", "distance", "max_reps", "max_time", "max_distance");
    private static final int MAX_SETS = 50;
    private static final int MAX_NOTE = 200;   // set_log.notes is varchar(200)
    private static final BigDecimal MAX_LOAD = BigDecimal.valueOf(2000);
    private static final BigDecimal MAX_EFFORT = BigDecimal.valueOf(86400);

    @Transactional
    public SetWrite patch(UUID trainerId, UUID sessionId, UUID setId, Map<String, Object> body) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: nothing to change");
        Body.only(body, PATCH_KEYS);
        Boolean done = Body.bool(body, "done");
        boolean hasLoad = body.containsKey("loadValue"), hasEffort = body.containsKey("effortValue"), hasRpe = body.containsKey("rpe");
        boolean hasAny = hasLoad || hasEffort || hasRpe;     // ACTUALS only: a note is not a value
        boolean hasNotes = body.containsKey("notes");
        String notesIn = hasNotes ? note(Body.text(body, "notes"), "notes") : null;
        BigDecimal loadIn = Body.number(body, "loadValue"), effortIn = Body.number(body, "effortValue"), rpeIn = Body.number(body, "rpe");

        SetCtx ctx = sets.lock(trainerId, sessionId, setId).orElseThrow(() -> ApiException.notFound("That set is not in this session."));
        guard(ctx);

        if (Boolean.FALSE.equals(done)) {
            if (hasAny) throw ApiException.validation("done: false clears a set — send values only with done: true, or to correct a done set");
            // An extra set only exists as a logged one (set_log_done); to take it back out, delete it.
            if (!ctx.planned()) throw ApiException.validation("done: an extra set is deleted, not un-logged");
            sets.clear(setId);   // a note is not an actual: skipping a set keeps what was written about it
            if (hasNotes) sets.writeNotes(setId, notesIn);
            return answer(trainerId, ctx, sets.row(setId), sessionId);
        }

        boolean wasDone = ctx.doneAt() != null;
        if (done == null && !hasAny) {
            // A notes-only PATCH: it says something ABOUT the set and changes neither its values nor whether it is done.
            sets.writeNotes(setId, notesIn);
            return answer(trainerId, ctx, sets.row(setId), sessionId);
        }
        if (done == null && !wasDone) {
            throw ApiException.validation("done: send done: true to log values on a set that is not done yet");
        }
        BigDecimal load = hasLoad ? loadIn : ctx.loadValue();
        BigDecimal effort = hasEffort ? effortIn : ctx.effortValue();
        BigDecimal rpe = hasRpe ? rpeIn : ctx.rpe();
        if (!wasDone) {
            // One tap = as prescribed: whatever target exists fills what the request did not say.
            if (!hasLoad) load = ctx.targetLoad();
            if (!hasEffort) effort = ctx.targetEffort();
        }
        check(ctx.loadKind(), load, effort, rpe);
        if (load == null && effort == null) {
            if (wasDone) throw ApiException.validation("loadValue: a done set keeps at least a load or an effort");
            throw needsValue();
        }
        sets.writeDone(setId, load, effort, rpe);
        if (hasNotes) sets.writeNotes(setId, notesIn);
        return answer(trainerId, ctx, sets.row(setId), sessionId);
    }

    /** An extra set at the next position, logged as it is added. 201, or 200 on a replayed id with the same row. */
    @Transactional
    public Created<SetAdded> add(UUID trainerId, UUID sessionId, UUID sxId, AddSetRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = Body.uuid(req.id(), "id");
        if (id != null) {
            var existing = sets.findOwned(trainerId, id);
            if (existing.isPresent()) {
                if (!existing.get().getKey().equals(sxId)) throw ApiException.idConflict();
                return new Created<>(new SetAdded(existing.get().getValue(), log.totals(sessionId)), false);
            }
        }
        var ex = exercises.lock(trainerId, sessionId, sxId).orElseThrow(() -> ApiException.notFound("That exercise is not in this session."));
        if (!ex.started()) throw notStarted();
        if (ex.removedAt() != null) throw removed();
        if (Boolean.FALSE.equals(req.done())) throw ApiException.validation("done: an extra set is logged as it is added");

        var last = sets.lastKinds(sxId);
        String lk = req.loadKind() != null ? req.loadKind() : last.map(k -> k[0]).orElse("weight");
        String ek = req.effortKind() != null ? req.effortKind() : last.map(k -> k[1]).orElse("reps");
        if (!LOAD_KINDS.contains(lk)) throw ApiException.validation("loadKind: not a load kind");
        if (!EFFORT_KINDS.contains(ek)) throw ApiException.validation("effortKind: not an effort kind");
        check(lk, req.loadValue(), req.effortValue(), req.rpe());
        String notes = note(req.notes(), "notes");
        if (req.loadValue() == null && req.effortValue() == null) throw needsValue();

        int position = sets.maxPosition(sxId) + 1;
        if (position > MAX_SETS) throw ApiException.conflict("SET_LIMIT", "That exercise already has " + MAX_SETS + " sets.");
        UUID setId = id != null ? id : UUID.randomUUID();
        try {
            sets.insertExtra(setId, sxId, position, lk, ek, req.loadValue(), req.effortValue(), req.rpe(), notes);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();   // an id taken by a row this trainer cannot see
        }
        return new Created<>(new SetAdded(sets.row(setId), log.totals(sessionId)), true);
    }

    /** Only an extra set is ever deleted; a planned one is skipped with {@code done: false}. */
    @Transactional
    public SetDeleted delete(UUID trainerId, UUID sessionId, UUID setId) {
        SetCtx ctx = sets.lock(trainerId, sessionId, setId).orElseThrow(() -> ApiException.notFound("That set is not in this session."));
        if (ctx.planned()) {
            throw ApiException.conflict("SET_PLANNED", "A planned set can't be deleted — skip it instead (done: false).");
        }
        sets.delete(setId);
        return new SetDeleted(log.totals(sessionId));
    }

    // ── internals ────────────────────────────────────────────────────────────────────────────────

    private SetWrite answer(UUID trainerId, SetCtx ctx, SetRow row, UUID sessionId) {
        boolean best = false;
        if (row.doneAt() != null) {
            BigDecimal mine = sets.scoreOf(ctx.setId());
            var other = sets.bestOther(trainerId, sessionId, ctx.clientId(), ctx.exerciseId(), ctx.setId(), ctx.loadKind(), ctx.effortKind());
            best = mine != null && other.isPresent() && mine.compareTo(other.get()) > 0;
        }
        return new SetWrite(row, log.totals(sessionId), best);
    }

    private static void guard(SetCtx ctx) {
        if (!ctx.started()) throw notStarted();
        if (ctx.removed()) throw removed();
    }

    /** A set note: trimmed, empty or null clears it, over the column's 200 is refused (never truncated). */
    static String note(String raw, String field) {
        if (raw == null) return null;
        String s = raw.strip();
        if (s.isEmpty()) return null;
        if (s.length() > MAX_NOTE) throw ApiException.validation(field + ": at most " + MAX_NOTE + " characters");
        return s;
    }

    /** Values in the set's own kind: the schema's ranges (set_log_actuals) plus the rules a kind implies. */
    static void check(String loadKind, BigDecimal load, BigDecimal effort, BigDecimal rpe) {
        if (load != null) {
            if ("bodyweight".equals(loadKind)) throw ApiException.validation("loadValue: a bodyweight set has no load");
            if (load.signum() < 0 || load.compareTo(MAX_LOAD) > 0) throw ApiException.validation("loadValue: between 0 and 2000");
        }
        if (effort != null && (effort.signum() < 0 || effort.compareTo(MAX_EFFORT) > 0)) {
            throw ApiException.validation("effortValue: between 0 and 86400");
        }
        if (rpe != null) {
            if (rpe.compareTo(BigDecimal.ONE) < 0 || rpe.compareTo(BigDecimal.TEN) > 0
                    || rpe.multiply(BigDecimal.TWO).stripTrailingZeros().scale() > 0) {
                throw ApiException.validation("rpe: 1 to 10 in half steps");
            }
        }
    }

    static ApiException needsValue() {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "SET_NEEDS_VALUE",
                "There is nothing prescribed to copy for this set — enter what was done.");
    }

    static ApiException notStarted() {
        return ApiException.conflict("SESSION_NOT_STARTED", "This session's log hasn't been opened yet.");
    }

    static ApiException removed() {
        return ApiException.conflict("EXERCISE_REMOVED", "That exercise was removed from the session — restore it first.");
    }
}
