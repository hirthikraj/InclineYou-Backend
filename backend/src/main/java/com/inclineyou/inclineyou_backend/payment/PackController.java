package com.inclineyou.inclineyou_backend.payment;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
 * as every other controller here. There is no DELETE: retiring is
 * `PATCH {"status":"inactive"}`, because a price a package points at can never
 * be removed without rewriting a sale.
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
    public com.inclineyou.inclineyou_backend.wire.Items<PackService.PackRow> listPacks(
            @RequestParam(required = false) String owner,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String include
    ) {
        return com.inclineyou.inclineyou_backend.wire.Items.of(service.list(trainerId(), status, owner, include));
    }

    @PostMapping("/v1/packs")
    @ResponseStatus(HttpStatus.CREATED)
    public PackService.PackResponse createPack(@Valid @RequestBody PackService.CreatePackRequest req) {
        return service.createPack(trainerId(), req);
    }

    /**
     * Partial **by key presence**, not by null: a key you send is applied — `null`
     * included — and a key you omit is untouched. So retiring is
     * `{"status":"inactive"}` and nothing else, and `{"validityDays":null}`
     * genuinely clears an expiry rather than silently keeping it.
     *
     * The body is a raw `Map` for exactly that reason; {@code PackService.PATCHABLE}
     * carries the argument, the whitelist, and why `owner` is refused rather than
     * ignored.
     */
    @PatchMapping("/v1/packs/{packId}")
    public PackService.PackResponse updatePack(
            @PathVariable String packId,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return service.updatePack(trainerId(), packId, body);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
