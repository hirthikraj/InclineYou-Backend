package com.inclineyou.inclineyou_backend.core.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * {@code +91} plus a 10-digit number starting 6–9 — the shape
     * {@code app_user_phone_format} actually enforces (and the one
     * {@code api-contract.html}'s {@code PHONE_INVALID} names), not the bare
     * 10 digits an older mobile build sent. Every phone that reaches this
     * backend is stored and compared in this one shape from here on.
     */
    static final String PHONE_PATTERN = "^\\+91[6-9]\\d{9}$";
    static final String PHONE_MESSAGE = "must be a valid Indian mobile number, e.g. +919876543210";

    static final String OTP_PATTERN = "^\\d{6}$";
    static final String OTP_MESSAGE = "must be a 6-digit code";

    public record OtpRequestBody(
            @NotBlank
            @Pattern(regexp = PHONE_PATTERN, message = PHONE_MESSAGE)
            String phone
    ) {}

    public record OtpVerifyBody(
            @NotBlank
            @Pattern(regexp = PHONE_PATTERN, message = PHONE_MESSAGE)
            String phone,

            @NotBlank
            @Pattern(regexp = OTP_PATTERN, message = OTP_MESSAGE)
            String otp
    ) {}


    //Requesting an OTP
    @PostMapping("/otp/request")
    public ResponseEntity<Void> requestOtp(@Valid @RequestBody OtpRequestBody body) {
        authService.requestOtp(body.phone());
        return ResponseEntity.ok().build();
    }

    //Verifying an OTP
    @PostMapping("/otp/verify")
    public ResponseEntity<AuthService.AuthResponse> verifyOtp(@Valid @RequestBody OtpVerifyBody body) {
        return ResponseEntity.ok(authService.verifyOtp(body.phone(), body.otp()));
    }

    /**
     * The notice was accepted on the screen that led here — see
     * api-contract.html#auth-a4. {@code app_user_privacy_pair} requires this
     * alongside {@code privacyAcceptedAt}, which is why the field is required
     * rather than optional: a trainer row with one and not the other is a
     * consent the database cannot represent as either given or not given.
     */
    public record ClaimTrainerBody(
            @NotBlank String privacyPolicyVersion
    ) {}

    //Claiming an app user as "Trainer"
    @PostMapping("/trainer")
    public ResponseEntity<AuthService.AuthResponse> claimTrainer(@Valid @RequestBody ClaimTrainerBody body) {
        var claims = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(authService.claimTrainer(claims.getName(), body.privacyPolicyVersion()));
    }

    /** Accept an invite. Also stamps the privacy acceptance the screen carried. */
    @PostMapping("/membership/{clientId}/accept")
    public ResponseEntity<AuthService.AuthResponse> accept(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.acceptInvite(caller(), clientId));
    }

    /** Decline. The row is kept — the trainer's roster should say what happened. */
    @PostMapping("/membership/{clientId}/decline")
    public ResponseEntity<AuthService.AuthResponse> decline(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.declineInvite(caller(), clientId));
    }

    /**
     * "OK" on the removal notice. The local wipe happens on the phone; this is
     * only what stops the notice being redrawn at every future sign-in.
     */
    @PostMapping("/membership/{clientId}/ack-removal")
    public ResponseEntity<AuthService.AuthResponse> ackRemoval(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.acknowledgeRemoval(caller(), clientId));
    }

    /**
     * "Switch to trainer mode" — for a phone that is also somebody's client
     * and wants the coaching side back. Mints a fresh trainer token; the
     * caller's current token is simply left to expire.
     */
    @PostMapping("/mode/trainer")
    public ResponseEntity<AuthService.AuthResponse> switchToTrainerMode() {
        return ResponseEntity.ok(authService.switchToTrainer(callerPhone()));
    }

    /**
     * "Switch to client mode" — for a trainer whose own number also holds a
     * live membership on somebody else's roster.
     */
    @PostMapping("/mode/client")
    public ResponseEntity<AuthService.AuthResponse> switchToClientMode() {
        return ResponseEntity.ok(authService.switchToClient(callerPhone()));
    }

    /** The token's subject — for every role but trainer, that is the phone. */
    private static String caller() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    /**
     * The signed-in number, however the current token spells it. A trainer
     * token's subject is a trainer UUID; every other role's subject already
     * IS the phone (see {@link JwtService}).
     */
    private String callerPhone() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isTrainerToken = auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_TRAINER".equals(a.getAuthority()));
        return authService.resolveCallerPhone(auth.getName(), isTrainerToken);
    }
}
