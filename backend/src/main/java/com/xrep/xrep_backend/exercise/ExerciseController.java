package com.xrep.xrep_backend.exercise;

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
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String muscleGroup,
            @RequestParam(required = false) String bodyPart,
            @RequestParam(required = false) String target,
            @RequestParam(required = false) String equipment,
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        return exerciseService.search(
                trainerId(), q, muscleGroup, bodyPart, target, equipment, level, page, size);
    }

    @GetMapping("/meta")
    public ExerciseService.MetaResponse meta() {
        return exerciseService.meta();
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
