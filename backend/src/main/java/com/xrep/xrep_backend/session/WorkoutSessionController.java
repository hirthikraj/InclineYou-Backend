package com.xrep.xrep_backend.session;

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
}
