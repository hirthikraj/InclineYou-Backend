package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.core.nudge.dto.Draft;
import com.inclineyou.inclineyou_backend.core.nudge.dto.DraftRequest;
import com.inclineyou.inclineyou_backend.core.nudge.dto.NudgeSummary;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Drafting a nudge, and reading what has been drafted.
 *
 * <h2>The POST is {@code MESSAGING}; the GET is not</h2>
 *
 * {@code RateLimitFilter} tiers on {@code POST} + a path ending {@code /nudges}, so {@code GET /v1/nudges} falls to
 * {@code STANDARD} without the filter needing to change — which is right: a read of the follow-up history spends no
 * WhatsApp and no money, and putting it in the ten-a-minute tier would mean a dashboard load costing the trainer one
 * of the ten messages they are actually allowed to draft.
 *
 * <h2>There is no DELETE, and there will not be one</h2>
 *
 * See {@link NudgeReadService}: the log is the record that holds the cooldown shut.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class NudgeController {

    private final NudgeReadService reads;
    private final NudgeDraftService drafts;

    /**
     * api-contract Today L9 / Client file L3 — messages drafted on or after {@code from} (a date, workspace
     * timezone), defaulting to the cooldown window; one client with {@code clientId}, the wording with
     * {@code include=message}.
     */
    @GetMapping("/nudges")
    public Page<NudgeSummary> listNudges(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String include,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor) {
        return reads.list(trainerId(), from, clientId, include, limit, cursor);
    }

    /**
     * api-contract Today A2 — draft a message, log it, return the wa.me link. MESSAGING tier. 201 the first time; a
     * replayed {@code id} answers 200 from the row it wrote.
     */
    @PostMapping("/clients/{clientId}/nudges")
    public ResponseEntity<Draft> draftNudge(
            @PathVariable UUID clientId,
            @RequestBody(required = false) DraftRequest req) {
        var drafted = drafts.draft(trainerId(), clientId, req);
        return ResponseEntity.status(drafted.created() ? HttpStatus.CREATED : HttpStatus.OK).body(drafted.draft());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
