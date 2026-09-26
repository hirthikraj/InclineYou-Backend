package com.inclineyou.inclineyou_backend.trainer.profile;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * {@code GET /v1/me} — see {@link MeService}.
 *
 * <p>A separate path from {@code /v1/trainers/me} ({@link TrainerController}),
 * on purpose: the contract names it {@code /v1/me} because it is the shell's
 * read, shared by every screen's session check, not a trainer sub-resource.
 *
 * <p>The client portal (module 11) used to answer this same path for
 * {@code ROLE_CLIENT} — its own, differently-shaped "my profile" read. The
 * portal is out of v1 scope (`WEB_LAUNCH.md` §3), so that controller was
 * removed rather than kept around to branch on role for a caller that cannot
 * reach it yet; {@code SecurityConfig}'s catch-all now covers this path like
 * any other trainer route.
 */
@RestController
@RequiredArgsConstructor
public class MeController {

    private final MeService service;

    @GetMapping("/v1/me")
    public MeService.MeResponse me() {
        return service.get(trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
