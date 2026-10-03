package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.ConsentRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.TrainerResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.UpdateTrainerRequest;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * The trainer's own profile — api-contract v1.1 Settings. Four routes, and three of them are verbs:
 * a profile save ({@code PATCH}) is separate from accepting the privacy notice and from finishing
 * setup, so each of those is one auditable write rather than a flag riding on a profile save.
 *
 * <p>STANDARD tier — nothing here sends a message.
 */
@RestController
@RequestMapping("/v1/trainers")
@RequiredArgsConstructor
public class TrainerController {

    private final TrainerService service;

    /** The full profile; the version rides as the ETag, and an unchanged one answers 304. */
    @GetMapping("/me")
    public ResponseEntity<TrainerResponse> me(
            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        TrainerResponse profile = service.get(trainerId());
        if (matches(ifNoneMatch, profile.version())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag(profile)).build();
        }
        return ok(profile);
    }

    /** Absent = untouched, null or empty = clear. {@code If-Match} is honoured when sent (412). */
    @PatchMapping("/me")
    public ResponseEntity<TrainerResponse> update(
            @Valid @RequestBody UpdateTrainerRequest req,
            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.update(trainerId(), req, ifMatch));
    }

    /** Accept the privacy notice in force. Idempotent; the original date is kept. */
    @PostMapping("/me/consent")
    public ResponseEntity<TrainerResponse> consent(@RequestBody(required = false) ConsentRequest req) {
        return ok(service.acceptPrivacy(trainerId(), req == null ? null : req.policyVersion()));
    }

    /** Finish onboarding — Done, or Skip to home. Stamped once, never un-stamped. */
    @PostMapping("/me/setup/complete")
    public ResponseEntity<TrainerResponse> completeSetup(@RequestBody(required = false) EmptyBody body) {
        return ok(service.completeSetup(trainerId()));
    }

    private static ResponseEntity<TrainerResponse> ok(TrainerResponse p) {
        return ResponseEntity.ok().eTag(etag(p)).body(p);
    }

    private static String etag(TrainerResponse p) {
        return "\"" + p.version() + "\"";
    }

    private static boolean matches(String header, String version) {
        if (header == null || header.isBlank()) return false;
        return header.strip().replaceFirst("^W/", "").replace("\"", "").equals(version);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
