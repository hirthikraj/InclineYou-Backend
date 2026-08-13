package com.xrep.xrep_backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/otp/request")
    public ResponseEntity<Void> requestOtp(@Valid @RequestBody OtpRequestBody body) {
        authService.requestOtp(body.phone());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<AuthService.AuthResponse> verifyOtp(@Valid @RequestBody OtpVerifyBody body) {
        return ResponseEntity.ok(authService.verifyOtp(body.phone(), body.otp()));
    }

    /**
     * Screen 7a · "I'm a trainer".
     *
     * The only authenticated endpoint under /v1/auth. It takes no body: the
     * number comes from the token that was just minted by a successful verify,
     * because a phone in a request body is a phone anybody can type.
     */
    @PostMapping("/trainer")
    public ResponseEntity<AuthService.AuthResponse> claimTrainer() {
        var claims = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(authService.claimTrainer(claims.getName()));
    }

    public record OtpRequestBody(
            @NotBlank
            @Pattern(regexp = "^[6-9]\\d{9}$", message = "must be a valid 10-digit Indian mobile number")
            String phone
    ) {}

    public record OtpVerifyBody(
            @NotBlank String phone,
            @NotBlank @Size(min = 6, max = 6) String otp
    ) {}
}
