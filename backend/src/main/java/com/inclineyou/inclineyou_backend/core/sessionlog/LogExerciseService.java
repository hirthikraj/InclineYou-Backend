package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.exercise.LogTypes;
import com.inclineyou.inclineyou_backend.core.sessionlog.LogExerciseJdbcRepository.ExCtx;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.AddExerciseRequest;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.ExerciseEntry;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.SwapRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A movement in the log: add one mid-session, remove / restore / annotate it, change its rest, swap it
 * (api-contract Log session A8 · A9 · A10). Every answer is the exercise entry in the console's shape.
 *
 * <p>Scope. Today's change is the session's own rows. {@code onPlan} (rest) and {@code scope: program} (swap) ALSO
 * write the client's PROGRAM — the plan's workout_exercise / workout_set rows, from the next session on, since a log's
 * targets are copies — and bump {@code program.revised_at} in the same transaction, so a builder tab open on that plan
 * fails its next save with 412 PROGRAM_REVISED instead of silently putting the old movement back (R44). The template
 * is never touched from here: that is Programs.
 */
@Service
@RequiredArgsConstructor
public class LogExerciseService {

    private final LogExerciseJdbcRepository exercises;
    private final SessionLogJdbcRepository sessions;
    private final SessionLogReadService reads;

    private static final Set<String> PATCH_KEYS = Set.of("removed", "notes", "restSeconds", "onPlan");
    private static final Set<String> REASONS = Set.of("unavailable", "difficulty");
    private static final Set<String> SCOPES = Set.of("today", "program");
    private static final int MAX_NOTES = 500, MAX_REST = 3600, MAX_SETS = 50;

    /** 201, or 200 with the same entry on a replayed id — no second row, no more sets laid down. */
    @Transactional
    public Created<ExerciseEntry> add(UUID trainerId, UUID sessionId, AddExerciseRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = Body.uuid(req.id(), "id");
        UUID exerciseId = Body.uuid(req.exerciseId(), "exerciseId");
        if (exerciseId == null) throw ApiException.validation("exerciseId: required");
        int sets = req.sets() == null ? 0 : req.sets();
        if (sets < 0 || sets > MAX_SETS) throw ApiException.validation("sets: between 0 and " + MAX_SETS);
        if (req.position() != null && req.position() < 0) throw ApiException.validation("position: not negative");

        if (id != null) {
            var existing = exercises.findOwned(trainerId, id);
            if (existing.isPresent()) {
                if (!existing.get().sessionId().equals(sessionId)) throw ApiException.idConflict();
                return new Created<>(reads.entry(trainerId, sessionId, id), false);
            }
        }
        var head = sessions.head(trainerId, sessionId, true).orElseThrow(SessionLogReadService::notYours);
        if (head.startedAt() == null) throw SetLogService.notStarted();
        var lib = exercises.library(trainerId, exerciseId).orElseThrow(() -> ApiException.notFound("That exercise is not in the library."));

        int next = exercises.nextPosition(sessionId);
        int position = req.position() == null ? next : Math.min(req.position(), next);
        if (position < next) exercises.shiftFrom(sessionId, position);
        UUID sxId = id != null ? id : UUID.randomUUID();
        try {
            exercises.insert(sxId, sessionId, head.clientId(), lib.id(), position);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();
        }
        // Kinds come from the exercise's log type (R49, widened in V9): weight or bodyweight, by reps, seconds or metres.
        if (sets > 0) {
            var kinds = LogTypes.kindsOf(lib.logType());
            exercises.insertEmptySets(sxId, sets, kinds.loadKind(), kinds.effortKind());
        }
        return new Created<>(reads.entry(trainerId, sessionId, sxId), true);
    }

    @Transactional
    public ExerciseEntry patch(UUID trainerId, UUID sessionId, UUID sxId, Map<String, Object> body) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: nothing to change");
        Body.only(body, PATCH_KEYS);
        Boolean removed = Body.bool(body, "removed");
        Boolean onPlan = Body.bool(body, "onPlan");
        Integer rest = Body.integer(body, "restSeconds");
        if (body.containsKey("removed") && removed == null) throw ApiException.validation("removed: true or false");
        if (body.containsKey("restSeconds") && rest == null) throw ApiException.validation("restSeconds: a number of seconds");
        if (rest != null && (rest < 0 || rest > MAX_REST)) throw ApiException.validation("restSeconds: between 0 and " + MAX_REST);
        if (onPlan != null && rest == null) throw ApiException.validation("onPlan: only with restSeconds");
        String notes = null;
        boolean hasNotes = body.containsKey("notes");
        if (hasNotes) {
            notes = Body.text(body, "notes");
            if (notes != null && notes.strip().length() > MAX_NOTES) throw ApiException.validation("notes: at most " + MAX_NOTES + " characters");
            notes = notes == null || notes.isBlank() ? null : notes.strip();
        }

