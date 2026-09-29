package com.inclineyou.inclineyou_backend.core.trainer.account;

import com.inclineyou.inclineyou_backend.core.auth.JwtService;
import com.inclineyou.inclineyou_backend.core.auth.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.trainer.Trainer;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
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
 * account down.
 *
 * <p>Both are separate from {@link TrainerService} on purpose. That class edits
 * a profile: every field on it is nullable, every write means <i>leave the rest
 * alone</i>, and the worst outcome of getting one wrong is a stale bio. These
 * two rewrite an IDENTITY — the row sign-in resolves, in two tables — and each
 * needs a proof the profile endpoint has no concept of.
 *
 * <h2>Changing a number is three requests, and the middle one is the point</h2>
 *
 * <pre>
 *   1. POST /v1/trainers/me/phone/challenge   → a code to the CURRENT number
 *   2. POST /v1/trainers/me/phone/verify      → that code back; returns a ticket
 *   3. POST /v1/trainers/me/phone/request     → ticket + new number; a code to IT
 *   4. POST /v1/trainers/me/phone/confirm     → ticket + new number + its code
 * </pre>
 *
 * <p><b>Two numbers are proved, not one.</b> The brief asks for authentication
 * on the old number, and that half is what stops a stolen session from walking
 * an account away: a bearer token is seven days long and lives in a cookie, so
 * anybody holding one could otherwise re-point the account at a number they
 * control and lock the trainer out of their own book permanently. The new number
 * has to be proved too, for the mirror reason — a typo in the last digit of a
 * number nobody checks is an account that has moved to a stranger's phone and
 * can never be signed into again.
 *
 * <p>The OTP machinery does all of the sending, the throttling, the three-wrong
 * lock and the daily ceiling, keyed per number, and none of it needed touching:
 * a code to the old number and a code to the new one are two independent keys in
 * the same store. The only thing this class adds is the memory that step 2
 * happened, which is {@link JwtService#generatePhoneChangeTicket} — a signed
 * ten-minute ticket rather than a row, because a table would be a second place
 * for a half-finished change to live and a row nobody sweeps outlives the SIM
 * it is about.
 *
 * <h2>And closing an account is a soft delete, honestly described</h2>
 *
 * <p>There is no hard delete and there cannot be a cheap one: {@code
 * client.trainer_id} is NOT NULL and twenty tables hang off {@code client} in
 * turn, so removing the row would take a year of somebody's sessions, packages
 * and payments with it — including the ones a gym or a CA may still need. What
 * {@code DELETE /v1/trainers/me} does is stamp {@code deleted_at} on {@code
 * trainer} and on {@code app_user}, which is exactly what sign-in reads: the
 * number stops resolving, every route stops loading, and the data stops being
 * reachable through the product.
 *
 * <p><b>The number is not released, and the screen says so before the button
 * works.</b> Both phone columns are plain UNIQUE indexes rather than partial on
 * {@code deleted_at}, so the deleted row keeps the number and a fresh sign-up on
 * it is refused. That is deliberate — see V36 — and it is the one consequence of
 * deletion a trainer cannot discover by trying it once.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountService {

    private final TrainerRepository trainerRepo;
    private final AppUserRepository appUserRepo;
    private final OtpService otpService;
    private final JwtService jwtService;

    /* ─────────────────────────────────────────────────── changing a number ── */

    /** Step 1 — a code to the number they are signed in with. */
    public void challengeCurrentPhone(UUID trainerId) {
        // Straight through to the OTP service, which owns the wait, the daily
        // ceiling and the lock. Nothing here re-implements any of them: this
        // path and sign-in must throttle a number identically, or the cheaper of
        // the two becomes the way to brute-force it.
        otpService.send(phoneOf(load(trainerId)));
    }

    /**
     * Step 2 — that code back, and a ticket for it.
     *
     * <p>Not {@code @Transactional}: nothing is written. A verified code is
     * consumed inside the OTP store's own transaction, and the ticket is a
     * signature over facts that are already true.
     */
    public String verifyCurrentPhone(UUID trainerId, String otp) {
        String phone = phoneOf(load(trainerId));
        // Throws OtpLocked / OtpExpired / InvalidOtp, each of which already has
        // its own handler and its own recovery on the screen. Deliberately NOT
        // caught and re-thrown as an account rule: "wrong code, 2 tries left" is
        // a better sentence than anything this class could write, and the web
        // already reads all three from the sign-in flow.
        otpService.verify(phone, otp);
        return jwtService.generatePhoneChangeTicket(trainerId, phone);
    }

    /**
     * Step 3 — the new number, and a code to it.
     *
     * <p>The availability check runs HERE rather than only at the confirm, so a
     * number that can never work is refused before an SMS is spent on it and
     * before the trainer waits for a code that would have been rejected anyway.
     * It runs again at the confirm, because two minutes is long enough for
     * somebody else to sign up in between.
     */
    public void requestNewPhone(UUID trainerId, String ticket, String newPhone) {
        String phone = phoneOf(load(trainerId));
        requireTicket(ticket, trainerId, phone);
        requireAvailable(phone, newPhone);
        otpService.send(newPhone);
    }

    /**
     * Step 4 — the code from the new number, and the swap.
     *
     * <p>One transaction over both tables. {@code app_user} is what sign-in
     * resolves and {@code trainer} is what every authorised request loads, so a
     * change that landed on one and not the other is an account that either
     * cannot be signed into or cannot be found once you are in — and the second
     * is the worse half, because the trainer would appear to have lost
     * everything.
     *
     * <p>A fresh token comes back because the old one carries the old number in
     * its {@code phone} claim. Nothing on a trainer's path reads that claim
     * today — {@code TrainerController} reads the subject, which is the id and
     * does not move — but a seven-day token that disagrees with the row about
     * who it belongs to is a thing to hand back rather than to leave in a
     * cookie and reason about later.
     */
    @Transactional
    public PhoneChanged confirmNewPhone(UUID trainerId, String ticket, String newPhone, String otp) {
        Trainer t = load(trainerId);
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        String previous = user.getPhone();

        requireTicket(ticket, trainerId, previous);
        requireAvailable(previous, newPhone);

        otpService.verify(newPhone, otp);

        // The one row sign-in resolves. `trainer.app_user_id` is a fixed FK —
        // unlike the old phone-on-trainer shape, there is no second copy of the
        // number to keep in step, and so no split for this transaction to
        // guard against.
        user.setPhone(newPhone);
        appUserRepo.save(user);

        log.info("trainer {} changed phone {} → {}", trainerId, masked(previous), masked(newPhone));
        return new PhoneChanged(newPhone, jwtService.generate(trainerId, newPhone));
    }

    /** The new number, and a token that agrees with it. */
    public record PhoneChanged(String phone, String token) {}

    /* ───────────────────────────────────────────────────── closing it down ── */

    /**
     * Soft delete, on both tables, with the number typed back as the proof.
     *
     * <p><b>No OTP here, and that is a considered asymmetry with the change
     * flow.</b> Changing a number is an attacker's goal — it takes the account
     * over and locks the owner out — so it is worth an SMS. Deleting is nobody's
     * goal but the owner's: it destroys the thing an attacker would want and
     * hands them nothing. What it needs is protection from a MIS-TAP, and typing
     * ten digits is what supplies that.
     *
     * <p>Idempotent by way of {@link #load}: a second call finds no live trainer
     * and 404s, which is the honest answer to deleting something already gone.
     */
    @Transactional
    public void deleteAccount(UUID trainerId, String confirmPhone) {
        Trainer t = load(trainerId);
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        String phone = user.getPhone();

        String typed = confirmPhone == null ? "" : confirmPhone.replaceAll("\\D", "");
        // Compared on the last ten digits, so `+91 98410 22119`, `9198410 22119`
        // and `9841022119` are all the same answer. A confirmation step that
        // refuses the number as the trainer's own phone displays it back to them
        // is a step that teaches them the product is broken, not that they typed
        // it wrong.
        if (typed.length() < 10 || !typed.endsWith(last10(phone))) {
            throw AccountRuleException.confirmationMismatch();
        }

        Instant now = Instant.now();
        t.setDeletedAt(now);
        trainerRepo.save(t);

        user.setDeletedAt(now);
        appUserRepo.save(user);

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

    /**
     * Is this ticket this trainer's, unexpired, and about the number they are
     * still on?
     *
     * <p>The last clause is the one worth having. Without it a ticket minted
     * before a change would still be spendable after it, which is a proof of a
     * SIM the account no longer uses — so two changes in one sitting would need
     * only the first one's code.
     */
    private void requireTicket(String ticket, UUID trainerId, String currentPhone) {
        if (ticket == null || ticket.isBlank()) throw AccountRuleException.proveCurrentFirst();
        Claims claims;
        try {
            claims = jwtService.parse(ticket);
        } catch (JwtException e) {
            // Expiry and a forged signature land here together, and they get the
            // same sentence deliberately: distinguishing them would tell anybody
            // holding a made-up ticket which half they got wrong.
            throw AccountRuleException.proveCurrentFirst();
        }
        boolean ok = JwtService.ROLE_PHONE_CHANGE.equals(jwtService.extractRole(claims))
                && trainerId.toString().equals(claims.getSubject())
                && currentPhone.equals(claims.get("phone", String.class));
        if (!ok) throw AccountRuleException.proveCurrentFirst();
    }

    /**
     * Is the number free, and is it actually a move?
     *
     * <p>"Free" means no {@code app_user} row on it at all, live or not —
     * checking only that table is enough now that {@code trainer.app_user_id}
     * is a fixed, unique FK (since the 25 Sep 2026 schema rebuild): every
     * trainer has exactly one {@code app_user} row, so there is no second place
     * for the number to be taken.
     *
     * <p>Soft-deleted rows still hold their number, which is what makes a
     * deleted account's phone unavailable. That is the same rule stated from the
     * other side in {@link #deleteAccount}, and it is why the query does not
     * filter on {@code deleted_at}.
     */
    private void requireAvailable(String currentPhone, String newPhone) {
        if (newPhone.equals(currentPhone)) throw AccountRuleException.samePhone();
        if (appUserRepo.findByPhone(newPhone).isPresent()) throw AccountRuleException.phoneTaken();
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
