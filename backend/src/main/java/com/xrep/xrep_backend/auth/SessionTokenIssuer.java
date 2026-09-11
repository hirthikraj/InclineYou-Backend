package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * The web credential: an opaque random token, looked up on every request.
 *
 * <p>The token itself carries no information — it is 256 bits of
 * {@link SecureRandom} behind an {@code xs_} prefix, and everything it means
 * lives in {@code web_session}. That is the whole point. A JWT tells you who the
 * bearer is; this tells you nothing until the server agrees, and the server can
 * stop agreeing at any moment.
 *
 * <h2>Why the row stores a hash</h2>
 *
 * Same discipline as {@code otp_request.otp_hash}: a database dump must not be a
 * set of live credentials. SHA-256 and not bcrypt, deliberately — this is a
 * high-entropy random value with no structure to guess, so it needs a fast
 * one-way function rather than a slow one tuned for human-chosen secrets.
 * Bcrypt here would put a key-derivation function on the hot path of every
 * authenticated request in the web app.
 *
 * <h2>The prefix</h2>
 *
 * {@code xs_} makes {@link #handles} a string comparison. Without it, telling a
 * session token from a JWT would need a parse attempt per request, and every
 * mobile request would pay for the existence of the web.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SessionTokenIssuer implements AuthTokenIssuer {

    private final SessionStore sessions;
    private final AppProperties props;

    public static final String KIND = "session";
    public static final String PREFIX = "xs_";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    @Override
    public String kind() { return KIND; }

    @Override
    public boolean handles(String rawToken) {
        return rawToken != null && rawToken.startsWith(PREFIX);
    }

    @Override
    public IssuedToken issue(AuthPrincipal p, TokenContext context) {
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        String token = PREFIX + B64.encodeToString(entropy);

        Instant now = Instant.now();
        Instant expires = now.plus(props.getSession().getExpiryHours(), ChronoUnit.HOURS);

        sessions.save(new SessionStore.Session(
                UUID.randomUUID(), hash(token),
                p.subject(), p.phone(), p.role(),
                null, p.tenantId(),
                now, now, expires, null,
                context == null ? null : context.truncatedUserAgent()));

        return new IssuedToken(token, KIND, expires);
    }

    @Override
    public Optional<AuthPrincipal> resolve(String rawToken) {
        if (!handles(rawToken)) return Optional.empty();
        String h = hash(rawToken);
        Instant now = Instant.now();

        return sessions.find(h)
                .filter(s -> s.live(now))
                .map(s -> {
                    sessions.touch(h, now);
                    return new AuthPrincipal(
                            s.subject(), s.phone(), s.role(), s.tenantId(), s.expiresAt());
                });
    }

    @Override
    public void revoke(String rawToken) {
        if (handles(rawToken)) sessions.revoke(hash(rawToken), Instant.now());
    }

    /**
     * Switching workspace is an UPDATE, and the credential in the browser does
     * not change. That is the second thing a server-side session buys and the
     * reason the web switcher can be instant while the phone re-mints.
     */
    @Override
    public boolean switchTenant(String rawToken, UUID tenantId) {
        return handles(rawToken) && sessions.moveToTenant(hash(rawToken), tenantId);
    }

    /** Every credential this subject holds, ended now. */
    public int revokeAllFor(String subject) {
        return sessions.revokeAllForSubject(subject, Instant.now());
    }

    static String hash(String token) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required of every JVM. If it is absent, failing loudly
            // is the only honest option — a fallback here would be a weaker
            // credential store nobody asked for.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
