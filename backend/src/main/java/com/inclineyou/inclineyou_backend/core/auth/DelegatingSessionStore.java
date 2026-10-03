package com.inclineyou.inclineyou_backend.core.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Postgres for truth, Redis for speed.
 *
 * <p>Every write goes to Postgres first and only then touches the cache, and
 * every write that changes what a session MEANS — revoke, switch workspace —
 * evicts rather than updates. The asymmetry is deliberate: a cache miss costs a
 * query, a stale cache hit costs a revoked credential that still works.
 *
 * <p>With Redis off or unreachable this is simply {@link JdbcSessionStore}, at
 * the price of one indexed lookup per request. That is the correct trade: the
 * alternative is a cache outage becoming a sign-out.
 */
@Component
@Primary
@Slf4j
public class DelegatingSessionStore implements SessionStore {

    private final JdbcSessionStore jdbc;
    private final ObjectProvider<RedisSessionStore> cache;

    public DelegatingSessionStore(JdbcSessionStore jdbc, ObjectProvider<RedisSessionStore> cache) {
        this.jdbc = jdbc;
        this.cache = cache;
    }

    private RedisSessionStore redis() { return cache.getIfAvailable(); }

    @Override
    public void save(Session session) {
        jdbc.save(session);
        var r = redis();
        if (r != null) r.put(session);
    }

    @Override
    public Optional<Session> find(String tokenHash) {
        var r = redis();
        if (r != null) {
            var hit = r.get(tokenHash);
            if (hit.isPresent()) return hit;
        }
        var row = jdbc.find(tokenHash);
        if (r != null) row.filter(s -> s.live(Instant.now())).ifPresent(r::put);
        return row;
    }

    @Override
    public void touch(String tokenHash, Instant seenAt) {
        // Postgres only. `last_seen_at` is for the device list, not for auth, so
        // letting the cached copy be a minute stale costs nothing worth a write.
        jdbc.touch(tokenHash, seenAt);
    }

    @Override
    public void revoke(String tokenHash, Instant at, String reason) {
        jdbc.revoke(tokenHash, at, reason);
        var r = redis();
        if (r != null) r.evict(tokenHash);
    }

    @Override
    public int revokeAllForSubject(String subject, Instant at, String reason) {
        List<Session> live = jdbc.listForSubject(subject);
        int n = jdbc.revokeAllForSubject(subject, at, reason);
        var r = redis();
        if (r != null) live.forEach(s -> r.evict(s.tokenHash()));
        return n;
    }

    @Override
    public Optional<String> revokeById(UUID sessionId, String subject, Instant at, String reason) {
        var hash = jdbc.revokeById(sessionId, subject, at, reason);
        var r = redis();
        if (r != null) hash.ifPresent(r::evict);
        return hash;
    }

    @Override
    public List<String> revokeOthers(String subject, String keepTokenHash, Instant at, String reason) {
        var hashes = jdbc.revokeOthers(subject, keepTokenHash, at, reason);
        var r = redis();
        if (r != null) hashes.forEach(r::evict);
        return hashes;
    }

    @Override
    public boolean moveToTenant(String tokenHash, UUID tenantId) {
        boolean moved = jdbc.moveToTenant(tokenHash, tenantId);
        var r = redis();
        if (moved && r != null) r.evict(tokenHash);
        return moved;
    }

    @Override
    public List<Session> listForSubject(String subject) {
        return jdbc.listForSubject(subject);
    }

    @Override
    public int purgeExpiredBefore(Instant cutoff) {
        return jdbc.purgeExpiredBefore(cutoff);
    }
}
