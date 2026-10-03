package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.shared.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * The nudge template library — a SETTING, which is why it has its own controller and route rather
 * than living under {@code /v1/clients/…}. There is no *Nudges* destination: a nudge is sent from
 * the row of the person it is about, and what is left is the wording — written once, edited rarely,
 * read by every button in the app.
 *
 * <p>{@code STANDARD} tier: editing a sentence spends nothing.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/v1/nudge-templates")
public class NudgeTemplateController {

    private final NudgeTemplateService service;

    /**
     * All eight, merged — the trainer's wording where they have saved one, the built-in where they
     * have not. The web holds no copy of any of it. Cacheable: {@code ETag} / {@code If-None-Match}.
     */
    @GetMapping
    public ResponseEntity<Items<NudgeTemplateService.TemplateResponse>> list(
            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        var rows = service.list(trainerId());
        String etag = "\"" + NudgeTemplateService.listVersion(rows) + "\"";
        if (ifNoneMatch != null && ifNoneMatch.replaceFirst("^W/", "").strip().equals(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).build();
        }
        return ResponseEntity.ok().eTag(etag).body(Items.of(rows));
    }

    /** Save the trainer's own wording for one template. {@code If-Match} required; {@code *} creates the first. */
    @PutMapping("/{name}")
    public NudgeTemplateService.TemplateResponse save(
            @PathVariable String name,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody NudgeTemplateService.SaveTemplateRequest req) {
        return service.save(trainerId(), name, req.body(), ifMatch);
    }

    /** Back to the built-in wording; answers the default so the screen can paint it without a second request. */
    @DeleteMapping("/{name}")
    public NudgeTemplateService.TemplateResponse reset(@PathVariable String name) {
        return service.reset(trainerId(), name);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
