package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.ApplyRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.Assignment;
import com.inclineyou.inclineyou_backend.core.program.dto.PatchProgramRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.Resynced;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.util.List;
import java.util.UUID;

/**
 * Programs (api-contract 1.1): the trainer's templates and client plans, the
 * InclineYou library, and the verbs that copy, save, retire and apply them.
 * Three kinds of program, one table — the routes differ by who may touch what:
 * a library id answers only under {@code /certified}, and 404 everywhere else.
 */
@RestController
@RequestMapping("/v1/programs")
@RequiredArgsConstructor
public class ProgramController {

    private final ProgramReadService read;
    private final ProgramWriteService write;
    private final ProgramApplyService apply;

    /** L1 — summaries, no tree. {@code clientId} adds {@code progress}, for the client file. */
    @GetMapping
    public Items<ProgramItem> list(@RequestParam(required = false) String kind,
                                   @RequestParam(required = false) UUID clientId,
                                   @RequestParam(required = false) String status) {
        return Items.of(read.list(trainerId(), kind, clientId, status));
    }

    /** L2 — the library, a curated shelf that changes only when the library does: 304 on a repeat. */
    @GetMapping("/certified")
    public ResponseEntity<Items<ProgramItem>> certified(WebRequest request) {
        List<ProgramItem> items = read.certified(trainerId());
        String etag = "\"" + Integer.toHexString(items.hashCode()) + "\"";
        if (request.checkNotModified(etag)) return null;
        return ResponseEntity.ok().eTag(etag).body(Items.of(items));
    }

    @GetMapping("/certified/{id}")
    public ProgramItem certifiedOne(@PathVariable UUID id) {
        return read.certifiedOne(trainerId(), id);
    }

    /** L3 — one program with its whole tree; the version rides as the ETag. */
    @GetMapping("/{id}")
    public ResponseEntity<ProgramItem> get(@PathVariable UUID id) {
        ProgramItem item = read.get(trainerId(), id);
        return ResponseEntity.ok().eTag(item.version()).body(item);
    }

    @GetMapping("/{id}/assignments")
    public Items<Assignment> assignments(@PathVariable UUID id) {
        return Items.of(read.assignments(trainerId(), id));
    }

    /** A1 / A4 — from scratch, or {@code copyFrom}. 201, or 200 on a replayed id. */
    @PostMapping
    public ResponseEntity<ProgramItem> create(@Valid @RequestBody ProgramRequest body) {
        var made = write.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.program().version()).body(made.program());
    }

    /** A2 — the whole tree, conditional: 428 without If-Match, 412 PROGRAM_REVISED when stale. */
    @PutMapping("/{id}")
    public ResponseEntity<ProgramItem> put(@PathVariable UUID id,
                                           @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                           @Valid @RequestBody ProgramRequest body) {
        ProgramItem saved = write.put(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.version()).body(saved);
    }

    /** A3 — a plan's status, or a name, goal or dates; If-Match honoured when sent. */
    @PatchMapping("/{id}")
    public ResponseEntity<ProgramItem> patch(@PathVariable UUID id,
                                             @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                             @Valid @RequestBody PatchProgramRequest body) {
        ProgramItem item = write.patch(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(item.version()).body(item);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        write.delete(trainerId(), id);
    }

    /** A5 — 201 with the new plan and {@code linkedSessions}, 200 on a replayed id. */
    @PostMapping("/{templateId}/apply")
    public ResponseEntity<ProgramItem> apply(@PathVariable UUID templateId, @Valid @RequestBody ApplyRequest body) {
        var applied = apply.apply(trainerId(), templateId, body);
        return ResponseEntity.status(applied.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(applied.plan().version()).body(applied.plan());
    }

    /** A6 — take the source template's latest tree; conditional on the plan's version. */
    @PostMapping("/{id}/resync")
    public Resynced resync(@PathVariable UUID id,
                           @RequestHeader(value = "If-Match", required = false) String ifMatch,
                           @RequestBody(required = false) EmptyBody body) {
        return write.resync(trainerId(), id, ifMatch);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
