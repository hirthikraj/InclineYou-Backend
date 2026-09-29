package com.inclineyou.inclineyou_backend.core.template;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/templates")
@RequiredArgsConstructor
public class TemplateController {

    private final TemplateService templateService;
    private final CertifiedService certifiedService;

    @GetMapping
    public List<TemplateService.TemplateResponse> list() {
        return templateService.list(trainerId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateService.TemplateResponse create(@Valid @RequestBody TemplateService.CreateTemplateRequest req) {
        return templateService.create(trainerId(), req);
    }

    /*
     * ── V11 · THE CERTIFIED SHELF ─────────────────────────────────────────
     * Declared BEFORE `/{id}`. Before these existed, `GET /v1/templates/
     * certified` bound "certified" to the UUID-typed `{id}` and answered 400,
     * not 404 — which is what a literal path next to a typed variable does.
     */
    @GetMapping("/certified")
    public List<CertifiedService.CertifiedResponse> certified() {
        return certifiedService.list(trainerId());
    }

    @GetMapping("/certified/{id}")
    public CertifiedService.CertifiedResponse certifiedOne(@PathVariable UUID id) {
        return certifiedService.get(trainerId(), id);
    }

    @PostMapping("/certified/{id}/copy")
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateService.TemplateResponse copyCertified(
            @PathVariable UUID id,
            @RequestBody(required = false) CertifiedService.CopyRequest req) {
        return certifiedService.copy(trainerId(), id, req);
    }

    @GetMapping("/{id}")
    public TemplateService.TemplateResponse get(@PathVariable UUID id) {
        return templateService.get(id, trainerId());
    }

    @PutMapping("/{id}")
    public TemplateService.TemplateResponse update(@PathVariable UUID id,
                                                    @RequestBody TemplateService.UpdateTemplateRequest req) {
        return templateService.update(id, trainerId(), req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        templateService.delete(id, trainerId());
    }

    @PostMapping("/{id}/apply")
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateService.ProgramSummary apply(@PathVariable UUID id,
                                                 @Valid @RequestBody TemplateService.ApplyTemplateRequest req) {
        return templateService.apply(id, trainerId(), req);
    }

    /**
     * The most-used action on the shelf. A route rather than a read-then-write
     * in the browser: one round trip, and the blueprint is copied as STORED, so
     * a key this build has no field for survives the copy.
     */
    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateService.TemplateResponse duplicate(@PathVariable UUID id,
                                                       @RequestBody(required = false) DuplicateRequest req) {
        return templateService.duplicate(id, trainerId(), req == null ? null : req.name());
    }

    public record DuplicateRequest(String name) {}

    /** Who is on a copy of this template, and which copies have fallen behind it. */
    @GetMapping("/{id}/assignments")
    public List<TemplateService.AssignmentResponse> assignments(@PathVariable UUID id) {
        return templateService.assignments(id, trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
