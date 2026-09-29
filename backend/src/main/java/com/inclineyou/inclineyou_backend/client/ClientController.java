package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;
    private final ClientSummaryService summaryService;
    private final ClientWriteService writes;
    private final ClientStateService states;
    private final ClientScheduleService schedules;
    private final ClientFileService files;
    private final ClientNoteService notes;

    /**
     * api-contract Today L3 — the v1 roster read, and since 1.1 the default:
     * {@code view} picks the shape of a row, never which rows, and {@code summary}
     * is the shape. See {@link ClientSummaryService}.
     */
    @GetMapping
    public Items<ClientSummaryService.ClientSummary> summary(
            @RequestParam(required = false) String view,
            @RequestParam(required = false) String status) {
        if (view != null && !"summary".equals(view)) {
            throw ApiException.validation("view: summary or legacy");
        }
        return Items.of(summaryService.list(trainerId(), status));
    }

    /**
     * The pre-v1 row, kept only for the screens not yet on the summary. A bare
     * array, as it always was: it is deleted, not evolved, once they move.
     */
    @GetMapping(params = "view=legacy")
    public List<ClientService.ClientResponse> legacy() {
        return clientService.list(trainerId());
    }

    /* ── api-contract 1.1 Clients ─────────────────────────────────────────── */

    /** A5 — the end of step 2. 201 the first time, 200 on a replayed id. */
    @PostMapping
    public ResponseEntity<ClientSummaryService.ClientSummary> create(@RequestBody(required = false) Map<String, Object> body) {
        var made = writes.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.client().version()).body(made.client());
    }

    /** A4 — POST so the number stays out of URLs and access logs. */
    @PostMapping("/phone-check")
    public ClientPhoneGuard.Verdict phoneCheck(@RequestBody(required = false) Map<String, Object> body) {
        return writes.phoneCheck(trainerId(), body);
    }

    /** A6 — any subset of the client's own fields; If-Match honoured when sent. */
    @PatchMapping("/{id}")
    public ResponseEntity<ClientSummaryService.ClientSummary> patch(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body) {
        var row = writes.patch(trainerId(), id, body, ifMatch);
        return ResponseEntity.ok().eTag(row.version()).body(row);
    }

    @PostMapping("/{id}/pause")
    public ClientStateService.Result pause(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return states.pause(trainerId(), id, body);
    }

    @PostMapping("/{id}/resume")
    public ClientStateService.Result resume(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return states.resume(trainerId(), id, body);
    }

    @PostMapping("/{id}/archive")
    public ClientStateService.Result archive(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return states.archive(trainerId(), id, body);
    }

    @PostMapping("/{id}/unarchive")
    public ClientStateService.Result unarchive(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return states.unarchive(trainerId(), id, body);
    }

    /** A8 — the whole week, conditional: 428 without If-Match, 412 when stale. */
    @PutMapping("/{id}/schedule")
    public ResponseEntity<ClientScheduleService.Saved> putSchedule(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body) {
        var saved = schedules.put(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.schedule().version()).body(saved);
    }

    /* ── api-contract 1.1 Client file ─────────────────────────────────────── */

    /**
     * The header every tab draws. Answers If-None-Match with 304, so a soft
     * navigation between tabs usually costs nothing.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ClientFileService.ClientDetail> get(@PathVariable UUID id, WebRequest request) {
        var detail = files.get(trainerId(), id);
        String etag = detail.etag();
        if (request.checkNotModified(etag)) return null;
        return ResponseEntity.ok().eTag(etag).cacheControl(CacheControl.noCache().cachePrivate()).body(detail);
    }

    /** Read out of completed assessments — a correction is an edit to the assessment. */
    @GetMapping("/{id}/readings")
    public Items<ClientFileService.Reading> readings(@PathVariable UUID id, @RequestParam(required = false) String key) {
        return Items.of(files.readings(trainerId(), id, key));
    }

    /* Notes — under the client, and the note id under the client too: a note is
       reached through the person it is about, never on its own. */

    @GetMapping("/{id}/notes")
    public Items<ClientNoteService.Note> listNotes(@PathVariable UUID id) {
        return Items.of(notes.list(trainerId(), id));
    }

    /** 201 the first time, 200 on a replayed id. */
    @PostMapping("/{id}/notes")
    public ResponseEntity<ClientNoteService.Note> addNote(@PathVariable UUID id,
                                                          @RequestBody(required = false) Map<String, Object> body) {
        var made = notes.create(trainerId(), id, body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK).body(made.note());
    }

    @PatchMapping("/{id}/notes/{noteId}")
    public ClientNoteService.Note patchNote(@PathVariable UUID id, @PathVariable UUID noteId,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody(required = false) Map<String, Object> body) {
        return notes.patch(trainerId(), id, noteId, ifMatch, body);
    }

    @DeleteMapping("/{id}/notes/{noteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNote(@PathVariable UUID id, @PathVariable UUID noteId) {
        notes.delete(trainerId(), id, noteId);
    }

    @PostMapping("/{id}/notes/{noteId}/restore")
    public ClientNoteService.Note restoreNote(@PathVariable UUID id, @PathVariable UUID noteId) {
        return notes.restore(trainerId(), id, noteId);
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
