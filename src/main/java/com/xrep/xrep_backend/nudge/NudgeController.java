package com.xrep.xrep_backend.nudge;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class NudgeController {

    private final NudgeService nudgeService;

    public record SendNudgeRequest(String templateName) {}

    @PostMapping("/clients/{clientId}/nudge")
    public NudgeService.NudgeResult sendNudge(
            @PathVariable UUID clientId,
            @RequestBody SendNudgeRequest req) {
        UUID trainerId = UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
        return nudgeService.sendNudge(trainerId, clientId, req.templateName());
    }
}
