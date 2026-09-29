package com.inclineyou.inclineyou_backend.core.session;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/workouts")
@RequiredArgsConstructor
public class WorkoutSessionController {

    private final WorkoutSessionService service;

    private UUID trainerId(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    @GetMapping
    public List<WorkoutSessionService.WorkoutSessionResponse> list(
            Authentication auth,
            @RequestParam(required = false) String clientId
    ) {
        return service.list(trainerId(auth), clientId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkoutSessionService.WorkoutSessionResponse create(
            Authentication auth,
            @RequestBody WorkoutSessionService.CreateSessionRequest req
    ) {
        return service.create(trainerId(auth), req);
    }

    /**
     * Every set one client has logged, optionally on one exercise.
     *
     * <p>Mapped above {@code /{id}} deliberately: {@code /v1/workouts/sets} is a
     * literal and Spring ranks literals over templates, so this wins the match
     * rather than reaching {@code get()} and failing to parse "sets" as a UUID.
     * Keeping them adjacent is what makes that visible to the next reader.
     */
    @GetMapping("/sets")
    public List<WorkoutSessionService.SetLogResponse> listSetsForClient(
            Authentication auth,
            @RequestParam String clientId,
            @RequestParam(required = false) String exerciseId
    ) {
        return service.listSetsForClient(trainerId(auth), clientId, exerciseId);
    }

    @GetMapping("/{id}")
    public WorkoutSessionService.WorkoutSessionResponse get(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.get(id, trainerId(auth));
    }

    @PutMapping("/{id}")
    public WorkoutSessionService.WorkoutSessionResponse update(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody WorkoutSessionService.UpdateSessionRequest req
    ) {
        return service.update(id, trainerId(auth), req);
    }

    @GetMapping("/{id}/sets")
    public List<WorkoutSessionService.SetLogResponse> listSets(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.listSets(id, trainerId(auth));
    }

    @PostMapping("/{id}/sets")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkoutSessionService.SetLogResponse addSet(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody WorkoutSessionService.CreateSetRequest req
    ) {
        return service.addSet(id, trainerId(auth), req);
    }

    @PutMapping("/{id}/sets/{setId}")
    public WorkoutSessionService.SetLogResponse updateSet(
            Authentication auth,
            @PathVariable UUID id,
            @PathVariable UUID setId,
            @RequestBody WorkoutSessionService.UpdateSetRequest req
    ) {
        return service.updateSet(id, setId, trainerId(auth), req);
    }

    @DeleteMapping("/{id}/sets/{setId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSet(
            Authentication auth,
            @PathVariable UUID id,
            @PathVariable UUID setId
    ) {
        service.deleteSet(id, setId, trainerId(auth));
    }

    // ── Today's card list — V13's workout_exercise ────────────────────────────

    @GetMapping("/{id}/exercises")
    public List<WorkoutSessionService.WorkoutExerciseResponse> listExercises(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.listExercises(id, trainerId(auth));
    }

    @PostMapping("/{id}/exercises")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkoutSessionService.WorkoutExerciseResponse addExercise(
            Authentication auth,
            @PathVariable UUID id,
            @Valid @RequestBody WorkoutSessionService.CreateWorkoutExerciseRequest req
    ) {
        return service.addExercise(id, trainerId(auth), req);
    }

    @PutMapping("/{id}/exercises/{rowId}")
    public WorkoutSessionService.WorkoutExerciseResponse updateExercise(
            Authentication auth,
            @PathVariable UUID id,
            @PathVariable UUID rowId,
            @RequestBody WorkoutSessionService.UpdateWorkoutExerciseRequest req
    ) {
        return service.updateExercise(id, rowId, trainerId(auth), req);
    }

    @DeleteMapping("/{id}/exercises/{rowId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExercise(
            Authentication auth,
            @PathVariable UUID id,
            @PathVariable UUID rowId
    ) {
        service.deleteExercise(id, rowId, trainerId(auth));
    }
}
