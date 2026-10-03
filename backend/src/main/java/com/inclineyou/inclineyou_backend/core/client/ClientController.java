package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ArchiveRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.ClientDetail;
import com.inclineyou.inclineyou_backend.core.client.dto.ClientSummary;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateNoteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.DeleteClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Note;
import com.inclineyou.inclineyou_backend.core.client.dto.PauseRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PhoneCheckRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PutScheduleRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Reading;
import com.inclineyou.inclineyou_backend.core.client.dto.ScheduleSaved;
import com.inclineyou.inclineyou_backend.core.client.dto.StateResult;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateNoteRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.util.UUID;

/**
 * The HTTP contract of {@code /v1/clients/**}: every body is a request record,
 * shape-checked by {@code @Valid} and strict binding ({@code JacksonConfig})
 * before a service sees it; a failure is 400 {@code VALIDATION} naming the field.
 */
@RestController
@RequestMapping("/v1/clients")
@RequiredArgsConstructor
public class ClientController {

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
    public Items<ClientSummary> summary(
            @RequestParam(required = false) String view,
            @RequestParam(required = false) String status) {
        if (view != null && !"summary".equals(view)) {
            throw ApiException.validation("view: summary");
        }
        return Items.of(summaryService.list(trainerId(), status));
    }

    /* ── api-contract 1.1 Clients ─────────────────────────────────────────── */

    /** A5 — the end of step 2. 201 the first time, 200 on a replayed id. */
    @PostMapping
    public ResponseEntity<ClientSummary> create(@Valid @RequestBody CreateClientRequest body) {
        var made = writes.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.client().version()).body(made.client());
    }

    /** A4 — POST so the number stays out of URLs and access logs. */
    @PostMapping("/phone-check")
    public ClientPhoneGuard.Verdict phoneCheck(@Valid @RequestBody PhoneCheckRequest body) {
        return writes.phoneCheck(trainerId(), body);
    }

    /** A6 — any subset of the client's own fields; If-Match honoured when sent. */
    @PatchMapping("/{id}")
    public ResponseEntity<ClientSummary> patch(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody UpdateClientRequest body) {
        var row = writes.patch(trainerId(), id, body, ifMatch);
        return ResponseEntity.ok().eTag(row.version()).body(row);
    }

    /* The five verbs. A body is optional on pause, resume and unarchive; those
       two take no fields, and EmptyBody refuses one sent anyway. Delete is the
       one with no way back. */

    @PostMapping("/{id}/pause")
    public StateResult pause(@PathVariable UUID id, @Valid @RequestBody(required = false) PauseRequest body) {
        return states.pause(trainerId(), id, body == null ? new PauseRequest(null) : body);
    }

    @PostMapping("/{id}/resume")
    public StateResult resume(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        return states.resume(trainerId(), id);
    }

    @PostMapping("/{id}/archive")
    public StateResult archive(@PathVariable UUID id, @Valid @RequestBody ArchiveRequest body) {
        return states.archive(trainerId(), id, body);
    }

    @PostMapping("/{id}/unarchive")
    public StateResult unarchive(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        return states.unarchive(trainerId(), id);
    }

    @PostMapping("/{id}/delete")
    public StateResult delete(@PathVariable UUID id, @Valid @RequestBody DeleteClientRequest body) {
        return states.delete(trainerId(), id, body);
    }

    /** A8 — the whole week, conditional: 428 without If-Match, 412 when stale. */
    @PutMapping("/{id}/schedule")
    public ResponseEntity<ScheduleSaved> putSchedule(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody PutScheduleRequest body) {
        var saved = schedules.put(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.schedule().version()).body(saved);
    }

    /* ── api-contract 1.1 Client file ─────────────────────────────────────── */

    /**
     * The header every tab draws. Answers If-None-Match with 304, so a soft
     * navigation between tabs usually costs nothing.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ClientDetail> get(@PathVariable UUID id, WebRequest request) {
        var detail = files.get(trainerId(), id);
        String etag = detail.etag();
        if (request.checkNotModified(etag)) return null;
        return ResponseEntity.ok().eTag(etag).cacheControl(CacheControl.noCache().cachePrivate()).body(detail);
    }

    /** Read out of completed assessments — a correction is an edit to the assessment. */
    @GetMapping("/{id}/readings")
    public Items<Reading> readings(@PathVariable UUID id, @RequestParam(required = false) String key) {
        return Items.of(files.readings(trainerId(), id, key));
    }

    /* Notes — under the client, and the note id under the client too: a note is
       reached through the person it is about, never on its own. */

    @GetMapping("/{id}/notes")
    public Items<Note> listNotes(@PathVariable UUID id) {
        return Items.of(notes.list(trainerId(), id));
    }

    /** 201 the first time, 200 on a replayed id. */
    @PostMapping("/{id}/notes")
    public ResponseEntity<Note> addNote(@PathVariable UUID id, @Valid @RequestBody CreateNoteRequest body) {
        var made = notes.create(trainerId(), id, body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK).body(made.note());
    }

    @PatchMapping("/{id}/notes/{noteId}")
    public Note patchNote(@PathVariable UUID id, @PathVariable UUID noteId,
                          @RequestHeader(value = "If-Match", required = false) String ifMatch,
                          @Valid @RequestBody UpdateNoteRequest body) {
        return notes.patch(trainerId(), id, noteId, ifMatch, body);
    }

    @DeleteMapping("/{id}/notes/{noteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNote(@PathVariable UUID id, @PathVariable UUID noteId) {
        notes.delete(trainerId(), id, noteId);
    }

    @PostMapping("/{id}/notes/{noteId}/restore")
    public Note restoreNote(@PathVariable UUID id, @PathVariable UUID noteId) {
        return notes.restore(trainerId(), id, noteId);
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
