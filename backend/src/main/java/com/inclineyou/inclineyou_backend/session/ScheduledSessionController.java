package com.inclineyou.inclineyou_backend.session;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/sessions")
@RequiredArgsConstructor
public class ScheduledSessionController {

    private final ScheduledSessionService service;

    private UUID trainerId(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    @GetMapping
    public List<ScheduledSessionService.SessionResponse> list(
            Authentication auth,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to
    ) {
        return service.list(trainerId(auth), clientId, from, to);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ScheduledSessionService.SessionResponse create(
            Authentication auth,
            @RequestBody ScheduledSessionService.CreateRequest req
    ) {
        return service.create(trainerId(auth), req);
    }

    @GetMapping("/{id}")
    public ScheduledSessionService.SessionResponse get(
            Authentication auth,
            @PathVariable UUID id
    ) {
        return service.get(id, trainerId(auth));
    }

    @PutMapping("/{id}")
    public ScheduledSessionService.SessionResponse update(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody ScheduledSessionService.UpdateRequest req
    ) {
        return service.update(id, trainerId(auth), req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth, @PathVariable UUID id) {
        service.delete(id, trainerId(auth));
    }

    @PostMapping("/{id}/done")
    public Map<String, Object> markDone(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody(required = false) ScheduledSessionService.MarkDoneRequest req
    ) {
        return service.markDone(id, trainerId(auth), req);
    }
}
