package com.inclineyou.inclineyou_backend.attention;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * What the trainer has silenced in *Needs you today*.
 *
 * Three routes and no more: read them all, silence one, put one back. There is no
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
    public List<AttentionDismissalService.DismissalResponse> list(Authentication auth) {
        return service.list(trainerId(auth));
    }

    /**
     * {@code 201} on both a first dismissal and an extension of one, which is a
     * small lie the alternative does not improve on: the caller cannot tell the two
     * apart before it asks, and a route that answered 200-or-201 would make every
     * client branch on a distinction none of them acts on. The row comes back
     * either way, and its {@code id} is what a DELETE needs.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AttentionDismissalService.DismissalResponse dismiss(
            Authentication auth,
            @Valid @RequestBody AttentionDismissalService.DismissRequest req
    ) {
        return service.dismiss(trainerId(auth), req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restore(Authentication auth, @PathVariable UUID id) {
        service.restore(trainerId(auth), id);
    }
}
