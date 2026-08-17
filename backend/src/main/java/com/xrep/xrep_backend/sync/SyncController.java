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

    @GetMapping("/pull")
    public ResponseEntity<SyncService.PullResponse> pull(
            @RequestParam(required = false) Long lastPulledAt) {
        return ResponseEntity.ok(syncService.pull(currentTrainerId(), lastPulledAt));
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
