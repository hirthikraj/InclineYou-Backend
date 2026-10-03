package com.inclineyou.inclineyou_backend.core.session;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * The OLD workout-as-log READS. The writes (create, update, sets, exercises) were removed on
 * 3 Oct 2026: the log is the session now — see core/sessionlog and "Log session v1.1" in API.md.
 * These five reads stay only until the Progress / exercise-history pass moves off them.
 */
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

    @GetMapping("/{id}/sets")
    public List<WorkoutSessionService.SetLogResponse> listSets(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.listSets(id, trainerId(auth));
    }

    @GetMapping("/{id}/exercises")
    public List<WorkoutSessionService.WorkoutExerciseResponse> listExercises(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.listExercises(id, trainerId(auth));
    }
}
