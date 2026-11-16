package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.MeResponse;
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
 * <p>The pre-v1 client portal (module 11) used to answer this same path for
 * {@code ROLE_CLIENT} with its own, differently-shaped "my profile" read. The
 * rebuilt portal (in scope since 10 Oct 2026) reads {@code /v1/portal/me}
 * instead ({@code PortalMeController}), so this path is a trainer's alone and
 * {@code SecurityConfig}'s catch-all covers it like any other trainer route —
 * a client or pending session is 403.
 */
@RestController
@RequiredArgsConstructor
public class MeController {

    private final MeService service;

    @GetMapping("/v1/me")
    public MeResponse me() {
        return service.get(trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
