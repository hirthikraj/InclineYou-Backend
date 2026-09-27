package com.inclineyou.inclineyou_backend.session;

import lombok.RequiredArgsConstructor;
import com.inclineyou.inclineyou_backend.wire.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/sessions")
@RequiredArgsConstructor
public class ScheduledSessionController {

    private final ScheduledSessionService service;
    private final SessionReadService reads;
    private final SessionWriteService writes;
    private final SessionBookingService bookings;

    private UUID trainerId(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    /**
     * api-contract Today L4 — dates in the workspace's timezone, {@code to}
     * exclusive; keyset-paged on (scheduledAt, id), 500 a page by default.
     */
    @GetMapping
    public Page<SessionReadService.SessionRow> list(
            Authentication auth,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String order
    ) {
        return reads.list(trainerId(auth), from, to, clientId, status, limit, cursor, order);
    }

    /** api-contract Today — close logs left open on sessions that are over. */
    @PostMapping("/end")
    public SessionWriteService.EndResults end(
            Authentication auth,
            @RequestBody(required = false) SessionWriteService.SessionIdsRequest req
    ) {
        return writes.end(trainerId(auth), req);
    }

    /** api-contract Today — mark past sessions delivered, charging the pack; one outcome per session. */
    @PostMapping("/done")
    public SessionWriteService.MarkResults markDoneBatch(
            Authentication auth,
            @RequestBody(required = false) SessionWriteService.SessionIdsRequest req
    ) {
        return writes.markDone(trainerId(auth), req);
    }

    /**
     * api-contract Today A1 — book one session. 201 with the L4 row; a replayed
     * {@code id} answers 200 with the session as it now is.
     */
    @PostMapping
    public ResponseEntity<SessionReadService.SessionRow> create(
            Authentication auth,
            @RequestBody(required = false) SessionBookingService.BookRequest req
    ) {
        var booked = bookings.book(trainerId(auth), req);
        return ResponseEntity.status(booked.created() ? HttpStatus.CREATED : HttpStatus.OK).body(booked.session());
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
