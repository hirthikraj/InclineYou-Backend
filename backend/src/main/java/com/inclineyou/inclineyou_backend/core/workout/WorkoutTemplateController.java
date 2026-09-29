package com.inclineyou.inclineyou_backend.core.workout;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** V13 · the trainer's saved workouts — `/programs/workouts` and the builder's library pane. */
@RestController
@RequestMapping("/v1/workout-templates")
@RequiredArgsConstructor
public class WorkoutTemplateController {

    private final WorkoutTemplateService service;

    @GetMapping
    public List<WorkoutTemplateService.WorkoutTemplateResponse> list() {
        return service.list(trainerId());
    }

    @GetMapping("/{id}")
    public WorkoutTemplateService.WorkoutTemplateResponse get(@PathVariable UUID id) {
        return service.get(trainerId(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkoutTemplateService.WorkoutTemplateResponse create(
            @RequestBody(required = false) WorkoutTemplateService.WorkoutTemplateInput req) {
        return service.create(trainerId(), req);
    }

    @PutMapping("/{id}")
    public WorkoutTemplateService.WorkoutTemplateResponse update(
            @PathVariable UUID id, @RequestBody WorkoutTemplateService.WorkoutTemplateInput req) {
        return service.update(trainerId(), id, req);
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
