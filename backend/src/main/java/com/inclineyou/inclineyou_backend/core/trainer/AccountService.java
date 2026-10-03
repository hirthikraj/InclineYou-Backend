package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.SessionStore;
import com.inclineyou.inclineyou_backend.core.auth.SessionTokenIssuer;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.ConfirmNewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.DeleteAccountRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.NewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.PhoneChangedResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

/**
 * THE ACCOUNT — changing the number the trainer signs in with, and closing the
 * account down. Both need a STEP-UP TICKET ({@link StepUpService}): a fresh code to
 * the number the account is signed in with, traded for a ten-minute ticket bound to
 * this session and this purpose.
 *
 * <p>Both are separate from {@link TrainerService} on purpose. That class edits a
 * profile: every field on it is nullable, every write means <i>leave the rest
 * alone</i>, and the worst outcome of getting one wrong is a stale bio. These two
 * rewrite an IDENTITY — the row sign-in resolves, in two tables — and each needs a
 * proof the profile endpoint has no concept of.
 *
 * <h2>Changing a number is a step-up and two requests</h2>
 *
 * <pre>
 *   0. POST /v1/auth/step-up {phone_change}          → a code to the CURRENT number
 *      POST /v1/auth/step-up/verify                   → that code back; a ticket
 *   1. POST /v1/trainers/me/phone/request             → ticket + new number; a code to IT
 *   2. POST /v1/trainers/me/phone/confirm             → ticket + new number + its code
 * </pre>
 *
 * <p><b>Two numbers are proved, not one.</b> The old number stops a stolen session
 * from walking an account away: a bearer token is seven days long and lives in a
 * cookie, so anybody holding one could otherwise re-point the account at a number
 * they control and lock the trainer out of their own book. The new number has to
 * be proved too, for the mirror reason — a typo in the last digit of a number
 * nobody checks is an account that has moved to a stranger's phone and can never
 * be signed into again.
 *
 * <p><b>The confirm ends every OTHER session.</b> The number is the credential, so
 * every browser that was signed in on the old one is signed out
 * ({@code revoked_reason = 'phone_changed'}); the one that made the change
 * survives, so nothing on this screen signs out. That is why no new token comes
 * back (v1.1): the caller keeps the one it has.
 *
 * <h2>And closing an account is a soft delete, honestly described</h2>
 *
 * <p>There is no hard delete and there cannot be a cheap one: {@code
 * client.trainer_id} is NOT NULL and twenty tables hang off {@code client} in turn,
 * so removing the row would take a year of somebody's sessions, packages and
 * payments with it — including the ones a gym or a CA may still need. What {@code
 * DELETE /v1/trainers/me} does is stamp {@code deleted_at} on {@code trainer} and on
 * {@code app_user}, which is exactly what sign-in reads, and end every session. The
 * number stops resolving, every route stops loading, and the data stops being
 * reachable through the product.
 *
 * <p><b>The number is not released, and the screen says so before the button
 * works.</b> Both phone columns are plain UNIQUE indexes rather than partial on
 * {@code deleted_at}, so the deleted row keeps the number and a fresh sign-up on it
 * is refused. That is deliberate — see V36 — and it is the one consequence of
 * deletion a trainer cannot discover by trying it once.
 *
 * <p><b>The confirmation is the ticket now</b> (v1.1). It used to be the number
 * typed back, which anybody at an unlocked desktop could do; a fresh code to the
 * phone cannot be.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountService {

    private final TrainerRepository trainerRepo;
    private final AppUserRepository appUserRepo;
    private final OtpService otpService;
    private final StepUpService stepUp;
    private final SessionStore sessions;

    /* ─────────────────────────────────────────────────── changing a number ── */

    /**
     * The new number, and a code to it.
     *
     * <p>The availability check runs HERE rather than only at the confirm, so a
     * number that can never work is refused before a message is spent on it and
     * before the trainer waits for a code that would have been rejected anyway. It
     * runs again at the confirm, because two minutes is long enough for somebody
     * else to sign up in between.
     */
    public void requestNewPhone(UUID trainerId, NewPhoneRequest req, String rawToken) {
        stepUp.require(req.ticket(), StepUpService.PHONE_CHANGE, trainerId, rawToken);
        String newPhone = requireValidPhone(req.phone());
        requireAvailable(phoneOf(load(trainerId)), newPhone);
        otpService.send(newPhone);
    }

    /**
     * The code from the new number, and the swap.
     *
     * <p>One transaction over the number and the sessions. {@code app_user} is what
     * sign-in resolves and {@code trainer} is what every authorised request loads
     * (reached through the fixed FK, so there is no second copy of the number to
     * keep in step), and the other sessions are ended in the same commit: a change
     * that landed without them is an old browser still signed in as the old number.
     */
    @Transactional
    public PhoneChangedResponse confirmNewPhone(UUID trainerId, ConfirmNewPhoneRequest req, String rawToken) {
        stepUp.require(req.ticket(), StepUpService.PHONE_CHANGE, trainerId, rawToken);
        String newPhone = requireValidPhone(req.phone());
        Trainer t = load(trainerId);
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        String previous = user.getPhone();

        requireAvailable(previous, newPhone);
        otpService.verify(newPhone, req.otp());

        user.setPhone(newPhone);
        appUserRepo.save(user);
        sessions.revokeOthers(trainerId.toString(), currentSessionHash(rawToken), Instant.now(), SessionStore.PHONE_CHANGED);

        log.info("trainer {} changed phone {} → {}", trainerId, masked(previous), masked(newPhone));
        return new PhoneChangedResponse(newPhone);
    }

    /* ───────────────────────────────────────────────────── closing it down ── */

    /**
     * Soft delete on both tables and every session ended, behind a step-up ticket
     * (header {@code X-Step-Up-Ticket}, purpose {@code account_deletion}).
     *
     * <p><b>DEPRECATED transitional path:</b> with no ticket but the old body
     * ({@code confirmPhone}) the number-typed-back confirmation still works, so the
     * web's current Delete keeps working until it moves. Remove after the web
     * migration; with neither, the answer is {@code 403 STEP_UP_REQUIRED}.
     *
     * <p>Idempotent by way of {@link #load}: a second call finds no live trainer
     * and 404s, which is the honest answer to deleting something already gone.
     */
    @Transactional
    public void deleteAccount(UUID trainerId, String ticket, DeleteAccountRequest legacy, String rawToken) {
        Trainer t = load(trainerId);
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        String phone = user.getPhone();

        if (ticket != null && !ticket.isBlank()) {
            stepUp.require(ticket, StepUpService.ACCOUNT_DELETION, trainerId, rawToken);
        } else if (legacy != null && legacy.confirmPhone() != null) {
            requireTypedPhone(legacy.confirmPhone(), phone);
        } else {
            throw AccountRuleException.stepUpRequired();
        }

        Instant now = Instant.now();
        t.setDeletedAt(now);
        trainerRepo.save(t);

        user.setDeletedAt(now);
        appUserRepo.save(user);
        // Every credential this account holds, this one included: there is nothing
        // left for it to open. `erased` is kept for the later erasure step.
        sessions.revokeAllForSubject(trainerId.toString(), now, SessionStore.SIGN_OUT_ALL);

        log.info("trainer {} deleted their account ({})", trainerId, masked(phone));
    }

    /* ────────────────────────────────────────────────────────────── helpers ── */

    private Trainer load(UUID trainerId) {
        return trainerRepo.findById(trainerId)
                .filter(t -> t.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
    }

    /** The sign-in number behind a trainer row — always exactly one, via the FK. */
    private String phoneOf(Trainer t) {
        return appUserRepo.findById(t.getAppUserId())
                .map(AppUser::getPhone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
    }

    /** The number must be one sign-in accepts, and a refusal is named so the screen can say it under the field. */
    private static String requireValidPhone(String phone) {
        if (phone == null || !phone.strip().matches(SendOtpRequest.PHONE_PATTERN)) {
            throw AccountRuleException.phoneInvalid();
        }
        return phone.strip();
    }

    /**
     * Is the number free, and is it actually a move?
     *
     * <p>"Free" means no {@code app_user} row on it at all, live or not. Soft-deleted
     * rows still hold their number, which is what makes a deleted account's phone
     * unavailable — the same rule stated from the other side in {@link
     * #deleteAccount}, and why the query does not filter on {@code deleted_at}.
     * The refusal does not say who has it: this endpoint must not become <i>is this
     * number on InclineYou</i> for any number in India, one request at a time.
     */
    private void requireAvailable(String currentPhone, String newPhone) {
        if (newPhone.equals(currentPhone)) throw AccountRuleException.samePhone();
        if (appUserRepo.findByPhone(newPhone).isPresent()) throw AccountRuleException.phoneTaken();
    }

    /** The legacy typed confirmation, compared on the last ten digits so formatting does not matter. */
    private static void requireTypedPhone(String confirmPhone, String phone) {
        String typed = confirmPhone.replaceAll("\\D", "");
        if (typed.length() < 10 || !typed.endsWith(last10(phone))) {
            throw AccountRuleException.confirmationMismatch();
        }
    }

    /** The hash of the session this request came in on — the one to keep. Null for a JWT caller. */
    private static String currentSessionHash(String rawToken) {
        return rawToken != null && rawToken.startsWith(SessionTokenIssuer.PREFIX)
                ? SessionTokenIssuer.hash(rawToken) : null;
    }

    private static String last10(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("\\D", "");
        return digits.length() <= 10 ? digits : digits.substring(digits.length() - 10);
    }

    /** A number in a log line is a number in a log aggregator. */
    private static String masked(String phone) {
        String d = last10(phone);
        return d.length() < 4 ? "****" : "******" + d.substring(d.length() - 4);
    }
}
