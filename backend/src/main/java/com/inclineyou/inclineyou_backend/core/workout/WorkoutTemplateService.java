package com.inclineyou.inclineyou_backend.core.workout;

import com.inclineyou.inclineyou_backend.core.program.PlanRules;
import com.inclineyou.inclineyou_backend.core.program.PlanRules.E;
import com.inclineyou.inclineyou_backend.core.program.PlanTreeJdbcRepository;
import com.inclineyou.inclineyou_backend.core.program.ProgramJdbcRepository;
import com.inclineyou.inclineyou_backend.core.program.dto.PlanWorkout.Exercise;
import com.inclineyou.inclineyou_backend.core.workout.WorkoutTemplateJdbcRepository.Row;
import com.inclineyou.inclineyou_backend.core.workout.dto.WorkoutTemplateItem;
import com.inclineyou.inclineyou_backend.core.workout.dto.WorkoutTemplateRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Standalone workouts (api-contract 1.1, Programs L4 and A7): one session's plan
 * that belongs to no program, droppable into any session.
 *
 * <p>A save is the whole workout. The workout row keeps its id, because a booked
 * session can point at it; everything below it is rewritten, so no exercise or
 * set id survives a save and none is promised. Its version is the row's
 * {@code updated_at}, which a save always moves.
 *
 * <p><b>A divider has no table.</b> It is stored as the {@code section} of the
 * exercise it sits in front of, so it needs a row to sit in front of: a position
 * past the last exercise clamps to the last one, and with no exercises every
 * divider is dropped. Two dividers in front of one exercise share its section,
 * newline-joined, which the column's 60 characters bound.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutTemplateService {

    /** {@code workout_exercise.section} is varchar(60). */
    private static final int SECTION_MAX = 60;

    private final WorkoutTemplateJdbcRepository repo;
    private final ProgramJdbcRepository programs;
    private final PlanTreeJdbcRepository trees;

    /** What a create answers with: the workout, and whether this call made it (201) or found it (200). */
    public record Made(WorkoutTemplateItem workout, boolean created) {}

    @Transactional(readOnly = true)
    public List<WorkoutTemplateItem> list(UUID trainerId) {
        List<Row> rows = repo.shelf(trainerId);
        var exercises = programs.exercisesByWorkout(rows.stream().map(r -> UUID.fromString(r.id())).toList());
        return rows.stream().map(r -> item(r, exercises.getOrDefault(r.id(), List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public WorkoutTemplateItem get(UUID trainerId, UUID id) {
        Row row = repo.find(trainerId, id).orElseThrow(() -> ApiException.notFound("That workout is not in your library."));
        return item(row, programs.exercisesByWorkout(List.of(id)).getOrDefault(row.id(), List.of()));
    }

    @Transactional
    public Made create(UUID trainerId, WorkoutTemplateRequest body) {
        UUID id = body.id() == null ? UUID.randomUUID() : body.id();
        List<E> planned = PlanRules.exercises(body.exercises());
        Map<Integer, String> sections = sections(body, planned.size());
        var existing = repo.ownership(trainerId, id);
        if (existing.isPresent()) {
            if (!existing.get()) throw ApiException.idConflict();
            return new Made(get(trainerId, id), false);
        }
        requireExercises(trainerId, planned);
        try {
            repo.insert(id, trainerId, body.name(), body.notes());
            trees.replaceExercises(id, planned, sections);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();
        }
        log.info("workout template created trainer={} workout={} exercises={}", trainerId, id, planned.size());
        return new Made(get(trainerId, id), true);
    }

    /** Conditional on the version the builder loaded: 428 without If-Match, 412 when stale. */
    @Transactional
    public WorkoutTemplateItem update(UUID trainerId, UUID id, String ifMatch, WorkoutTemplateRequest body) {
        IfMatch.require(ifMatch, "the workout");
        Row row = repo.lock(trainerId, id).orElseThrow(() -> ApiException.notFound("That workout is not in your library."));
        IfMatch.check(ifMatch, row.version(), "This workout changed since you opened it. Reload it and make the change again.");
        if (body.id() != null && !id.equals(body.id())) throw ApiException.validation("id: does not match the address");
        List<E> planned = PlanRules.exercises(body.exercises());
        Map<Integer, String> sections = sections(body, planned.size());
        requireExercises(trainerId, planned);
        repo.update(id, body.name(), body.notes());
        trees.replaceExercises(id, planned, sections);
        log.info("workout template saved trainer={} workout={} exercises={}", trainerId, id, planned.size());
        return get(trainerId, id);
    }

    /** Soft, and again is 204 again. A program's applied copy is its own row, so nothing cascades. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        var owner = repo.ownership(trainerId, id);
        if (owner.isEmpty()) throw ApiException.notFound("That workout is not in your library.");
        // false = somebody else's, a program's day, or already retired; only the last of those is a repeat
        if (!owner.get()) {
            if (programs.retiredWorkoutOf(trainerId, id)) return;
            throw ApiException.notFound("That workout is not in your library.");
        }
        repo.retire(id);
        log.info("workout template retired trainer={} workout={}", trainerId, id);
    }

    /** Dividers → the section each exercise carries. Clamped onto the exercise list, joined when they share one. */
    private static Map<Integer, String> sections(WorkoutTemplateRequest body, int exerciseCount) {
        var out = new TreeMap<Integer, String>();
        if (body.dividers() == null || exerciseCount == 0) return out;
        for (var d : body.dividers()) {
            out.merge(Math.min(d.position(), exerciseCount - 1), d.label(), (a, b) -> a + "\n" + b);
        }
        out.values().forEach(s -> {
            if (s.length() > SECTION_MAX) {
                throw ApiException.validation("dividers: the headings in front of one exercise are too long together (at most " + SECTION_MAX + " characters)");
            }
        });
        return out;
    }

    private void requireExercises(UUID trainerId, List<E> planned) {
        var wanted = PlanRules.exerciseIds(List.of(new PlanRules.W(UUID.randomUUID(), "w", null, 1, 1, 0, planned)));
        if (wanted.isEmpty()) return;
        Set<UUID> found = programs.knownExercises(trainerId, wanted);
        for (UUID id : wanted) {
            if (!found.contains(id)) throw ApiException.validation("exerciseId: " + id + " is not in the exercise library");
        }
    }

    /** The row and its mains, with each divider read back out of the section it was stored in. */
    private static WorkoutTemplateItem item(Row row, List<Exercise> stored) {
        var dividers = new ArrayList<WorkoutTemplateItem.Divider>();
        var exercises = new ArrayList<Exercise>();
        int sets = 0;
        for (Exercise e : stored) {
            if (e.section() != null) {
                for (String label : e.section().split("\n")) dividers.add(new WorkoutTemplateItem.Divider(e.position(), label));
            }
            sets += e.sets().size();
            exercises.add(new Exercise(e.id(), e.exerciseId(), e.position(), e.groupId(), null, e.notes(), e.sets(), e.alternatives()));
        }
        return new WorkoutTemplateItem(row.id(), row.name(), row.notes(), exercises, dividers, exercises.size(), sets,
                row.createdAt().getTime(), row.updatedAt().getTime(), row.version());
    }
}
