package com.xrep.xrep_backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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

    /**
     * The numbering plan, in one place because both endpoints have to agree.
     *
     * TRAI allocates only the 6, 7, 8 and 9 series to mobile, so anything else
     * can never receive an SMS. Request enforced this and verify did not, which
     * meant one bad number got two different answers — a 400 naming the problem
     * on the way in, and a 410 "that code has expired" on the way back, for a
     * number that never had a code. Same rule, both doors.
     */
    static final String PHONE_PATTERN = "^[6-9]\\d{9}$";
    static final String PHONE_MESSAGE = "must be a valid 10-digit Indian mobile number";

    /**
     * A code is six digits, and nothing else can be one.
     *
     * Shape, checked before the code is: `abcdef` used to reach
     * {@code bcrypt.matches} and come back as a wrong code, spending one of the
     * three attempts a trainer gets. Nothing that fails this pattern could ever
     * have been the code we sent, so refusing it costs them nothing — the
     * attempt counter is for guesses at a real code, not for typos and pastes.
     *
     * This subsumes the old {@code @Size(min = 6, max = 6)}: `\d{6}` is already
     * exactly six characters, and one message covering both "too short" and
     * "not digits" is the message a trainer can act on either way.
     */
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
            // @NotBlank as well as @Pattern, and not instead of it: @Pattern
            // passes a null through, so blank is only caught by the first one.
            @NotBlank
            @Pattern(regexp = OTP_PATTERN, message = OTP_MESSAGE)
            String otp
    ) {}
}
