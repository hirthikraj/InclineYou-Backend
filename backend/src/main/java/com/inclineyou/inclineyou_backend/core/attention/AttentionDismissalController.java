package com.inclineyou.inclineyou_backend.core.attention;

import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * What the trainer has silenced in *Needs you today*.
 *
 * Three routes and no more: read them all, silence one, put one back — each
 * row addressed by client + kind, because that is the table's key (R1). There is no
 * per-client GET, because the only caller is a dashboard that has just read the
 * whole roster anyway — a per-client route here would be the mistake
 * {@code GET /v1/packages} was added to fix, one request per client on the screen
 * a trainer opens every morning.
 *
 * {@code STANDARD} rate tier. Not {@code MESSAGING}: dismissing a row spends
 * nothing and sends nothing, and clearing six rows in a row must not cost a
 * trainer six of the ten messages a minute they are actually allowed.
 */
@RestController
@RequestMapping("/v1/attention/dismissals")
@RequiredArgsConstructor
public class AttentionDismissalController {

    private final AttentionDismissalService service;

    private UUID trainerId(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    @GetMapping
    public Items<AttentionDismissalService.DismissalResponse> list(Authentication auth) {
        // Bounded — one row per client per kind at most — so {items} and no cursor.
        return Items.of(service.list(trainerId(auth)));
    }

    /**
     * Snooze ("Not now") or silence ("Not again") one row. PUT because it is an
     * upsert on a natural key the caller already knows — the same call extends a
     * snooze or makes it permanent. 200 with the row either way.
     */
    @PutMapping("/{clientId}/{kind}")
    public AttentionDismissalService.DismissalResponse dismiss(
            Authentication auth,
            @PathVariable UUID clientId,
            @PathVariable String kind,
            @Valid @RequestBody AttentionDismissalService.DismissRequest req
    ) {
        return service.dismiss(trainerId(auth), clientId, kind, req);
    }

    /** Put a row back. 204 even when nothing was there — see the service. */
    @DeleteMapping("/{clientId}/{kind}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restore(Authentication auth, @PathVariable UUID clientId, @PathVariable String kind) {
        service.restore(trainerId(auth), clientId, kind);
    }
}
