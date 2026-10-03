package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.ClaimTrainerRequest;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /v1/trainers} — become a trainer, the new-number sign-up
 * (api-contract, Sign in). A create on the trainers collection, so it is not
 * under {@code /v1/auth}.
 *
 * <p>Open to the one credential that cannot call anything else: the 15-minute
 * {@code pending} token {@code otp/verify} hands a number with no account, and
 * to a trainer's own session, for the repeat call. {@code SecurityConfig} names
 * the path; every other route still wants {@code ROLE_TRAINER}.
 */
@RestController
@RequiredArgsConstructor
public class TrainerSignUpController {

    private final AuthService authService;

    /** 201 the first time; 200 when the account was already there. */
    @PostMapping("/v1/trainers")
    public ResponseEntity<AuthResponse> becomeTrainer(
            @RequestBody(required = false) ClaimTrainerRequest body, HttpServletRequest request) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        String role = auth.getAuthorities().stream()
                .map(a -> a.getAuthority().substring("ROLE_".length()).toLowerCase())
                .findFirst().orElse("");
        var claimed = authService.becomeTrainer(auth.getName(), role,
                (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE), body);
        return ResponseEntity.status(claimed.created() ? HttpStatus.CREATED : HttpStatus.OK).body(claimed.body());
    }
}
