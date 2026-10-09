package com.inclineyou.inclineyou_backend.core.exercise;

import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMade;
import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.After;
import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.Filter;
import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.Hit;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExercisePage;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseRequest;
import com.inclineyou.inclineyou_backend.core.exercise.dto.PatchExerciseRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * The exercise library (api-contract 1.1, Programs L6 and A9–A10): the global,
 * text-only library plus the trainer's own custom exercises.
 *
 * <p>Searching is a typeahead over ~1,300 rows, per keystroke, and pages by
 * keyset. Without a {@code q} the order is {@code name, id}. With one it is
 * relevance — an exact-prefix match first, then trigram similarity (rounded to
 * four places, so it can be compared again on the next page) — then
 * {@code name, id}; the cursor carries all of those.
 *
 * <p>Only customs are writable. A global id answers 404 to a PATCH or DELETE, the
 * same "not yours" as everywhere else. A retired custom leaves search and the
 * pickers and frees its name, but a plan or a past log that holds its id still
 * resolves the name — reads of those never filter on {@code deleted_at}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExerciseService {

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;
    private static final int MAX_Q = 100;

    private final ExerciseJdbcRepository repo;

    /** The raw filters of a list read, as they arrived: comma-separated lists, split and validated here. */
    public record Search(String q, String bodyPart, String equipment, String equipmentKey, String equipmentCategory,
                         String level, String target, String secondary, String pattern, String logType, String category,
                         Boolean custom) {}

    @Transactional(readOnly = true)
    public ExercisePage search(UUID trainerId, Search s, Integer limit, String cursor, boolean includeTotal) {
        int size = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        String q = s.q();
        String text = q == null || q.isBlank() ? null : q.strip();
        if (text != null && text.length() > MAX_Q) throw ApiException.validation("q: at most " + MAX_Q + " characters");
        var filter = new Filter(text, split(s.bodyPart()), split(s.equipment()), split(s.level()), s.custom(),
                split(s.equipmentKey()), split(s.equipmentCategory()), split(s.target()), split(s.secondary()),
                split(s.pattern()), split(s.logType()), split(s.category()));

        List<Hit> hits = repo.search(trainerId, filter, after(cursor, text != null), size);
        boolean more = hits.size() > size;
        List<Hit> page = more ? hits.subList(0, size) : hits;
        String next = null;
        if (more) {
            Hit last = page.getLast();
            String key = text != null ? last.tier() + "|" + last.similarity() + "|" + last.item().name() : last.item().name();
            next = Cursor.encode(key, last.item().id());
        }
        return new ExercisePage(page.stream().map(Hit::item).toList(), next,
                includeTotal ? repo.count(trainerId, filter) : null);
    }

    @Transactional(readOnly = true)
    public ExerciseMeta meta(UUID trainerId) {
        return new ExerciseMeta(repo.facet(trainerId, "body_part"), repo.facet(trainerId, "equipment"),
                repo.facet(trainerId, "level"), repo.total(trainerId), repo.equipmentGroups(trainerId),
                repo.muscles(trainerId), repo.facet(trainerId, "movement_pattern"),
                repo.facetOf(trainerId, "COALESCE(e.log_type, 'weight_reps')"),
                repo.facetOf(trainerId, "e.metadata->>'category'"));
    }

    @Transactional(readOnly = true)
    public ExerciseItem get(UUID trainerId, UUID id) {
        return repo.find(trainerId, id).orElseThrow(() -> ApiException.notFound("That exercise is not in the library."));
    }

    @Transactional
    public ExerciseMade create(UUID trainerId, ExerciseRequest body) {
        UUID id = body.id() == null ? UUID.randomUUID() : body.id();
        var existing = repo.ownership(trainerId, id);
        if (existing.isPresent()) {
            if (!existing.get()) throw ApiException.idConflict();
            return new ExerciseMade(get(trainerId, id), false);
        }
        requireFreeName(trainerId, body.name(), null);
        try {
            repo.insert(id, trainerId, body);
        } catch (DuplicateKeyException e) {
            throw taken(e);
        }
        log.info("custom exercise created trainer={} exercise={}", trainerId, id);
        return new ExerciseMade(get(trainerId, id), true);
    }

    /** If-Match is honoured when sent (412), not required: a PATCH sends only what changed. */
    @Transactional
    public ExerciseItem patch(UUID trainerId, UUID id, String ifMatch, PatchExerciseRequest body) {
        if (body.isEmpty()) throw ApiException.validation("body: nothing to change");
        ExerciseItem row = repo.lockCustom(trainerId, id).orElseThrow(() -> ApiException.notFound("That exercise is not yours."));
        IfMatch.check(ifMatch, row.version(), "This exercise changed since you opened it. Reload it and make the change again.");
        if (body.name() != null) requireFreeName(trainerId, body.name().value(), id);
        try {
            repo.update(id, body);
        } catch (DuplicateKeyException e) {
            throw taken(e);
        }
        return get(trainerId, id);
    }

    /** Soft, and again is 204 again. Anything that is not the trainer's own custom is 404. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        var owner = repo.ownership(trainerId, id);
        if (owner.isEmpty()) throw ApiException.notFound("That exercise is not yours.");
        if (!owner.get()) {
            if (repo.retired(trainerId, id)) return;
            throw ApiException.notFound("That exercise is not yours.");
        }
        repo.retire(id);
        log.info("custom exercise retired trainer={} exercise={}", trainerId, id);
    }

    private void requireFreeName(UUID trainerId, String name, UUID except) {
        if (repo.nameTaken(trainerId, name, except)) throw nameTaken();
    }

    private static ApiException nameTaken() {
        return ApiException.conflict("EXERCISE_NAME_TAKEN", "You already have an exercise with that name.");
    }

    /** A unique violation is the name (the race past the check) unless it was the id. */
    private static ApiException taken(DuplicateKeyException e) {
        return String.valueOf(e.getMessage()).contains("uq_exercise_custom_name") ? nameTaken() : ApiException.idConflict();
    }

    /** The previous page's last row, read back out of the cursor; a cursor this server did not make is a 400. */
    private static After after(String raw, boolean ranked) {
        Cursor c = Cursor.decode(raw);
        if (c == null) return null;
        try {
            if (!ranked) return new After(0, "0", c.key(), c.id());
            String[] parts = c.key().split("\\|", 3);
            return new After(Integer.parseInt(parts[0]), new java.math.BigDecimal(parts[1]).toPlainString(), parts[2], c.id());
        } catch (RuntimeException e) {
            throw ApiException.validation("cursor: not a cursor from this list");
        }
    }

    /** A comma-separated filter as a list: trimmed, de-duplicated, at most twenty values of at most sixty characters. */
    private static List<String> split(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        var out = java.util.Arrays.stream(raw.split(",")).map(String::strip).filter(v -> !v.isEmpty()).distinct().toList();
        if (out.size() > 20 || out.stream().anyMatch(v -> v.length() > 60)) throw ApiException.validation("filter: too many values or a value too long");
        return out;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
