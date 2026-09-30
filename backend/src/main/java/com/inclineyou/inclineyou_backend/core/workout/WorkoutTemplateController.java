package com.inclineyou.inclineyou_backend.core.workout;

import com.inclineyou.inclineyou_backend.core.workout.dto.WorkoutTemplateItem;
import com.inclineyou.inclineyou_backend.core.workout.dto.WorkoutTemplateRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** The trainer's standalone workouts (Programs L4, A7): {@code /programs/workouts} and the builder's library pane. */
@RestController
@RequestMapping("/v1/workout-templates")
@RequiredArgsConstructor
public class WorkoutTemplateController {

    private final WorkoutTemplateService service;

    @GetMapping
    public Items<WorkoutTemplateItem> list() {
        return Items.of(service.list(trainerId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<WorkoutTemplateItem> get(@PathVariable UUID id) {
        WorkoutTemplateItem item = service.get(trainerId(), id);
        return ResponseEntity.ok().eTag(item.version()).body(item);
    }

    /** 201 with the workout, or 200 when the id was already made by this trainer. */
    @PostMapping
    public ResponseEntity<WorkoutTemplateItem> create(@Valid @RequestBody WorkoutTemplateRequest body) {
        var made = service.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.workout().version()).body(made.workout());
    }

    /** The whole workout, conditional: 428 without If-Match, 412 when stale. */
    @PutMapping("/{id}")
    public ResponseEntity<WorkoutTemplateItem> update(@PathVariable UUID id,
                                                     @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                     @Valid @RequestBody WorkoutTemplateRequest body) {
        WorkoutTemplateItem saved = service.update(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag(saved.version()).body(saved);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
