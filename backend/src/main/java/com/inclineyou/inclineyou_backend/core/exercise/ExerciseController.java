package com.inclineyou.inclineyou_backend.core.exercise;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/exercises")
@RequiredArgsConstructor
public class ExerciseController {

    private final ExerciseService exerciseService;

    @GetMapping
    public ExerciseService.SearchResult search(
            // Comma-separated exercise ids. When present, paging is ignored and
            // exactly those rows come back — see ExerciseService.search().
            @RequestParam(required = false) String ids,
            @RequestParam(required = false) String q,
            // V9 · incline | mine | draft; anything else is everything but drafts.
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String muscleGroup,
            @RequestParam(required = false) String bodyPart,
            @RequestParam(required = false) String target,
            @RequestParam(required = false) String equipment,
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        return exerciseService.search(
                trainerId(), ids, q, source, muscleGroup, bodyPart, target, equipment, level, page, size);
    }

    @GetMapping("/meta")
    public ExerciseService.MetaResponse meta() {
        return exerciseService.meta();
    }

    /*
     * The literal paths are declared BEFORE `/{id}`. Spring prefers a literal
     * match either way, but the certified-templates gap is what happens when a
     * word lands in a UUID-typed variable (a 400, not a 404), and keeping the
     * literals above the variable is how nobody has to remember that.
     */
    @GetMapping("/categories")
    public ExerciseService.CategoriesResponse categories() {
        return exerciseService.categories(trainerId());
    }

    @GetMapping("/{id}")
    public ExerciseService.ExerciseResponse get(@PathVariable UUID id) {
        return exerciseService.get(trainerId(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExerciseService.ExerciseResponse createCustom(
            @Valid @RequestBody ExerciseService.CreateExerciseRequest req) {
        return exerciseService.createCustom(trainerId(), req);
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
