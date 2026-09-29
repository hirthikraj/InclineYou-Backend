package com.inclineyou.inclineyou_backend.core.assessment;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V14 · assessments, trainer side: the templates, the ones sent, and the
 * catalogue a template picks from. Timestamps on these routes are ISO strings.
 */
@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
public class AssessmentController {

    private final AssessmentService assessments;
    private final AssessmentTemplateService templates;
    private final AssessmentListService list;

    /* ── sent assessments ─────────────────────────────────────────────────── */

    /** The v1 list — Today L10 and the Assessments screen. See {@link AssessmentListService}. */
    @GetMapping("/assessments")
    public AssessmentListService.Page list(
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
    public AssessmentService.Detail get(@PathVariable UUID id) {
        return assessments.get(trainerId(), id);
    }

    @PostMapping("/assessments")
    @ResponseStatus(HttpStatus.CREATED)
    public AssessmentService.Row create(@RequestBody(required = false) Map<String, Object> body) {
        return assessments.create(trainerId(), body);
    }

    @PatchMapping("/assessments/{id}")
    public AssessmentService.Row patch(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return assessments.patch(trainerId(), id, body);
    }

    @DeleteMapping("/assessments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        assessments.delete(trainerId(), id);
    }

    /* ── templates ────────────────────────────────────────────────────────── */

    @GetMapping("/assessment-templates")
    public List<AssessmentTemplateService.TemplateResponse> templates() {
        return templates.list(trainerId());
    }

    @GetMapping("/assessment-templates/{id}")
    public AssessmentTemplateService.TemplateResponse template(@PathVariable UUID id) {
        return templates.get(trainerId(), id);
    }

    @PostMapping("/assessment-templates")
    @ResponseStatus(HttpStatus.CREATED)
    public AssessmentTemplateService.TemplateResponse createTemplate(@RequestBody(required = false) Map<String, Object> body) {
        return templates.create(trainerId(), body);
    }

    @PutMapping("/assessment-templates/{id}")
    public AssessmentTemplateService.TemplateResponse updateTemplate(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return templates.update(trainerId(), id, body);
    }

    @DeleteMapping("/assessment-templates/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTemplate(@PathVariable UUID id) {
        templates.delete(trainerId(), id);
    }

    /* ── the catalogue ────────────────────────────────────────────────────── */

    @GetMapping("/assessment-catalog")
    public AssessmentService.Catalog catalog() {
        return assessments.catalog();
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
