package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class JwtService {

    private final AppProperties props;

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(
                props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    /** The role a token was minted for. Absent on tokens issued before V14. */
    public static final String ROLE_TRAINER = "trainer";
    /** Verified the number, and it is on nobody's roster yet — screen 7a. */
    public static final String ROLE_PENDING = "pending";

    /**
     * Proof that the person at this keyboard just received a code on the number
     * the account is signed in with — the STEP-UP ticket (api-contract v1.1,
     * Settings A9).
     *
     * <p>One ticket shape for the two things that need it, changing the number
     * and closing the account, told apart by a {@code purpose} claim. It carries
     * four facts and every one of them is checked when it is spent:
     *
     * <ul>
     *   <li><b>who</b> — the trainer id, as the subject;</li>
     *   <li><b>why</b> — {@code purpose}: a phone-change ticket cannot close the
     *       account;</li>
     *   <li><b>where</b> — {@code sess}, a SHA-256 of the bearer token the
     *       caller proved it with, so a ticket lifted from one browser does
     *       nothing in another;</li>
     *   <li><b>against which number</b> — {@code phone}: a ticket minted before
     *       the number changed is a proof of a SIM the account no longer uses.</li>
     * </ul>
     *
     * <p><b>Single use without a table.</b> The ticket is stateless and the two
     * actions it unlocks each change the very thing it is bound to: a confirmed
     * phone change moves {@code phone}, and a closed account has no trainer to
     * load. The first successful use therefore invalidates it, which is what
     * "single use" needs, with no used-nonce row for a half-finished change to
     * live in (the argument the 25 Sep rebuild made against a table here). What
     * it does not do is invalidate on a FAILED attempt: a wrong code at the
     * confirm step leaves the ticket spendable for the rest of its ten minutes,
     * and that is the intended recovery, not a gap.
     *
     * <p><b>It is never an Authorization header.</b> It travels in a body field or
     * the {@code X-Step-Up-Ticket} header, beside the real bearer token, because
     * it is a second factor rather than a credential. {@code SecurityConfig} makes
     * that true rather than merely intended: {@code anyRequest().hasRole("TRAINER")}
     * refuses a {@code step_up} role, so a ticket presented as a bearer token
     * authenticates nothing at all.
     *
     * <p>Ten minutes, which is {@code app.otp.expiry-minutes}: the ticket must not
     * outlive the codes it sits between.
     */
    public static final String ROLE_STEP_UP = "step_up";

    /** Matches app.otp.expiry-minutes. See {@link #ROLE_STEP_UP}. */
    public static final int STEP_UP_MINUTES = 10;

    public static final String PURPOSE_CLAIM = "purpose";
    public static final String SESSION_CLAIM = "sess";

    /**
     * A ticket saying {@code trainerId} proved {@code currentPhone} just now.
     *
     * <p>The phone claim is the number that was PROVED, and it is checked
     * against the trainer's stored number when the ticket is spent. Without
     * that check a ticket minted before a first change would still be spendable
     * after it, which is a ticket for a SIM nobody holds any more.
     */
    /** See {@link #ROLE_STEP_UP}: who, why, where and against which number. */
    public String generateStepUpTicket(UUID trainerId, String currentPhone, String purpose, String sessionBinding) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(trainerId.toString())
                .claim("phone", currentPhone)
                .claim("role", ROLE_STEP_UP)
                .claim(PURPOSE_CLAIM, purpose)
                .claim(SESSION_CLAIM, sessionBinding)
                .issuedAt(new Date(now))
                .expiration(new Date(now + STEP_UP_MINUTES * 60_000L))
                .signWith(signingKey())
                .compact();
    }

    /**
     * How long a {@code pending} token lives: long enough to read the notice and
     * press "I'm a trainer", not the seven days a working credential gets. It
     * is also what the web holds before it claims — see
     * {@code AuthTokenService.issue} — so its lifetime is its exposure.
     */
    public static final int PENDING_MINUTES = 15;

    private String build(String subject, String phone, String role) {
        return build(subject, phone, role, null, expiryMs(role));
    }

    private String build(String subject, String phone, String role, long expiryMs) {
        return build(subject, phone, role, null, expiryMs);
    }

    /**
     * The one the token issuer calls, workspace included.
     *
     * <p>Public because {@link JwtTokenIssuer} is the adapter that owns minting
     * now; this class stays the thing that knows how a claim set is spelled.
     */
    public String build(String subject, String phone, String role, UUID tenantId) {
        return build(subject, phone, role, tenantId, expiryMs(role));
    }

    private long expiryMs(String role) {
        return ROLE_PENDING.equals(role)
                ? PENDING_MINUTES * 60_000L
                : (long) props.getJwt().getExpiryMinutes() * 60 * 1000;
    }

    private String build(String subject, String phone, String role, UUID tenantId, long expiryMs) {
        long now = System.currentTimeMillis();
        var builder = Jwts.builder()
                .subject(subject)
                .claim("phone", phone)
                .claim("role", role);
        // Absent rather than null when there is no workspace. A `pending`
        // token has proved a number and belongs nowhere, and a null claim in the
        // payload would be a promise that it might later mean something.
        if (tenantId != null) builder.claim(TENANT_CLAIM, tenantId.toString());
        return builder
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiryMs))
                .signWith(signingKey())
                .compact();
    }

    /** The active workspace claim. Short, because it is on every request. */
    public static final String TENANT_CLAIM = "tid";

    /**
     * The workspace this token is standing in, or null.
     *
     * <p><b>Null is not an error and must never be treated as one.</b> Tokens
     * live seven days, so on the deploy that introduces tenancy every trainer in
     * the field is holding one minted before this claim existed. Rejecting those
     * would sign out the entire user base at once; {@code TenantScope} resolves
     * the absence to the trainer's home workspace instead, which is where all
     * their data already is.
     */
    public UUID extractTenantId(Claims claims) {
        Object raw = claims.get(TENANT_CLAIM);
        if (raw == null) return null;
        try {
            return UUID.fromString(raw.toString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * A token with no `role` claim is a trainer token.
     *
     * Every token in the wild before V14 was one, and they stay valid until they
     * expire. Reading absence as trainer is the only choice that doesn't sign
     * everybody out on deploy.
     */
    public String extractRole(Claims claims) {
        Object role = claims.get("role");
        return role == null ? ROLE_TRAINER : role.toString();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

}
