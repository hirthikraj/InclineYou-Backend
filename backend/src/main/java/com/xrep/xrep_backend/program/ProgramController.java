package com.xrep.xrep_backend.program;

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

    @GetMapping
    public List<ProgramService.ProgramResponse> list(
            @RequestParam(required = false) String clientId) {
        return programService.list(trainerId(), clientId);
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

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
