package com.inclineyou.inclineyou_backend.nudge;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * The nudge template library — a SETTING, which is why it has its own controller
 * and its own route rather than living under {@code /v1/clients/…}.
 *
 * <p>The product decision this serves: there is no *Nudges* destination. A nudge
 * is sent from the row of the person it is about, and what is left when the
 * sending moves onto the rows is the wording — written once, edited rarely, read
 * by every button in the app. That is a settings screen, and this is the only
 * thing behind it.
 *
 * <p>{@code STANDARD} tier: editing a sentence spends nothing.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/v1/nudge-templates")
public class NudgeTemplateController {

    private final NudgeTemplateService service;

    /**
     * All eight, merged — the trainer's wording where they have saved one, the
     * built-in default where they have not, each row carrying its label, its
     * purpose, its variables and which of the two it is.
     *
     * <p>The web holds no copy of any of this. The root {@code CLAUDE.md} opens
     * with what happens when a policy number lives in three files, and eight
     * message bodies is a worse version of the same thing.
     */
    @GetMapping
    public List<NudgeTemplateService.TemplateResponse> list() {
        return service.list(trainerId());
    }

    /** Save the trainer's own wording for one template. Upsert; idempotent. */
    @PutMapping("/{name}")
    public NudgeTemplateService.TemplateResponse save(
            @PathVariable String name,
            @RequestBody NudgeTemplateService.SaveTemplateRequest req) {
        return service.save(trainerId(), name, req.body());
    }

    /**
     * Back to the built-in wording.
     *
     * <p>Answers the default rather than {@code 204}, so the screen can paint the
     * restored text without a second request — and because "what did it go back
     * to" is the only question a trainer has after pressing Reset.
     */
    @DeleteMapping("/{name}")
    public NudgeTemplateService.TemplateResponse reset(@PathVariable String name) {
        return service.reset(trainerId(), name);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
