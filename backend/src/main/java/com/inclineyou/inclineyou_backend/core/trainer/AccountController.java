package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.ConfirmNewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.NewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.PhoneChangedResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.TicketResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.VerifyCurrentPhoneRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * THE ACCOUNT ROUTES — the login itself, and the way out.
 *
 * <p>Separate from {@link TrainerController}, which is one GET and one PATCH
 * over a profile. Everything here rewrites or retires an identity and each call
 * carries a proof that a profile PATCH has no concept of, so folding them into
 * {@code /v1/trainers/me} would have put four side-effecting verbs behind an
 * endpoint whose whole contract is <i>null means leave it alone</i>.
 *
 * <p>They sit under {@code /v1/trainers/me/} regardless, because that is the
 * resource: {@code SecurityConfig}'s {@code anyRequest().hasRole("TRAINER")}
 * covers the prefix, so a client token, an invited token and a phone-change
 * ticket presented as a bearer are all refused before any of this runs.
 *
 * <p>{@link AccountService} carries the argument for the four-step shape and for
 * why deletion is a soft delete. The one thing worth repeating at the door: the
 * codes are {@link com.inclineyou.inclineyou_backend.core.auth.OtpService}'s, so every wait,
 * lock and daily ceiling that governs sign-in governs this too, per number.
 */
@RestController
@RequestMapping("/v1/trainers/me/phone")
@RequiredArgsConstructor
@Validated
public class AccountController {

    private final AccountService service;

    /** 1 · a code to the number they are signed in with. No body: it is the token's. */
    @PostMapping("/challenge")
    public ResponseEntity<Void> challenge() {
        service.challengeCurrentPhone(trainerId());
        return ResponseEntity.ok().build();
    }

    /** 2 · that code back. The ticket is the memory that this step happened. */
    @PostMapping("/verify")
    public TicketResponse verify(@Valid @RequestBody VerifyCurrentPhoneRequest body) {
        return new TicketResponse(service.verifyCurrentPhone(trainerId(), body));
    }

    /** 3 · the new number, checked for availability before an SMS is spent on it. */
    @PostMapping("/request")
    public ResponseEntity<Void> request(@Valid @RequestBody NewPhoneRequest body) {
        service.requestNewPhone(trainerId(), body);
        return ResponseEntity.ok().build();
    }

    /** 4 · the code from the new number, and the swap. Answers a fresh token. */
    @PostMapping("/confirm")
    public PhoneChangedResponse confirm(@Valid @RequestBody ConfirmNewPhoneRequest body) {
        return service.confirmNewPhone(trainerId(), body);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
