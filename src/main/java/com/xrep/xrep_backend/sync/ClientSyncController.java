package com.xrep.xrep_backend.sync;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * The client half of sync — FR-11.
 *
 * Separate routes rather than a flag on the trainer's, because the two differ in
 * the only way that matters: who the caller is allowed to be. `/v1/sync/**` is
 * gated to ROLE_TRAINER and reads the token's subject as a trainer id; these are
 * gated to ROLE_CLIENT and read it as a phone. A client token can therefore not
 * reach a roster even if a route were mis-typed, and vice versa.
 *
 * `clientId` is a request parameter rather than a claim on purpose: the same
 * person can be on two trainers' rosters, so one sign-in can legitimately hold
 * two client records. It is untrusted input, checked against the token's phone on
 * every request by {@link ClientSyncService#resolve}.
 */
@RestController
@RequestMapping("/v1/client/sync")
@RequiredArgsConstructor
public class ClientSyncController {

    private final ClientSyncService clientSync;

    @GetMapping("/pull")
    public ResponseEntity<SyncService.PullResponse> pull(
            @RequestParam UUID clientId,
            @RequestParam(required = false) Long lastPulledAt) {
        var scope = clientSync.resolve(currentPhone(), clientId);
        return ResponseEntity.ok(clientSync.pull(scope, lastPulledAt));
    }

    @PostMapping("/push")
    public ResponseEntity<Void> push(
            @RequestParam UUID clientId,
            @RequestBody Map<String, Object> body) {
        var scope = clientSync.resolve(currentPhone(), clientId);
        clientSync.push(scope, body);
        return ResponseEntity.noContent().build();
    }

    /** A client token's subject is the number that proved it owns itself. */
    private String currentPhone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
