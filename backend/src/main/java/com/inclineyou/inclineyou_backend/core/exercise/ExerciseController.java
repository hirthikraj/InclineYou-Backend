package com.inclineyou.inclineyou_backend.core.exercise;

import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExercisePage;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseRequest;
import com.inclineyou.inclineyou_backend.core.exercise.dto.PatchExerciseRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.util.UUID;

/** The exercise library (Programs L6, A9, A10): text only, global plus the trainer's own customs. */
@RestController
@RequestMapping("/v1/exercises")
@RequiredArgsConstructor
public class ExerciseController {

    private final ExerciseService service;

    /** The library, filtered: a keyset page, relevance-ordered when {@code q} is given. */
    @GetMapping
    public ExercisePage search(@RequestParam(required = false) String q,
                               @RequestParam(required = false) String bodyPart,
                               @RequestParam(required = false) String equipment,
                               @RequestParam(required = false) String level,
                               @RequestParam(required = false) Boolean custom,
                               @RequestParam(required = false) Integer limit,
                               @RequestParam(required = false) String cursor,
                               @RequestParam(defaultValue = "false") boolean includeTotal) {
        return service.search(trainerId(), q, bodyPart, equipment, level, custom, limit, cursor, includeTotal);
    }

    /**
     * The facets. They change only when the library or this trainer's customs do, so a repeat
     * answers 304. Declared above {@code /{id}}: a word in a UUID variable is a 400, not a 404.
     */
    @GetMapping("/meta")
    public ResponseEntity<ExerciseMeta> meta(WebRequest request) {
        ExerciseMeta meta = service.meta(trainerId());
        String etag = "\"" + Integer.toHexString(meta.hashCode()) + "\"";
        if (request.checkNotModified(etag)) return null;
        return ResponseEntity.ok().eTag(etag).body(meta);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExerciseItem> get(@PathVariable UUID id) {
        ExerciseItem item = service.get(trainerId(), id);
        return ResponseEntity.ok().eTag(item.version()).body(item);
    }

    /** 201 with the exercise, or 200 when the id was already made by this trainer. */
    @PostMapping
    public ResponseEntity<ExerciseItem> create(@Valid @RequestBody ExerciseRequest body) {
        var made = service.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.exercise().version()).body(made.exercise());
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ExerciseItem> patch(@PathVariable UUID id,
                                              @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                              @Valid @RequestBody PatchExerciseRequest body) {
        ExerciseItem item = service.patch(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(item.version()).body(item);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
