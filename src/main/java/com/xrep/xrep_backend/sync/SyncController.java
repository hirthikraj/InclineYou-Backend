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

    @PostMapping("/push")
    public ResponseEntity<Void> push(@RequestBody Map<String, Object> body) {
        syncService.push(currentTrainerId(), body);
        return ResponseEntity.noContent().build();
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
