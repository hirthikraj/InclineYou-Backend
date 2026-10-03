package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentPage;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDeleted;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.Catalog;
import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateScheduleRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.EntryRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.MoveAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.ScheduleItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.UpdateScheduleRequest;
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

import java.util.List;
import java.util.UUID;

/**
 * api-contract 1.1 Assessments — templates, the assessments given from them, the
 * cycles that book those on a rhythm, and the catalogue a template picks from.
 * Instants are epoch ms and every replaceable resource carries a {@code version}.
 */
@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
public class AssessmentController {

    /** Bump when {@link AssessmentCatalogue} changes: the catalogue changes only on a deploy. */
    static final String CATALOG_ETAG = "catalog-2026-09-30";

    private final AssessmentService assessments;
    private final AssessmentEntryService entries;
    private final AssessmentListService list;
    private final AssessmentTemplateService templates;
    private final AssessmentScheduleService schedules;

    /* ── assessments ──────────────────────────────────────────────────────── */

    /** The list — Today L10, the Assessments screen and a client's tab. See {@link AssessmentListService}. */
    @GetMapping("/assessments")
    public AssessmentPage list(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String dueBy,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "false") boolean includeTotal) {
        return list.list(trainerId(), state, clientId, q, dueBy, limit, cursor, includeTotal);
    }

    @GetMapping("/assessments/{id}")
    public ResponseEntity<AssessmentDetail> get(@PathVariable UUID id) {
        var detail = assessments.get(trainerId(), id);
        return ResponseEntity.ok().eTag(detail.item().version()).body(detail);
    }

    /** 201 the first time, 200 on a replayed id. */
    @PostMapping("/assessments")
    public ResponseEntity<AssessmentItem> create(@Valid @RequestBody CreateAssessmentRequest body) {
        var made = assessments.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK).body(made.item());
    }

    /** Record readings and answers — save for later, finish, or correct. If-Match required. */
    @PutMapping("/assessments/{id}/entry")
    public ResponseEntity<AssessmentDetail> entry(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody EntryRequest body) {
        var detail = entries.put(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(detail.item().version()).body(detail);
    }

    /** Move the date; If-Match honoured when sent. */
    @PatchMapping("/assessments/{id}")
    public ResponseEntity<AssessmentItem> move(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody MoveAssessmentRequest body) {
        var moved = assessments.move(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(moved.version()).body(moved);
    }

    @DeleteMapping("/assessments/{id}")
    public AssessmentDeleted delete(@PathVariable UUID id) {
        return assessments.delete(trainerId(), id);
    }

    /* ── templates ────────────────────────────────────────────────────────── */

    /** The shelf. Answers If-None-Match with 304. */
    @GetMapping("/assessment-templates")
    public ResponseEntity<Items<TemplateItem>> templates(WebRequest request) {
        var shelf = templates.list(trainerId());
        String etag = Integer.toHexString(shelf.stream()
                .map(t -> t.id() + ":" + t.version() + ":" + t.liveCycles()).toList().hashCode());
        if (request.checkNotModified(etag)) return null;
        return ResponseEntity.ok().eTag(etag).cacheControl(CacheControl.noCache().cachePrivate()).body(Items.of(shelf));
    }

    /** 201 the first time, 200 on a replayed id. */
    @PostMapping("/assessment-templates")
    public ResponseEntity<TemplateItem> createTemplate(@Valid @RequestBody TemplateRequest body) {
        var made = templates.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.template().version()).body(made.template());
    }

    /** The whole form. If-Match required. */
    @PutMapping("/assessment-templates/{id}")
    public ResponseEntity<TemplateItem> updateTemplate(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody TemplateRequest body) {
        var saved = templates.update(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.version()).body(saved);
    }

    @DeleteMapping("/assessment-templates/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTemplate(@PathVariable UUID id) {
        templates.delete(trainerId(), id);
    }

    /* ── the catalogue ────────────────────────────────────────────────────── */

    @GetMapping("/assessment-catalog")
    public ResponseEntity<Catalog> catalog(WebRequest request) {
        if (request.checkNotModified(CATALOG_ETAG)) return null;
        return ResponseEntity.ok().eTag(CATALOG_ETAG).cacheControl(CacheControl.noCache().cachePrivate()).body(assessments.catalog());
    }

    /* ── cycles ───────────────────────────────────────────────────────────── */

    @GetMapping("/assessment-schedules")
    public Items<ScheduleItem> schedules(@RequestParam(required = false) UUID clientId) {
        return Items.of(schedules.forClient(trainerId(), clientId));
    }

    /** 201 the first time, 200 on a replayed id — which books nothing more. */
    @PostMapping("/assessment-schedules")
    public ResponseEntity<ScheduleItem> createSchedule(@Valid @RequestBody CreateScheduleRequest body) {
        var made = schedules.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.schedule().version()).body(made.schedule());
    }

    /** Move or re-pace; If-Match honoured when sent. */
    @PatchMapping("/assessment-schedules/{id}")
    public ResponseEntity<ScheduleItem> patchSchedule(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @Valid @RequestBody UpdateScheduleRequest body) {
        var saved = schedules.patch(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.version()).body(saved);
    }

    @PostMapping("/assessment-schedules/{id}/end")
    public ResponseEntity<ScheduleItem> endSchedule(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        var ended = schedules.end(trainerId(), id);
        return ResponseEntity.ok().eTag(ended.version()).body(ended);
    }

    @DeleteMapping("/assessment-schedules/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSchedule(@PathVariable UUID id) {
        schedules.delete(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
