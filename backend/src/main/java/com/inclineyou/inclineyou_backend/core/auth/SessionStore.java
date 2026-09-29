package com.inclineyou.inclineyou_backend.core.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Where a web session lives.
 *
 * <p>Two implementations behind {@link DelegatingSessionStore}, the same shape
 * {@link OtpStore} already uses: Redis for speed, Postgres for truth. The
 * failure this arrangement exists to prevent is the same one — a cache going
 * down must not sign anybody out.
 *
 * <p>Unlike the OTP store, the two are NOT independent here. Postgres is the
 * system of record and always written; Redis is a read-through cache in front of
 * it. A session is a credential, and a credential that exists in one store and
 * not the other is a sign-in that works or fails depending on which machine
 * answered.
 */
public interface SessionStore {

    record Session(
            UUID id,
            String tokenHash,
            String subject,
            String phone,
            String role,
            UUID appUserId,
            UUID tenantId,
            Instant issuedAt,
            Instant lastSeenAt,
            Instant expiresAt,
            Instant revokedAt,
            String userAgent
    ) {
        public boolean live(Instant now) {
            return revokedAt == null && expiresAt.isAfter(now);
        }
    }

    void save(Session session);

    Optional<Session> find(String tokenHash);

    /** Advance {@code last_seen_at}. Called at most once a minute per session. */
    void touch(String tokenHash, Instant seenAt);

    void revoke(String tokenHash, Instant at);

    /** Sign out everywhere — used when a number changes or an account closes. */
    int revokeAllForSubject(String subject, Instant at);

    boolean moveToTenant(String tokenHash, UUID tenantId);

    List<Session> listForSubject(String subject);

    /** Delete what has been dead long enough to be uninteresting. */
    int purgeExpiredBefore(Instant cutoff);
}
