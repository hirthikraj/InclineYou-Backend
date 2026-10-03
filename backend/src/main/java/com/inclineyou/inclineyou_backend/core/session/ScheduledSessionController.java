package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.BookRequest;
import com.inclineyou.inclineyou_backend.core.session.dto.EndResults;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResult;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResults;
import com.inclineyou.inclineyou_backend.core.session.dto.NoShowResult;
import com.inclineyou.inclineyou_backend.core.session.dto.Reopened;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionIdsRequest;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionRow;
import lombok.RequiredArgsConstructor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
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

    private final SessionReadService reads;
    private final SessionWriteService writes;
    private final SessionBookingService bookings;
    private final SessionStateService states;

    private UUID trainerId(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    /**
     * api-contract Today L4 — dates in the workspace's timezone, {@code to}
     * exclusive; keyset-paged on (scheduledAt, id), 500 a page by default.
     */
    @GetMapping
    public Page<SessionRow> list(
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
    public EndResults end(
            Authentication auth,
            @RequestBody(required = false) SessionIdsRequest req
    ) {
        return writes.end(trainerId(auth), req);
    }

    /** api-contract Today — mark past sessions delivered, charging the pack; one outcome per session. */
    @PostMapping("/done")
    public MarkResults markDoneBatch(
            Authentication auth,
            @RequestBody(required = false) SessionIdsRequest req
    ) {
        return writes.markDone(trainerId(auth), req);
    }

    /**
     * api-contract Today A1 — book one session. 201 with the L4 row; a replayed
     * {@code id} answers 200 with the session as it now is.
     */
    @PostMapping
    public ResponseEntity<SessionRow> create(
            Authentication auth,
            @RequestBody(required = false) BookRequest req
    ) {
        var booked = bookings.book(trainerId(auth), req);
        return ResponseEntity.status(booked.created() ? HttpStatus.CREATED : HttpStatus.OK).body(booked.session());
    }

    /** One session in the L4 shape — the row the list draws — with its version as the ETag {@code PATCH} takes. */
    @GetMapping("/{id}")
    public ResponseEntity<SessionRow> get(Authentication auth, @PathVariable UUID id) {
        SessionRow row = reads.get(trainerId(auth), id);
        return ResponseEntity.ok().eTag(row.version()).body(row);
    }

    /** api-contract Schedule — move a session, or change its length, mode or note. */
    @PatchMapping("/{id}")
    public ResponseEntity<SessionRow> patch(
            Authentication auth,
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        var row = states.patch(trainerId(auth), id, body, ifMatch);
        return ResponseEntity.ok().eTag(row.version()).body(row);
    }

    /** api-contract Schedule — take back a booking just made by mistake. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth, @PathVariable UUID id) {
        states.delete(trainerId(auth), id);
    }

    /** api-contract Schedule — mark one session delivered; the batch's item shape. */
    @PostMapping("/{id}/done")
    public MarkResult markDone(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return states.markDone(trainerId(auth), id, body);
    }

    /** api-contract Schedule — record a no-show, and whether it costs a pack session. */
    @PostMapping("/{id}/no-show")
    public NoShowResult noShow(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return states.noShow(trainerId(auth), id, body);
    }

    /** api-contract Schedule — cancel a booking; the row stays in the diary. */
    @PostMapping("/{id}/cancel")
    public SessionRow cancel(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return states.cancel(trainerId(auth), id, body);
    }

    /** api-contract Schedule — undo a done, no-show or cancel, reversing its charge. */
    @PostMapping("/{id}/reopen")
    public Reopened reopen(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return states.reopen(trainerId(auth), id, body);
    }
}
