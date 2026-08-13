package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.entity.Trainer;
import com.xrep.xrep_backend.repository.ClientRepository;
import com.xrep.xrep_backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final TrainerRepository trainerRepo;
    private final ClientRepository clientRepo;
    private final OtpService otpService;
    private final JwtService jwtService;

    /** Weeks and dates in this product are Indian, wherever the server is. */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public void requestOtp(String phone) {
        otpService.send(phone);
    }

    /**
     * Verify a code, and answer the question the app actually has: which half of
     * the product is this person?
     *
     * A number can be a trainer, somebody's client, both, or neither, and the
     * four cases have four different next screens — the Deck, the client's
     * Today, the role picker (5a), and "we don't know this number yet" (7a). The
     * one thing this method will not do is guess: a phone that is on nobody's
     * roster no longer silently becomes a trainer account, because the most
     * likely first launch in this product is a CLIENT typing their number
     * before their trainer has added them, and minting a coaching workspace for
     * them is a wrong turn they cannot undo.
     */
    @Transactional
    public AuthResponse verifyOtp(String phone, String otp) {
        // Throws OtpLockedException, OtpExpiredException or InvalidOtpException
        // on failure — each surfaces as its own HTTP response via
        // GlobalExceptionHandler, because each needs a different recovery.
        otpService.verify(phone, otp);

        Optional<Trainer> existing = trainerRepo.findByPhoneAndDeletedAtIsNull(phone);
        var memberships = clientRepo.findMembershipsByPhone(phone);

        List<Membership> active = memberships.stream()
                .filter(m -> !"paused".equalsIgnoreCase(m.getStatus()))
                .map(AuthService::toMembership)
                .toList();

        if (existing.isPresent()) {
            Trainer trainer = existing.get();
            // A trainer who is also somebody's client gets the coaching lens by
            // default and the memberships alongside it — the app decides whether
            // to show 5a, and it stores that answer locally. The role is a lens,
            // never a second identity, so there is one token either way.
            return new AuthResponse(
                    jwtService.generate(trainer.getId(), trainer.getPhone()),
                    trainer.getId().toString(),
                    false,
                    trainer.getSetupCompletedAt() != null,
                    JwtService.ROLE_TRAINER,
                    named(trainer),
                    active,
                    null);
        }

        if (!active.isEmpty()) {
            // Somebody's client and nobody's trainer. No trainer row is created:
            // this person has not asked to coach anyone, and an empty roster
            // sitting in the trainer table is a workspace waiting to confuse the
            // next screen that counts them.
            return new AuthResponse(
                    jwtService.generateClient(phone),
                    null,
                    false,
                    true,
                    JwtService.ROLE_CLIENT,
                    null,
                    active,
                    null);
        }

        // On a roster, but every one of them paused — 7b. Paused is not deleted,
        // and the screen says so; naming the trainer and the date is what turns
        // a wall into information, and the fix is a WhatsApp to them, not us.
        Optional<ClientRepository.Membership> paused = memberships.stream()
                .max(Comparator.comparing(
                        m -> m.getPausedAt() == null ? java.time.Instant.EPOCH : m.getPausedAt()));
        if (paused.isPresent()) {
            var m = paused.get();
            return new AuthResponse(
                    null, null, false, true,
                    "paused",
                    null,
                    List.of(),
                    new PausedInfo(
                            m.getTrainerName(),
                            m.getTrainerPhone(),
                            m.getPausedAt() == null
                                    ? null
                                    : LocalDate.ofInstant(m.getPausedAt(), IST).toString()));
        }

        // 7a. Neither, so ask — one screen, two exits, and no dead end. The
        // token is good for exactly one thing: claiming a trainer account for
        // the number that was just proved.
        return new AuthResponse(
                jwtService.generatePending(phone),
                null,
                true,
                false,
                JwtService.ROLE_PENDING,
                null,
                List.of(),
                null);
    }

    /**
     * "I'm a trainer" on 7a.
     *
     * Creating the trainer row is a deliberate act now rather than a side effect
     * of signing in, which is the only difference from how this used to work.
     * Idempotent: a second tap, or a retry after a dropped response, returns the
     * account that already exists.
     */
    @Transactional
    public AuthResponse claimTrainer(String phone) {
        // The token's subject. A pending or client token carries the phone; a
        // trainer token carries a trainer id, and one of those arriving here
        // means somebody already has an account — not a number to open one for.
        if (phone == null || !phone.matches("^[6-9]\\d{9}$")) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "This sign-in already has a trainer account.");
        }

        Trainer trainer = trainerRepo.findByPhoneAndDeletedAtIsNull(phone)
                .orElseGet(() -> {
                    Trainer t = new Trainer();
                    t.setPhone(phone);
                    // `name` is NOT NULL and we have nothing else yet — sign-in
                    // gives us a phone number and nothing more. Trainer setup
                    // overwrites it, and `setupComplete` below is what tells the
                    // app the name is a stand-in.
                    t.setName(phone);
                    return trainerRepo.save(t);
                });

        var active = clientRepo.findMembershipsByPhone(phone).stream()
                .filter(m -> !"paused".equalsIgnoreCase(m.getStatus()))
                .map(AuthService::toMembership)
                .toList();

        return new AuthResponse(
                jwtService.generate(trainer.getId(), trainer.getPhone()),
                trainer.getId().toString(),
                true,
                trainer.getSetupCompletedAt() != null,
                JwtService.ROLE_TRAINER,
                named(trainer),
                active,
                null);
    }

    /** The placeholder name trainer setup has not replaced yet is not a name. */
    private static String named(Trainer t) {
        return t.getName() == null || t.getName().equals(t.getPhone()) ? null : t.getName();
    }

    private static Membership toMembership(ClientRepository.Membership m) {
        return new Membership(
                m.getClientId().toString(),
                m.getTrainerId().toString(),
                m.getClientName(),
                m.getTrainerName(),
                m.getGymName(),
                m.getTrainerPhone());
    }

    /**
     * `isNewUser` only ever answers "is this the first verify for this number".
     * `setupComplete` answers the question the app actually has — whether a
     * profile exists — and survives a reinstall, a second device, and a flow
     * abandoned halfway.
     *
     * Everything from `role` down is new in V14 and additive: an older app reads
     * the first four fields and behaves exactly as it did, because a returning
     * trainer still gets a trainer token and `role: "trainer"`.
     */
    public record AuthResponse(
            String token,
            String trainerId,
            boolean isNewUser,
            boolean setupComplete,
            /** "trainer" | "client" | "pending" | "paused" — which lens to open. */
            String role,
            /**
             * The signed-in trainer's own name, for "Welcome back, Ravi" on the
             * role picker. Null when it is still the phone-number placeholder,
             * because greeting somebody by their own phone number is worse than
             * not greeting them.
             */
            String trainerName,
            /** Every roster this number is on and not paused on. Often empty. */
            List<Membership> clientOf,
            /** Only on "paused" — who paused it and when. */
            PausedInfo paused
    ) {}

    /**
     * One roster this number is on. `clientId` is what the client endpoints are
     * asked for; the trainer's name and gym are what the screen says.
     *
     * The trainer's UPI VPA is deliberately not here. It reaches the device with
     * the rest of the coach record on the first client sync, is used to build a
     * deep link, and is never rendered.
     */
    public record Membership(
            String clientId,
            String trainerId,
            String clientName,
            String trainerName,
            String gymName,
            String trainerPhone
    ) {}

    public record PausedInfo(String trainerName, String trainerPhone, String pausedOn) {}
}