        ExCtx ctx = exercises.lock(trainerId, sessionId, sxId).orElseThrow(() -> ApiException.notFound("That exercise is not in this session."));
        if (!ctx.started()) throw SetLogService.notStarted();

        if (removed != null) exercises.setRemoved(sxId, removed);
        if (hasNotes) exercises.setNotes(sxId, notes);
        if (rest != null) {
            exercises.setRestOnNotDone(sxId, rest);
            if (Boolean.TRUE.equals(onPlan)) {
                UUID program = programOf(ctx, "onPlan");
                exercises.setPlanRest(ctx.plannedFrom(), rest);
                exercises.touchProgram(program);
            }
        }
        return reads.entry(trainerId, sessionId, sxId);
    }

    /** Swap a movement — today only, or also in the client's plan from the next session on. */
    @Transactional
    public ExerciseEntry swap(UUID trainerId, UUID sessionId, UUID sxId, SwapRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID to = Body.uuid(req.toExerciseId(), "toExerciseId");
        if (to == null) throw ApiException.validation("toExerciseId: required");
        UUID planRow = Body.uuid(req.planRowId(), "planRowId");
        String scope = req.scope() == null ? "today" : req.scope();
        if (!SCOPES.contains(scope)) throw ApiException.validation("scope: today or program");
        if (req.reason() != null && !REASONS.contains(req.reason())) throw ApiException.validation("reason: unavailable or difficulty");

        ExCtx ctx = exercises.lock(trainerId, sessionId, sxId).orElseThrow(() -> ApiException.notFound("That exercise is not in this session."));
        if (!ctx.started()) throw SetLogService.notStarted();
        exercises.library(trainerId, to).orElseThrow(() -> ApiException.notFound("That exercise is not in the library."));
        if (to.equals(ctx.exerciseId())) throw ApiException.validation("toExerciseId: that is the movement already");
        if (planRow != null && exercises.alternative(planRow, ctx.plannedFrom(), to).isEmpty()) {
            throw ApiException.validation("planRowId: not one of this exercise's plan alternatives");
        }
        UUID program = "program".equals(scope) ? programOf(ctx, "scope") : null;

        // The original is remembered across swaps; swapping back to it forgets the swap.
        UUID swappedFrom = to.equals(ctx.swappedFrom()) ? null : ctx.swappedFrom() != null ? ctx.swappedFrom() : ctx.exerciseId();
        exercises.swap(sxId, to, planRow != null ? planRow : ctx.plannedFrom(), swappedFrom, req.reason());

        if (planRow != null) {
            // The alternative's targets replace what is still to do; what was done stays.
            int done = exercises.maxDonePosition(sxId);
            if (done + exercises.planSetCount(planRow) > MAX_SETS) {
                throw ApiException.conflict("SET_LIMIT", "That would put more than " + MAX_SETS + " sets on one exercise.");
            }
            exercises.deleteNotDoneSets(sxId);
            exercises.insertPlannedFromPlan(sxId, planRow, done);
        }
        if (program != null) {
            exercises.planSwapExercise(ctx.plannedFrom(), to);
            if (planRow != null) exercises.planCopySets(planRow, ctx.plannedFrom());
            exercises.touchProgram(program);
        }
        return reads.entry(trainerId, sessionId, sxId);
    }

    /** The client's program this exercise came from, or a 400 that says why the plan can't be touched. */
    private UUID programOf(ExCtx ctx, String field) {
        if (ctx.plannedFrom() == null) throw ApiException.validation(field + ": this exercise was added today, so it is not on the plan");
        return exercises.clientProgramOf(ctx.workoutId(), ctx.clientId())
                .orElseThrow(() -> ApiException.validation(field + ": this session is not from the client's own program"));
    }
}
