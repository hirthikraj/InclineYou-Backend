package com.xrep.xrep_backend.sync;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/sync")
@RequiredArgsConstructor
public class SyncController {

    private final SyncService syncService;

    /**
     * {@code libraryPulledAt} is a SECOND cursor, for the shared exercise
     * library alone.
     *
     * The library is the one collection in the pull that is not the caller's
     * data. Everything else is scoped by {@code trainer_id}, so "what changed
     * since your cursor" is the same question as "what of yours changed"; the
     * library belongs to nobody and the device's relationship to it is not
     * described by that cursor at all. A phone is only ever told about a library
     * row that CHANGED, never about one it simply does not hold — so a device
     * whose cursor is newer than the last {@code ExerciseSeeder} run can be sent
     * a whole workout log and none of the exercises naming it.
     *
     * Two cursors fix that, because the device can hold them independently:
     * library at zero means "I have none of it, send it all", and it advances
     * only when the library itself is applied.
     *
     * Optional, and absent means the pre-existing behaviour — an older build
     * sends one cursor and gets exactly what it got before. It is not the only
     * defence: {@code fetchExercises} also carries the exercise behind any row
     * in THIS pull that names one, which is what makes a log renderable on a
     * device that never asked for a library cursor.
     */
    @GetMapping("/pull")
    public ResponseEntity<SyncService.PullResponse> pull(
            @RequestParam(required = false) Long lastPulledAt,
            @RequestParam(required = false) Long libraryPulledAt) {
        return ResponseEntity.ok(
                syncService.pull(currentTrainerId(), lastPulledAt, libraryPulledAt));
    }

    /**
     * 200 with a body rather than the 204 this used to answer.
     *
     * A push is no longer all-or-nothing: a roster row whose number belongs to a
     * trainer, or to another trainer's client, is refused while everything
     * around it lands. `rejected` is what the app puts in front of the trainer —
     * empty on the overwhelming majority of pushes. WatermelonDB ignores the
     * response body, so this breaks nothing that does not read it.
     */
    @PostMapping("/push")
    public ResponseEntity<SyncService.PushResult> push(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(syncService.push(currentTrainerId(), body));
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
