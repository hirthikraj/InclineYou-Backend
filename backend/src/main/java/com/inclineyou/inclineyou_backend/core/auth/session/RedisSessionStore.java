package com.inclineyou.inclineyou_backend.core.auth.session;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * A read-through cache in front of {@code web_session}.
 *
 * <p>One HASH per session, {@code session:{hash}}, kept for at most
 * {@link #MAX_TTL} (or the session's own expiry, if sooner). Short on purpose
 * (8 Nov 2026): a revoke that fails to evict leaves a stale copy that still
 * opens the door, and the TTL is the bound on how long — five minutes, not the
 * session's thirty days. The price is one Postgres read per session every few
 * minutes.
 *
 * <p>A hash of plain strings rather than serialised JSON, and deliberately: it
 * matches {@code RedisOtpStore}, it needs no {@code ObjectMapper} and no
 * {@code JavaTimeModule}, and it cannot break because somebody changed how a
 * record serialises. The field list is small and closed.
 *
 * <p><b>This is a cache, not a second source of truth.</b> Postgres is always
 * written first, and anything that changes what a session MEANS — a revoke, a
 * workspace switch — EVICTS rather than updates. A stale cached session is a
 * credential that outlives its own revocation, so the only safe update is a
 * delete.
 */
@Component
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class RedisSessionStore {

    private final StringRedisTemplate redis;

    /** How long a cached copy may live: the bound on a revoked session surviving a failed eviction. */
    static final Duration MAX_TTL = Duration.ofMinutes(5);

    private static String key(String tokenHash) { return "session:" + tokenHash; }

    public void put(SessionStore.Session s) {
        Duration ttl = Duration.between(Instant.now(), s.expiresAt());
        if (ttl.isNegative() || ttl.isZero()) return;
        try {
            Map<String, String> fields = new HashMap<>();
            fields.put("id", s.id().toString());
            fields.put("subject", s.subject());
            fields.put("phone", s.phone() == null ? "" : s.phone());
            fields.put("role", s.role());
            fields.put("appUserId", s.appUserId() == null ? "" : s.appUserId().toString());
            fields.put("tenantId", s.tenantId() == null ? "" : s.tenantId().toString());
            fields.put("issuedAt", Long.toString(s.issuedAt().toEpochMilli()));
            fields.put("lastSeenAt", Long.toString(s.lastSeenAt().toEpochMilli()));
            fields.put("expiresAt", Long.toString(s.expiresAt().toEpochMilli()));
            fields.put("userAgent", s.userAgent() == null ? "" : s.userAgent());

            String k = key(s.tokenHash());
            redis.opsForHash().putAll(k, fields);
            Instant cap = Instant.now().plus(MAX_TTL);
            Boolean set = redis.expireAt(k, s.expiresAt().isBefore(cap) ? s.expiresAt() : cap);
            // Two calls, not one: a copy written without its TTL would never leave. Take it back.
            if (!Boolean.TRUE.equals(set)) redis.delete(k);
        } catch (Exception e) {
            log.debug("session cache write skipped: {}", e.getMessage());
            try {
                redis.delete(key(s.tokenHash()));
            } catch (Exception ignored) {
                // Redis is down; the write most likely never landed either.
            }
        }
    }

    public Optional<SessionStore.Session> get(String tokenHash) {
        try {
            Map<String, String> f = redis.<String, String>opsForHash().entries(key(tokenHash));
            if (f == null || f.isEmpty() || f.get("subject") == null) return Optional.empty();

            // A cached row is never revoked — a revoke evicts the key. So
            // revokedAt is always null here, and its absence is the invariant
            // rather than a missing field.
            return Optional.of(new SessionStore.Session(
                    UUID.fromString(f.get("id")),
                    tokenHash,
                    f.get("subject"),
                    blankToNull(f.get("phone")),
                    f.get("role"),
                    uuidOrNull(f.get("appUserId")),
                    uuidOrNull(f.get("tenantId")),
                    Instant.ofEpochMilli(Long.parseLong(f.get("issuedAt"))),
                    Instant.ofEpochMilli(Long.parseLong(f.get("lastSeenAt"))),
                    Instant.ofEpochMilli(Long.parseLong(f.get("expiresAt"))),
                    null,
                    blankToNull(f.get("userAgent"))));
        } catch (Exception e) {
            log.debug("session cache read skipped: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public void evict(String tokenHash) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                redis.delete(key(tokenHash));
                return;
            } catch (Exception e) {
                // The one failure here that matters: a revoked credential stays readable until the copy's TTL (MAX_TTL).
                if (attempt == 2) log.error("session cache eviction failed twice; a revoked session may work for up to {}: {}",
                        MAX_TTL, e.getMessage());
            }
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isEmpty() ? null : v;
    }

    private static UUID uuidOrNull(String v) {
        return v == null || v.isEmpty() ? null : UUID.fromString(v);
    }
}
