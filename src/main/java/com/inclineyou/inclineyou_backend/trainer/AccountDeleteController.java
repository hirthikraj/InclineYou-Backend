package com.inclineyou.inclineyou_backend.trainer;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Closing the account.
 *
 * <p>Its own controller rather than a fifth method on {@link AccountController},
 * because that one is {@code @RequestMapping("/v1/trainers/me/phone")} and this
 * is {@code DELETE /v1/trainers/me} — the resource itself, not the number on it.
 * Hanging it off the phone prefix would have made the path say something untrue
 * about what it removes.
 *
 * <p>A body on a DELETE is unusual and is the correct shape here: the typed
 * confirmation is not an identifier and not a filter, it is a proof, and putting
 * it in the query string would write the trainer's own phone number into every
 * access log and browser history entry between here and the server. Spring and
 * every proxy in this path carry a DELETE body without complaint.
 *
 * <p>{@link AccountService#deleteAccount} carries the rest: why it is a soft
 * delete, why there is no OTP on it, and why the number is not released.
 */
@RestController
@RequestMapping("/v1/trainers/me")
@RequiredArgsConstructor
public class AccountDeleteController {

    private final AccountService service;

    public record DeleteBody(
            /**
             * The trainer's own number, typed back. Compared on the last ten
             * digits, so whichever way the screen formatted it back to them is
             * an answer this accepts.
             */
            @NotBlank String confirmPhone
    ) {}

    @DeleteMapping
    public ResponseEntity<Void> delete(@Valid @RequestBody DeleteBody body) {
        service.deleteAccount(trainerId(), body.confirmPhone());
        // 204: there is nothing left to describe, and a body here would be a
        // description of a thing the caller has just asked us to stop having.
        return ResponseEntity.noContent().build();
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
