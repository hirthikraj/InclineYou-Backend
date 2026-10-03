package com.inclineyou.inclineyou_backend.core.payment;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * `pack` — the PRICE LIST. Its neighbour {@link PackageController} owns
 * `package`, which is what one client bought; see {@link PackService} for why one
 * letter separates two different things.
 *
 * Trainer-scoped by {@code SecurityConfig}'s `anyRequest().hasRole("TRAINER")`
 * and by `WHERE trainer_id` inside every statement — belt and braces, the same
 * as every other controller here. DELETE is only for a pack nothing
 * was sold from; retiring a sold one is `PATCH {"status":"inactive"}`.
 */
@RestController
@RequiredArgsConstructor
public class PackController {

    private final PackService service;

    /**
     * The trainer's price list — both owners, retired entries included.
     *
     * `?owner=trainer|gym` narrows to one of the two lists, which is the read
     * add-client wants: it offers one list or the other depending on who
     * collects, and V19 added `idx_pack_trainer_owner` for exactly that shape.
     * `?status=active` drops what is no longer offered.
     */
    @GetMapping("/v1/packs")
    public com.inclineyou.inclineyou_backend.shared.wire.Items<PackService.PackRow> listPacks(
            @RequestParam(required = false) String owner,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String include
    ) {
        return com.inclineyou.inclineyou_backend.shared.wire.Items.of(service.list(trainerId(), status, owner, include));
    }

    /** 201 the first time, 200 on a replayed id; the version rides as the ETag. */
    @PostMapping("/v1/packs")
    public ResponseEntity<PackService.PackRow> createPack(@RequestBody(required = false) Map<String, Object> body) {
        var made = service.create(trainerId(), body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag("\"" + made.row().version() + "\"").body(made.row());
    }

    /**
     * Any subset, by key presence — a key sent is applied (null included), one
     * omitted is untouched. Archive is {@code {"status":"inactive"}}.
     */
    @PatchMapping("/v1/packs/{packId}")
    public ResponseEntity<PackService.PackRow> updatePack(
            @PathVariable UUID packId,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        var row = service.patch(trainerId(), packId, ifMatch, body);
        return ResponseEntity.ok().eTag("\"" + row.version() + "\"").body(row);
    }

    /** Soft delete, only for a pack nothing was sold from (409 PACK_SOLD); 204, and 204 again. */
    @DeleteMapping("/v1/packs/{packId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePack(@PathVariable UUID packId) {
        service.delete(trainerId(), packId);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
