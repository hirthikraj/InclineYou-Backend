package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;
    private final ClientSummaryService summaryService;

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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClientService.ClientResponse create(@Valid @RequestBody ClientService.CreateClientRequest req) {
        return clientService.create(trainerId(), req);
    }

    @PostMapping("/phone-availability")
    public ClientPhoneGuard.Verdict phoneAvailability(
            @Valid @RequestBody ClientService.PhoneCheckRequest req) {
        return clientService.checkPhone(trainerId(), req.phone());
    }

    @GetMapping("/{id}")
    public ClientService.ClientResponse get(@PathVariable UUID id) {
        return clientService.get(trainerId(), id);
    }

    @PutMapping("/{id}")
    public ClientService.ClientResponse update(@PathVariable UUID id,
                                               @RequestBody ClientService.UpdateClientRequest req) {
        return clientService.update(trainerId(), id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        clientService.delete(trainerId(), id);
    }

    /** Read-only since V22: a reading is written by taking an assessment. */
    @GetMapping("/{id}/body-metrics")
    public List<ClientService.BodyMetricResponse> listMetrics(@PathVariable UUID id) {
        return clientService.listMetrics(trainerId(), id);
    }

    /* ── Notes (V29) ──────────────────────────────────────────────────────────
       Under the client, like body metrics, and the note id is under the client
       too on the write routes. It costs one extra path segment and buys an
       ownership check the URL itself states: a note is reached through the
       person it is about, never on its own. */

    @GetMapping("/{id}/notes")
    public List<ClientService.NoteResponse> listNotes(@PathVariable UUID id) {
        return clientService.listNotes(trainerId(), id);
    }

    @PostMapping("/{id}/notes")
    @ResponseStatus(HttpStatus.CREATED)
    public ClientService.NoteResponse addNote(@PathVariable UUID id,
                                              @Valid @RequestBody ClientService.NoteRequest req) {
        return clientService.addNote(trainerId(), id, req);
    }

    @PutMapping("/{id}/notes/{noteId}")
    public ClientService.NoteResponse updateNote(@PathVariable UUID id,
                                                 @PathVariable UUID noteId,
                                                 @RequestBody ClientService.NoteRequest req) {
        return clientService.updateNote(trainerId(), id, noteId, req);
    }

    @DeleteMapping("/{id}/notes/{noteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNote(@PathVariable UUID id, @PathVariable UUID noteId) {
        clientService.deleteNote(trainerId(), id, noteId);
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
