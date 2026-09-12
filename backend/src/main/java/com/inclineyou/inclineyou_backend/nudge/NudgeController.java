package com.inclineyou.inclineyou_backend.nudge;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Sending a nudge, and reading what has been sent.
 *
 * <h2>The POST is {@code MESSAGING}; the two GETs are not</h2>
 *
 * {@code RateLimitFilter} tiers on {@code POST} + a path ending {@code /nudge},
 * so {@code GET …/nudges} falls to {@code STANDARD} without the filter needing to
 * change — which is right, and the same call V28's dismissals made. A read of the
 * follow-up history spends no WhatsApp and no money, and putting it in the
 * ten-a-minute tier would mean a dashboard load costing the trainer one of the
 * ten messages they are actually allowed to send.
 *
 * <h2>There is no DELETE, and there will not be one</h2>
 *
 * A nudge log is a record that a message was drafted and handed to WhatsApp. The
 * product cannot know whether the trainer pressed send, so it cannot honestly
 * offer to un-send; and deleting the row would reopen the cooldown, which is the
 * one thing the record exists to hold shut. The phone's sync path can soft-delete
 * a row it wrote — that is a device withdrawing its own write, not an undo — and
 * every read here honours {@code deleted_at}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class NudgeController {

    private final NudgeService nudgeService;

    /**
     * {@code templateName} is the catalogue's name. The message itself is NOT in
     * the body and deliberately cannot be: it is rendered server-side from the
     * trainer's own template and the client's live figures, so the amount in a
     * payment reminder and the amount in the money book are the same number read
     * from the same rows. A caller that could pass the text could disagree with
     * the ledger, and the caller most likely to is the screen that just did some
     * arithmetic of its own.
     */
    public record SendNudgeRequest(String templateName) {}

    @PostMapping("/clients/{clientId}/nudge")
    public NudgeService.NudgeResult sendNudge(
            @PathVariable UUID clientId,
            @RequestBody SendNudgeRequest req) {
        return nudgeService.sendNudge(trainerId(), clientId, req.templateName());
    }

    /**
     * Everything sent across the roster, newest first.
     *
     * <p>{@code ?days} defaults to the cooldown window, which is what the caller
     * that matters is asking about: Today's queue reads this to stop raising a
     * row about somebody the trainer messaged yesterday. A client file asking for
     * a history passes a longer span.
     *
     * <p>One trainer-wide read rather than one per client, for the reason
     * {@code GET /v1/packages} exists: the screen has already read the roster,
     * and a per-client route on a dashboard is twenty-two requests against a
     * 120/min ceiling.
     */
    @GetMapping("/nudges")
    public List<NudgeService.NudgeLogResponse> listNudges(
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false) Integer limit) {
        return nudgeService.recentNudges(trainerId(), null, days, limit);
    }

    /** One client's follow-up history — the client file's timeline. */
    @GetMapping("/clients/{clientId}/nudges")
    public List<NudgeService.NudgeLogResponse> listClientNudges(
            @PathVariable UUID clientId,
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false) Integer limit) {
        return nudgeService.recentNudges(trainerId(), clientId, days == null ? 365 : days, limit);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
