package com.inclineyou.inclineyou_backend.core.program;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/programs")
@RequiredArgsConstructor
public class ProgramController {

    private final ProgramService programService;
    private final ProgramTemplateService templates;

    /** Pre-v1, for the Programs screen until its pass. A clientId goes to {@link #forClient}. */
    @GetMapping
    public List<ProgramService.ProgramResponse> list() {
        return programService.list(trainerId(), null);
    }

    /** api-contract 1.1 Client file — the client's programs, active first, with progress. */
    @GetMapping(params = "clientId")
    public com.inclineyou.inclineyou_backend.shared.wire.Items<ProgramTemplateService.ClientProgram> forClient(
            @RequestParam UUID clientId) {
        return com.inclineyou.inclineyou_backend.shared.wire.Items.of(templates.forClient(trainerId(), clientId));
    }

    /** api-contract Clients, add-client step 4 — what can be applied. */
    @GetMapping(params = "kind=template")
    public com.inclineyou.inclineyou_backend.shared.wire.Items<ProgramTemplateService.Template> templates() {
        return com.inclineyou.inclineyou_backend.shared.wire.Items.of(templates.templates(trainerId()));
    }

    /** Programs A5 — 201 with the new plan, 200 on a replayed id. */
    @PostMapping("/{templateId}/apply")
    public org.springframework.http.ResponseEntity<ProgramTemplateService.Plan> apply(
            @PathVariable UUID templateId,
            @RequestBody(required = false) java.util.Map<String, Object> body) {
        var applied = templates.apply(trainerId(), templateId, body);
        return org.springframework.http.ResponseEntity.status(applied.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(applied.plan());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProgramService.ProgramResponse create(
            @Valid @RequestBody ProgramService.CreateProgramRequest req) {
        return programService.create(trainerId(), req);
    }

    @GetMapping("/{id}")
    public ProgramService.ProgramResponse get(@PathVariable UUID id) {
        return programService.get(id, trainerId());
    }

    @PutMapping("/{id}")
    public ProgramService.ProgramResponse update(@PathVariable UUID id,
                                                  @RequestBody ProgramService.UpdateProgramRequest req) {
        return programService.update(id, trainerId(), req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        programService.delete(id, trainerId());
    }

    @GetMapping("/{id}/exercises")
    public List<ProgramService.ProgramExerciseResponse> listExercises(@PathVariable UUID id) {
        return programService.listExercises(id, trainerId());
    }

    /**
     * THE CLIENT PLAN BUILDER'S SAVE — the whole prescription in one PUT.
     *
     * `PUT /v1/templates/{id}` is its twin on the blueprint, and the two screens
     * are the same board pointed at two tables. See
     * {@link ProgramService#replaceExercises}: it writes the rows and the copy's
     * own shape, and deliberately does not touch `synced_at`.
     */
    @PutMapping("/{id}/exercises")
    public List<ProgramService.ProgramExerciseResponse> replaceExercises(
            @PathVariable UUID id,
            @RequestBody ProgramService.ReplaceExercisesRequest req) {
        return programService.replaceExercises(id, trainerId(), req);
    }

    @PostMapping("/{id}/exercises")
    @ResponseStatus(HttpStatus.CREATED)
    public ProgramService.ProgramExerciseResponse addExercise(
            @PathVariable UUID id,
            @Valid @RequestBody ProgramService.ProgramExerciseRequest req) {
        return programService.addExercise(id, trainerId(), req);
    }

    @PutMapping("/{id}/exercises/{exId}")
    public ProgramService.ProgramExerciseResponse updateExercise(
            @PathVariable UUID id,
            @PathVariable UUID exId,
            @RequestBody ProgramService.UpdateProgramExerciseRequest req) {
        return programService.updateExercise(id, exId, trainerId(), req);
    }

    @DeleteMapping("/{id}/exercises/{exId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeExercise(@PathVariable UUID id, @PathVariable UUID exId) {
        programService.removeExercise(id, exId, trainerId());
    }

    /**
     * Push the template's current blueprint onto this client's copy.
     *
     * Explicit, one program at a time, and never automatic — a copy is a copy,
     * which is the reason `template` and `program` are two tables. See
     * {@link ProgramService#resync} for what it does and does not touch.
     */
    @PostMapping("/{id}/resync")
    public ProgramService.ResyncResult resync(@PathVariable UUID id) {
        return programService.resync(id, trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
