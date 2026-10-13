package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.trainer.dto.StepUpRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.StepUpTicketResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.StepUpVerifyRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * {@code /v1/auth/step-up} — prove it's you again before changing the number or
 * closing the account (api-contract v1.1, Settings A9). It sits under {@code
 * /v1/auth/} because that is what it is, and in this slice because it needs the
 * trainer; {@code SecurityConfig} requires a TRAINER here, since the rest of that
 * prefix is public. AUTH rate tier by that prefix.
 */
@RestController
@RequestMapping("/v1/auth/step-up")
@RequiredArgsConstructor
public class StepUpController {

    private final StepUpService service;

    /** A code to the current number. */
    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void send(@Valid @RequestBody StepUpRequest body) {
        if (isClient()) service.sendToClient(name(), body.purpose());
        else service.send(trainerId(), body.purpose());
    }

    /** That code back; the ticket is valid ten minutes, once, for this purpose and this session. */
    @PostMapping("/verify")
    public StepUpTicketResponse verify(@Valid @RequestBody StepUpVerifyRequest body, HttpServletRequest request) {
        String raw = (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
        return isClient() ? service.verifyForClient(name(), body.purpose(), body.otp(), raw) : service.verify(trainerId(), body.purpose(), body.otp(), raw);
    }

    /** A client's session is a person with a phone, not a trainer id — {@code SecurityConfig} admits both roles here. */
    private static boolean isClient() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().anyMatch(a -> "ROLE_CLIENT".equals(a.getAuthority()));
    }

    private static String name() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
