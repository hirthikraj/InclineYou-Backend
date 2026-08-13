package com.xrep.xrep_backend.template;

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

    @GetMapping
    public List<TemplateService.TemplateResponse> list() {
        return templateService.list(trainerId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateService.TemplateResponse create(@Valid @RequestBody TemplateService.CreateTemplateRequest req) {
        return templateService.create(trainerId(), req);
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

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
