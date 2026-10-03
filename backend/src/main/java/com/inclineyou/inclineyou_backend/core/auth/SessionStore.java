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

    /** The schema's {@code web_session_revoked_reason} values this code writes. */
    String SIGN_OUT = "sign_out";
    String SIGN_OUT_ALL = "sign_out_all";
    String PHONE_CHANGED = "phone_changed";

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

    /**
     * {@code reason} is one of the schema's {@code web_session_revoked_reason}
     * values ({@link #SIGN_OUT}, {@link #SIGN_OUT_ALL}, {@link #PHONE_CHANGED}, …).
     * The table's CHECK ties {@code revoked_at} and {@code revoked_reason} together,
     * so a revoke without one is refused by the database — which is what the
     * pre-reason signature of this method did to every sign-out.
     */
    void revoke(String tokenHash, Instant at, String reason);

    /** Sign out everywhere — used when an account closes. */
    int revokeAllForSubject(String subject, Instant at, String reason);

    /**
     * One session of this subject, by its id. Empty when it is not theirs, is
     * already revoked or does not exist — the three are deliberately
     * indistinguishable to the caller. Returns the revoked token hash so the cache
     * in front can drop it.
     */
    Optional<String> revokeById(UUID sessionId, String subject, Instant at, String reason);

    /**
     * Every live session of this subject EXCEPT {@code keepTokenHash} (null keeps
     * none) — the number changed, or "sign out everywhere else". Returns the
     * revoked token hashes.
     */
    List<String> revokeOthers(String subject, String keepTokenHash, Instant at, String reason);

    boolean moveToTenant(String tokenHash, UUID tenantId);

    List<Session> listForSubject(String subject);

    /** Delete what has been dead long enough to be uninteresting. */
    int purgeExpiredBefore(Instant cutoff);
}
