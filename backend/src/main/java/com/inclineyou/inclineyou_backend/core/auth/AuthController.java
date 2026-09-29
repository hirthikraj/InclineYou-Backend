package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.ClaimTrainerRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
import jakarta.validation.Valid;
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

    //Requesting an OTP
    @PostMapping("/otp/request")
    public ResponseEntity<Void> requestOtp(@Valid @RequestBody SendOtpRequest body) {
        authService.requestOtp(body);
        return ResponseEntity.ok().build();
    }

    //Verifying an OTP
    @PostMapping("/otp/verify")
    public ResponseEntity<AuthResponse> verifyOtp(@Valid @RequestBody VerifyOtpRequest body) {
        return ResponseEntity.ok(authService.verifyOtp(body));
    }

    //Claiming an app user as "Trainer"
    @PostMapping("/trainer")
    public ResponseEntity<AuthResponse> claimTrainer(@Valid @RequestBody ClaimTrainerRequest body) {
        var claims = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(authService.claimTrainer(claims.getName(), body));
    }

    /** Accept an invite. Also stamps the privacy acceptance the screen carried. */
    @PostMapping("/membership/{clientId}/accept")
    public ResponseEntity<AuthResponse> accept(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.acceptInvite(caller(), clientId));
    }

    /** Decline. The row is kept — the trainer's roster should say what happened. */
    @PostMapping("/membership/{clientId}/decline")
    public ResponseEntity<AuthResponse> decline(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.declineInvite(caller(), clientId));
    }

    /**
     * "OK" on the removal notice. The local wipe happens on the phone; this is
     * only what stops the notice being redrawn at every future sign-in.
     */
    @PostMapping("/membership/{clientId}/ack-removal")
    public ResponseEntity<AuthResponse> ackRemoval(@PathVariable UUID clientId) {
        return ResponseEntity.ok(authService.acknowledgeRemoval(caller(), clientId));
    }

    /**
     * "Switch to trainer mode" — for a phone that is also somebody's client
     * and wants the coaching side back. Mints a fresh trainer token; the
     * caller's current token is simply left to expire.
     */
    @PostMapping("/mode/trainer")
    public ResponseEntity<AuthResponse> switchToTrainerMode() {
        return ResponseEntity.ok(authService.switchToTrainer(callerPhone()));
    }

    /**
     * "Switch to client mode" — for a trainer whose own number also holds a
     * live membership on somebody else's roster.
     */
    @PostMapping("/mode/client")
    public ResponseEntity<AuthResponse> switchToClientMode() {
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
