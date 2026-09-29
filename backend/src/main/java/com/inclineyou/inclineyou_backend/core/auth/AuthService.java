package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.client.Client;
import com.inclineyou.inclineyou_backend.core.trainer.Trainer;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository.Identity;
import com.inclineyou.inclineyou_backend.core.client.ClientRepository;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Sign-in, and the one question it exists to answer: which half of the product
 * is this person, and is there anything they have to answer before they get in.
 *
 * ── One number, possibly two roles ────────────────────────────────────────────
 *
 * `app_user.role` is the *home* role — which half sign-in opens into by
 * default — not an exclusivity lock. A phone can own a trainer account and
 * also be a live client on somebody else's roster at the same time;
 * {@link #trainerView} surfaces that second half as `clientOf` so the app can
 * offer a switch, and `POST /v1/auth/mode/trainer` / `mode/client` mint the
 * other role's token on demand without a fresh sign-in. `ClientPhoneGuard`
 * still refuses one specific combination — a trainer's own number on their
 * own roster — because that is the separate, unresolved "self-training"
 * question, not this one.
 *
 * ── One round trip ────────────────────────────────────────────────────────────
 *
 * {@link AppUserRepository#findIdentityByPhone} returns the role, the trainer's
 * setup state, and every roster with its own consent status, in a single query.
 * That matters less for speed than it looks — the bcrypt comparison in
 * {@link OtpService#verify} costs two orders of magnitude more than the lookups
 * — and more for correctness: role alone cannot pick a screen, because an
 * invited client and an accepted one are the same role and different
 * destinations, and a two-step lookup is a place for the two answers to
 * disagree.
 *
 * Nothing here reads a profile. Specialities, certifications, languages, UPI,
 * goals — none of it decides a route, and all of it is fetched by whichever
 * dashboard opens.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AppUserRepository appUserRepo;
    private final TrainerRepository trainerRepo;
    private final ClientRepository clientRepo;
    private final OtpService otpService;
    private final JwtService jwtService;
    private final AuthTokenService tokens;
    private final com.inclineyou.inclineyou_backend.core.tenant.TenantScope tenantScope;

    /** Weeks and dates in this product are Indian, wherever the server is. */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /* ---------------------------------------------------- membership states */

    public static final String INVITED = "invited";
    public static final String ACCEPTED = "accepted";
    public static final String DECLINED = "declined";
    public static final String MEMBERSHIP_PAUSED = "paused";
    public static final String REMOVED = "removed";

    /* -------------------------------------------------------- response roles
     * Wider than the JWT's four, because a token says what you may DO and this
     * says which screen you are owed. `invited`, `removed` and `unattached` all
     * ride the same invited token and land in three different places.
     * -------------------------------------------------------------------------- */

    public static final String VIEW_TRAINER = "trainer";
    public static final String VIEW_CLIENT = "client";
    public static final String VIEW_PENDING = "pending";
    public static final String VIEW_INVITED = "invited";
    public static final String VIEW_REMOVED = "removed";
    /** A client whose every membership is answered and gone. Not a new account. */
    public static final String VIEW_UNATTACHED = "unattached";
    /** Reserved. Nothing mints one yet — see {@link AppUser#ROLE_GYM_ADMIN}. */
    public static final String VIEW_GYM_ADMIN = "gym_admin";

    public void requestOtp(String phone) {
        otpService.send(phone);
    }

    /**
     * Verify a code, then route.
     *
     * The order of the client branches below is the product decision, not an
     * implementation detail:
     *
     *   1. A LIVE roster wins over everything. Somebody who is training is
     *      training, and stopping them at a consent screen because a second
     *      trainer also invited them would block the thing they opened the app
     *      to do. The outstanding invite travels in {@code clientOf} and the app
     *      surfaces it inside.
     *   2. Otherwise an unanswered INVITE — the accept/decline screen.
     *   3. Otherwise an unacknowledged REMOVAL — shown once, then acknowledged.
     *   4. Otherwise nothing is left to open: every membership was declined, or
     *      removed and acknowledged. That is `unattached`, and it is NOT 7a —
     *      offering a coaching account to somebody whose role is client would be
     *      the wrong turn 7a itself was written to avoid.
     */
    @Transactional
    public AuthResponse verifyOtp(String phone, String otp) {
        // Throws OtpLockedException, OtpExpiredException or InvalidOtpException on failure — each surfaces as its own HTTP response via GlobalExceptionHandler, because each needs a different recovery.
        otpService.verify(phone, otp);

        List<Identity> rows = appUserRepo.findIdentityByPhone(phone);

        if (rows.isEmpty()) {
            return pending(phone);
        }

        Identity head = rows.getFirst();
        String role = head.getRole();

        if (AppUser.ROLE_TRAINER.equals(role)) {
            return trainerView(head, rows);
        }

        if (AppUser.ROLE_GYM_ADMIN.equals(role)) {
            return new AuthResponse(null, null, false, false,
                    VIEW_GYM_ADMIN, null, List.of(), null, null);
        }

        return clientView(phone, rows);
    }

    /* ------------------------------------------------------------- trainer */

    /**
     * A trainer's own sign-in — plus, now, any LIVE membership this same
     * phone holds on somebody else's roster. {@code rows} already carries
     * both halves in one shot ({@link AppUserRepository#findIdentityByPhone}
     * LEFT JOINs `client` by phone unconditionally), so no second query is
     * needed to discover them.
     *
     * Deliberately scoped to live (accepted/paused) memberships only — an
     * outstanding invite or an unacknowledged removal on this number does
     * NOT interrupt a trainer's sign-in the way it would a pure client's; the
     * trainer role wins the destination, and those edge cases are left for a
     * later pass. A trainer's own number can never appear in its own
     * `clientOf`: {@code ClientPhoneGuard} refuses that combination before a
     * row can ever be written.
     */
    private AuthResponse trainerView(Identity head, List<Identity> rows) {
        if (head.getTrainerId() == null) {
            return pending(phoneOf(head));
        }

        List<Membership> clientOf = rows.stream()
                .filter(r -> r.getClientId() != null)
                .filter(AuthService::isLive)
                .map(AuthService::toMembership)
                .toList();

        return new AuthResponse(
                mintTrainer(head.getTrainerId(), phoneOf(head)),
                head.getTrainerId().toString(),
                false,
                head.getSetupCompletedAt() != null,
                VIEW_TRAINER,
                displayName(head.getTrainerOwnName(), phoneOf(head)),
                clientOf,
                null,
                null);
    }

    /* -------------------------------------------------------------- client */

    private AuthResponse clientView(String phone, List<Identity> rows) {
        List<Identity> memberships = rows.stream()
                .filter(r -> r.getClientId() != null)
                .toList();

        List<Membership> live = memberships.stream()
                .filter(AuthService::isLive)
                .map(AuthService::toMembership)
                .toList();

        // 1 · Training with somebody. Every roster travels, including invites still outstanding, so the app can surface them without another call.
        if (!live.isEmpty()) {
            List<Membership> all = memberships.stream()
                    .filter(m -> !REMOVED.equalsIgnoreCase(m.getMembershipStatus()))
                    .filter(m -> !DECLINED.equalsIgnoreCase(m.getMembershipStatus()))
                    .map(AuthService::toMembership)
                    .toList();
            return new AuthResponse(
                    mint(phone, phone, JwtService.ROLE_CLIENT, null),
                    null, false, true,
                    VIEW_CLIENT, null,
                    all,
                    allPaused(memberships),
                    null);
        }

        // 2 · Named by a trainer, and has never agreed to anything. The token opens no sync scope — only accept and decline.
        List<Membership> invites = memberships.stream()
                .filter(m -> INVITED.equalsIgnoreCase(m.getMembershipStatus()))
                .map(AuthService::toMembership)
                .toList();
        if (!invites.isEmpty()) {
            return new AuthResponse(
                    mint(phone, phone, JwtService.ROLE_INVITED, null),
                    null, false, false,
                    VIEW_INVITED, null,
                    invites,
                    null,
                    null);
        }

        // 3 · Removed, and not yet told. Shown once; the acknowledgement is what
        // stops it reappearing, because the row itself is kept forever — the
        // trainer's payments and session history all point at it.
        List<Identity> removals = memberships.stream()
                .filter(m -> REMOVED.equalsIgnoreCase(m.getMembershipStatus()))
                .filter(m -> m.getRemovedAckAt() == null)
                .toList();
        if (!removals.isEmpty()) {
            Identity latest = removals.stream()
                    .max(Comparator.comparing(m -> m.getRemovedAt() == null
                            ? Instant.EPOCH : m.getRemovedAt()))
                    .orElseThrow();
            return new AuthResponse(
                    mint(phone, phone, JwtService.ROLE_INVITED, null),
                    null, false, false,
                    VIEW_REMOVED, null,
                    removals.stream().map(AuthService::toMembership).toList(),
                    null,
                    new RemovedInfo(
                            latest.getClientId().toString(),
                            latest.getCoachName(),
                            latest.getCoachPhone(),
                            onDate(latest.getRemovedAt())));
        }

        // 4 · Everything answered and gone. Not 7a — this number's role is
        // client, and offering it a coaching workspace is the wrong turn.
        return new AuthResponse(
                mint(phone, phone, JwtService.ROLE_INVITED, null),
                null, false, false,
                VIEW_UNATTACHED, null,
                List.of(), null, null);
    }

    private AuthResponse pending(String phone) {
        return new AuthResponse(
                mint(phone, phone, JwtService.ROLE_PENDING, null),
                null, true, false,
                VIEW_PENDING, null, List.of(), null, null);
    }

    /* --------------------------------------------------------- claim (7a) */

    /**
     * "I'm a trainer" on 7a.
     *
     * Creating the trainer row is a deliberate act rather than a side effect of
     * signing in. Idempotent: a second tap, or a retry after a dropped response,
     * returns the account that already exists.
     *
     * A phone that is already somebody's client can claim a trainer account
     * too — trainer↔client duality is allowed — and claiming is what makes
     * trainer the *home* role from here on: the existing {@code app_user} row
     * is updated to {@code role = 'trainer'} rather than refused. Their client
     * memberships are untouched and stay reachable via
     * {@code POST /v1/auth/mode/client}.
     */
    @Transactional
    public AuthResponse claimTrainer(String phone, String privacyPolicyVersion) {
        // Pending token brings phone alone and Trainer token brings trainer Id. If phone is null means someone already logged in as trainer with this phone.
        if (phone == null || !phone.matches(AuthController.PHONE_PATTERN)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This sign-in already has a trainer account.");
        }

        Optional<AppUser> existing = appUserRepo.findByPhoneAndDeletedAtIsNull(phone);

        AppUser user;
        if (existing.isEmpty()) {
            user = new AppUser();
            user.setPhone(phone);
            user.setRole(AppUser.ROLE_TRAINER);
            // Both together, always — `app_user_privacy_pair` refuses one
            // without the other, because a row that has accepted "something"
            // with no version on it is not a consent the product can point to.
            user.setPrivacyAcceptedAt(Instant.now());
            user.setPrivacyPolicyVersion(privacyPolicyVersion);
            user = appUserRepo.save(user);
        } else {
            user = existing.get();
            if (!AppUser.ROLE_TRAINER.equals(user.getRole())) {
                user.setRole(AppUser.ROLE_TRAINER);
                user = appUserRepo.save(user);
            }
        }

        UUID appUserId = user.getId();
        Trainer trainer = trainerRepo.findByAppUserIdAndDeletedAtIsNull(appUserId)
                .orElseGet(() -> {
                    Trainer t = new Trainer();
                    t.setAppUserId(appUserId);
                    // Same placeholder as the old phone-on-trainer shape: not a
                    // real name until setup replaces it — displayName() below
                    // is what keeps it off screen until then.
                    t.setName(phone);
                    // home_tenant_id is left null on purpose. `ensure_home_tenant`
                    // (BEFORE INSERT, SECURITY DEFINER) fills it, and the three
                    // AFTER INSERT triggers behind it — ensure_home_membership,
                    // ensure_trainer_business, ensure_subscription — provision the
                    // owner membership, the practice row and the trial in the
                    // same INSERT. Doing any of that here, as the request-scoped
                    // `inclineyou_app` role, would hit `tenant`'s row-level
                    // security head-on: there is no INSERT policy for it at all,
                    // by design, because nothing outside these triggers is
                    // supposed to create a workspace.
                    return trainerRepo.save(t);
                });

        return new AuthResponse(
                mintTrainer(trainer.getId(), phone),
                trainer.getId().toString(),
                true,
                trainer.getSetupCompletedAt() != null,
                VIEW_TRAINER,
                displayName(trainer.getName(), phone),
                List.of(),
                null,
                null);
    }

    /**
     * Accept — the moment a client accepts trainers request.
     */
    @Transactional
    public AuthResponse acceptInvite(String phone, UUID clientId) {
        Client membership = ownedMembership(phone, clientId);

        if (INVITED.equalsIgnoreCase(membership.getMembershipStatus())) {
            membership.setMembershipStatus(ACCEPTED);
            membership.setAcceptedAt(Instant.now());
            clientRepo.save(membership);
        }

        // The policy was on the screen they just tapped through. Stamped once — a second acceptance does not move the date of the first.
        appUserRepo.findByPhoneAndDeletedAtIsNull(phone).ifPresent(user -> {
            if (user.getPrivacyAcceptedAt() == null) {
                user.setPrivacyAcceptedAt(Instant.now());
                appUserRepo.save(user);
            }
        });

        return clientView(phone, appUserRepo.findIdentityByPhone(phone));
    }

    /**
     * Decline.
     *
     * The row is kept, not deleted. A trainer who added somebody by mistake, or
     * whose client changed their mind, still has a roster entry that says what
     * happened — and the client keeps a record that they were asked and said no,
     * which is what stops the same invite being drawn again at the next sign-in.
     */
    @Transactional
    public AuthResponse declineInvite(String phone, UUID clientId) {
        Client membership = ownedMembership(phone, clientId);

        if (INVITED.equalsIgnoreCase(membership.getMembershipStatus())) {
            membership.setMembershipStatus(DECLINED);
            membership.setDeclinedAt(Instant.now());
            clientRepo.save(membership);
        }

        return clientView(phone, appUserRepo.findIdentityByPhone(phone));
    }

    /**
     * "OK" on the removal notice.
     *
     * Stamping this is the whole reason the column exists: the membership row
     * outlives the membership, so `removed` is permanently true, and without an
     * acknowledgement sign-in would redraw the notice every single time. The
     * local wipe happens on the phone; nothing here deletes anything, because
     * the trainer's books point at this row.
     */

    // Need to check the importance of this method and why this is created.
    @Transactional
    public AuthResponse acknowledgeRemoval(String phone, UUID clientId) {
        Client membership = ownedMembership(phone, clientId);

        if (REMOVED.equalsIgnoreCase(membership.getMembershipStatus())
                && membership.getRemovedAckAt() == null) {
            membership.setRemovedAckAt(Instant.now());
            clientRepo.save(membership);
        }

        return clientView(phone, appUserRepo.findIdentityByPhone(phone));
    }

    /* -------------------------------------------------------- mode switch */

    /**
     * The signed-in number, however the presented token spells it — a
     * trainer token's subject is a trainer UUID, every other role's subject
     * already IS the phone. {@link AuthController} reads the token's role
     * off {@code SecurityContextHolder} and passes it here rather than this
     * class reaching into the security context itself.
     */
    public String resolveCallerPhone(String subject, boolean isTrainerToken) {
        if (!isTrainerToken) return subject;
        Trainer trainer = trainerRepo.findById(UUID.fromString(subject))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found."));
        return appUserRepo.findById(trainer.getAppUserId())
                .map(AppUser::getPhone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found."));
    }

    /**
     * "Switch to trainer mode" — for a phone that is signed in as somebody's
     * client (or mid-invite) and also owns a trainer account. Mints a fresh
     * trainer token; the caller's existing client token is simply left to
     * expire, the same way any other token does.
     */
    @Transactional(readOnly = true)
    public AuthResponse switchToTrainer(String phone) {
        List<Identity> rows = appUserRepo.findIdentityByPhone(phone);
        Identity head = rows.stream()
                .filter(r -> r.getTrainerId() != null)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No trainer account on this number."));
        return trainerView(head, rows);
    }

    /**
     * "Switch to client mode" — for a trainer whose own phone also holds a
     * LIVE membership on somebody else's roster. No membership id to pick:
     * a client token is bound to the phone, not to one relationship (see
     * {@link JwtService#generateClient}), so the response carries every live
     * roster this number is on, same as any other client sign-in — the app's
     * existing multi-roster picker is what disambiguates from there.
     */
    @Transactional(readOnly = true)
    public AuthResponse switchToClient(String phone) {
        List<Identity> rows = appUserRepo.findIdentityByPhone(phone);
        boolean hasLiveMembership = rows.stream().anyMatch(AuthService::isLive);
        if (!hasLiveMembership) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "No active client membership on this number.");
        }
        return clientView(phone, rows);
    }

    /**
     * Turn "this token owns this number" into "this token owns this membership".
     *
     * The same answer whether the row does not exist or belongs to somebody
     * else — telling them apart would let a signed-in caller probe for other
     * people's client ids.
     */
    private Client ownedMembership(String phone, UUID clientId) {
        return clientRepo.findById(clientId)
                .filter(c -> c.getDeletedAt() == null)
                .filter(c -> phone.equals(c.getPhone()))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "Not your record."));
    }

    /* --------------------------------------------------------------- shape */

    /** Live = the lens opens. Paused is live: pause changes what it contains. */
    private static boolean isLive(Identity m) {
        String s = m.getMembershipStatus();
        return ACCEPTED.equalsIgnoreCase(s) || MEMBERSHIP_PAUSED.equalsIgnoreCase(s);
    }

    /** `status` is a string on purpose (§2 of the data model); compare it like one. */
    private static boolean isPaused(Identity m) {
        return "paused".equalsIgnoreCase(m.getStatus())
                || MEMBERSHIP_PAUSED.equalsIgnoreCase(m.getMembershipStatus());
    }

    /** The placeholder name trainer setup has not replaced yet is not a name. */
    private static String displayName(String name, String phone) {
        return name == null || name.equals(phone) ? null : name;
    }

    /**
     * The signed-in number. Emphatically not {@code getCoachPhone()}, which is
     * the trainer on a membership row and is null on a trainer's own lookup.
     */
    private static String phoneOf(Identity head) {
        return head.getPhone();
    }

    /**
     * Who paused it and when — but only when there is nothing else to open.
     *
     * A client with one paused roster and one active one is not "paused"; they
     * are training with somebody, and saying otherwise at sign-in is a lie the
     * second roster contradicts. When it is set, it names the most recently
     * paused: that is the one they are most likely asking about, and the fix is
     * a WhatsApp to that trainer rather than to us.
     */
    private static PausedInfo allPaused(List<Identity> memberships) {
        List<Identity> live = memberships.stream().filter(AuthService::isLive).toList();
        if (live.isEmpty() || !live.stream().allMatch(AuthService::isPaused)) {
            return null;
        }
        return live.stream()
                .max(Comparator.comparing(
                        m -> m.getPausedAt() == null ? Instant.EPOCH : m.getPausedAt()))
                .map(m -> new PausedInfo(m.getCoachName(), m.getCoachPhone(), onDate(m.getPausedAt())))
                .orElse(null);
    }

    /** A pause or a removal is a date in the trainer's day, not an instant. */
    private static String onDate(Instant at) {
        return at == null ? null : LocalDate.ofInstant(at, IST).toString();
    }

    private static Membership toMembership(Identity m) {
        return new Membership(
                m.getClientId().toString(),
                m.getClientTrainerId() == null ? null : m.getClientTrainerId().toString(),
                m.getClientName(),
                m.getCoachName(),
                m.getCoachGymName(),
                m.getCoachPhone(),
                m.getStatus(),
                m.getMembershipStatus(),
                isPaused(m) ? onDate(m.getPausedAt()) : null);
    }

    /**
     * `isNewUser` only ever answers "is this the first verify for this number".
     * `setupComplete` answers the question the app actually has — whether a
     * profile exists — and survives a reinstall, a second device, and a flow
     * abandoned halfway.
     *
     * Additive across versions: an app built before V18 reads the first seven
     * fields and behaves as it did. It will not recognise the `invited`,
     * `removed` or `unattached` roles, which is why none of them carries a
     * client token — an old build that falls through to its default branch gets
     * a token that cannot open a sync scope rather than one that can.
     */

    /* ------------------------------------------------------- minting tokens */

    /**
     * Every credential in this service goes out through the issuer interface,
     * never through {@link JwtService} directly.
     *
     * <p>That is the whole point of {@link AuthTokenService}: the phone gets a
     * self-contained JWT because it is offline half the time, the web gets a
     * revocable server-side session because a token that leaks from a browser is
     * a token somebody else is holding — and this file, which is about who
     * somebody is, does not have to know which.
     */
    private String mint(String subject, String phone, String role, java.util.UUID tenantId) {
        return tokens.issueForCurrentRequest(
                new AuthPrincipal(subject, phone, role, tenantId, null)).value();
    }

    /**
     * A trainer token, standing in their home workspace.
     *
     * <p>Home rather than "the one they were in last", because sign-in is the
     * one moment there is no previous request to ask. The switcher moves them
     * afterwards, and on the web that costs an UPDATE rather than a new token.
     */
    private String mintTrainer(java.util.UUID trainerId, String phone) {
        return mint(trainerId.toString(), phone, JwtService.ROLE_TRAINER,
                tenantScope.homeTenantOf(trainerId));
    }

    public record AuthResponse(
            String token,
            String trainerId,
            boolean isNewUser,
            boolean setupComplete,
            /**
             * "trainer" | "client" | "pending" | "invited" | "removed" |
             * "unattached" | "gym_admin" — which screen this sign-in is owed.
             */
            String role,
            /** The trainer's own name, for "Welcome back, Ravi". Null before setup. */
            String trainerName,
            /** Every roster this number is on that is still worth drawing. */
            List<Membership> clientOf,
            /** Set only when every LIVE roster is paused — who paused it and when. */
            PausedInfo paused,
            /** Set only on the `removed` role — who removed them and when. */
            RemovedInfo removed,

            /**
             * `jwt` or `session` — which kind of credential {@code token} is.
             *
             * <p>The web needs to know it holds something revocable (so "sign
             * out" can mean it) and the phone needs to know it holds something
             * that works with no signal. Nothing on the server branches on it.
             *
             * <p>Derived from the token rather than passed in, so the eight
             * places that build this response did not have to learn about
             * issuers to keep working.
             */
            String tokenKind
    ) {
        /** The nine-argument form every mint site already used. */
        public AuthResponse(String token, String trainerId, boolean isNewUser,
                            boolean setupComplete, String role, String trainerName,
                            List<Membership> clientOf, PausedInfo paused, RemovedInfo removed) {
            this(token, trainerId, isNewUser, setupComplete, role, trainerName,
                 clientOf, paused, removed, kindOf(token));
        }

        private static String kindOf(String token) {
            if (token == null) return null;
            return token.startsWith(SessionTokenIssuer.PREFIX)
                    ? SessionTokenIssuer.KIND : JwtTokenIssuer.KIND;
        }
    }

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
            String trainerPhone,
            /** The TRAINER's view: `active` | `paused` | `archived` | `inactive`. */
            String status,
            /**
             * The CLIENT's own answer: `invited` | `accepted` | `declined` |
             * `paused` | `removed`. Kept apart from `status` because the two
             * answer to different people and can legitimately disagree.
             */
            String membershipStatus,
            /** "2026-07-22", or null when this roster isn't paused. */
            String pausedOn
    ) {}

    public record PausedInfo(String trainerName, String trainerPhone, String pausedOn) {}

    /** Who ended it and when, so the notice can name them rather than just close. */
    public record RemovedInfo(
            String clientId,
            String trainerName,
            String trainerPhone,
            String removedOn
    ) {}
}
