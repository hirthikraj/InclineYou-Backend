package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * api-contract Business — the gym's side of the money book: the split
 * ({@code /v1/money/gym}), the pay terms ({@code /v1/gym-arrangements}) and what
 * the gym has paid ({@code /v1/trainer-payouts}). STANDARD tier: nothing here
 * sends a message. Trainer-scoped by {@code SecurityConfig} and by
 * {@code WHERE trainer_id}; a wrong id is a 404.
 */
@RestController
@RequiredArgsConstructor
public class GymController {

    private final GymMoneyService money;
    private final GymArrangementService arrangements;
    private final TrainerPayoutService payouts;

    @GetMapping("/v1/money/gym")
    public GymMoneyService.GymMoney gym(@RequestParam(required = false) String from,
                                        @RequestParam(required = false) String to) {
        return money.get(trainerId(), from, to);
    }

    // ── gym arrangements ──────────────────────────────────────────────────────

    @GetMapping("/v1/gym-arrangements")
    public Items<GymArrangementService.Arrangement> listArrangements() {
        return Items.of(arrangements.list(trainerId()));
    }

    @PostMapping("/v1/gym-arrangements")
    public ResponseEntity<GymArrangementService.Arrangement> createArrangement(
            @RequestBody(required = false) Map<String, Object> body) {
        var c = arrangements.create(trainerId(), body);
        return ResponseEntity.status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.arrangement());
    }

    @PatchMapping("/v1/gym-arrangements/{id}")
    public ResponseEntity<GymArrangementService.Arrangement> patchArrangement(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body) {
        var a = arrangements.patch(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag("\"" + a.version() + "\"").body(a);
    }

    @DeleteMapping("/v1/gym-arrangements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteArrangement(@PathVariable UUID id) {
        arrangements.delete(trainerId(), id);
    }

    // ── trainer payouts ───────────────────────────────────────────────────────

    @GetMapping("/v1/trainer-payouts")
    public TrainerPayoutService.PayoutPage listPayouts(
            @RequestParam(required = false) String gymName,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor) {
        return payouts.list(trainerId(), gymName, from, to, limit, cursor);
    }

    @PostMapping("/v1/trainer-payouts")
    public ResponseEntity<TrainerPayoutService.Payout> createPayout(@RequestBody(required = false) Map<String, Object> body) {
        var c = payouts.create(trainerId(), body);
        return ResponseEntity.status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.payout());
    }

    @PatchMapping("/v1/trainer-payouts/{id}")
    public ResponseEntity<TrainerPayoutService.Payout> patchPayout(
            @PathVariable UUID id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) Map<String, Object> body) {
        var p = payouts.patch(trainerId(), id, ifMatch, body);
        return ResponseEntity.ok().eTag("\"" + p.version() + "\"").body(p);
    }

    @DeleteMapping("/v1/trainer-payouts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePayout(@PathVariable UUID id) {
        payouts.delete(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
