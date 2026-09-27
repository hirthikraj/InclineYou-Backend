package com.inclineyou.inclineyou_backend.nudge;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.wire.Cursor;
import com.inclineyou.inclineyou_backend.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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
    private final NudgeDraftService drafts;
    private final WorkspaceClock clock;

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
     * api-contract Today L9 — messages drafted on or after {@code from} (a date,
     * workspace timezone; 1.1 replaced the epoch-ms {@code since}), defaulting to
     * the cooldown window. One trainer-wide read rather than one per client: the
     * screen has already read the roster.
     */
    @GetMapping("/nudges")
    public Page<NudgeService.NudgeSummary> listNudges(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String include,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor) {
        boolean withMessage = false;
        if (include != null && !include.isBlank()) {
            for (String one : include.split(",")) {
                if (!"message".equals(one.strip())) throw ApiException.validation("include: only 'message'");
                withMessage = true;
            }
        }
        UUID client = null;
        if (clientId != null && !clientId.isBlank()) {
            try {
                client = UUID.fromString(clientId.strip());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
        }
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        return nudgeService.list(trainerId(), fromDate, client, withMessage,
                Cursor.limit(limit, 500, 1000), Cursor.decode(cursor), clock.zone());
    }

    /**
     * api-contract Today A2 — draft a message, log it, return the wa.me link.
     * MESSAGING tier. 201 the first time; a replayed {@code id} answers 200 from
     * the row it wrote.
     */
    @PostMapping("/clients/{clientId}/nudges")
    public ResponseEntity<NudgeDraftService.Draft> draftNudge(
            @PathVariable UUID clientId,
            @RequestBody(required = false) NudgeDraftService.DraftRequest req) {
        var drafted = drafts.draft(trainerId(), clientId, req);
        return ResponseEntity.status(drafted.created() ? HttpStatus.CREATED : HttpStatus.OK).body(drafted.draft());
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
