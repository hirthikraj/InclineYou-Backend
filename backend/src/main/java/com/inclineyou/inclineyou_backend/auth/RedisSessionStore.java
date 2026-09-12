package com.inclineyou.inclineyou_backend.auth;

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
 * <p>One HASH per session, {@code session:{hash}}, with a TTL equal to the
 * session's own lifetime — so expiry is Redis's job rather than a sweeper's,
 * which is the same reasoning {@code RedisOtpStore} gives for the code key.
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
            redis.expireAt(k, s.expiresAt());
        } catch (Exception e) {
            log.debug("session cache write skipped: {}", e.getMessage());
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
        try {
            redis.delete(key(tokenHash));
        } catch (Exception e) {
            // The one failure here that matters: it leaves a revoked credential
            // readable until its TTL. WARN rather than DEBUG for that reason.
            log.warn("session cache eviction failed for one session: {}", e.getMessage());
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isEmpty() ? null : v;
    }

    private static UUID uuidOrNull(String v) {
        return v == null || v.isEmpty() ? null : UUID.fromString(v);
    }
}
