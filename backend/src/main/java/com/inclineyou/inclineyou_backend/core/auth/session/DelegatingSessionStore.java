package com.inclineyou.inclineyou_backend.core.auth.session;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Collection;
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
 * <p>Two races are closed here (8 Nov 2026), because "evict" alone was not enough:
 * <ul>
 *   <li>A request that missed the cache reads the row as live, a revoke commits and evicts, and only THEN does the request
 *       cache what it read — a revoked session cached as live. So {@link #find} re-reads Postgres after caching and evicts
 *       if the row is no longer live.</li>
 *   <li>A revoke inside a transaction (closing an account, changing the number) evicted before its UPDATE was visible, so a
 *       request in between re-cached the old row. So every revoke evicts again after commit.</li>
 * </ul>
 * And an eviction that fails outright is bounded by the cache's short TTL ({@link RedisSessionStore#MAX_TTL}).
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
        if (r != null && row.filter(s -> s.live(Instant.now())).isPresent()) {
            r.put(row.get());
            // A revoke may have committed and evicted between the read above and the put: look again, and undo the put.
            if (jdbc.find(tokenHash).filter(s -> s.live(Instant.now())).isEmpty()) r.evict(tokenHash);
        }
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
        evict(List.of(tokenHash));
    }

    @Override
    public int revokeAllForSubject(String subject, Instant at, String reason) {
        List<Session> live = jdbc.listForSubject(subject);
        int n = jdbc.revokeAllForSubject(subject, at, reason);
        evict(live.stream().map(Session::tokenHash).toList());
        return n;
    }

    @Override
    public Optional<String> revokeById(UUID sessionId, String subject, Instant at, String reason) {
        var hash = jdbc.revokeById(sessionId, subject, at, reason);
        hash.ifPresent(h -> evict(List.of(h)));
        return hash;
    }

    @Override
    public List<String> revokeOthers(String subject, String keepTokenHash, Instant at, String reason) {
        var hashes = jdbc.revokeOthers(subject, keepTokenHash, at, reason);
        evict(hashes);
        return hashes;
    }

    @Override
    public boolean moveToTenant(String tokenHash, UUID tenantId) {
        boolean moved = jdbc.moveToTenant(tokenHash, tenantId);
        if (moved) evict(List.of(tokenHash));
        return moved;
    }

    /** Evict now, and — when the change is inside a transaction — again once it has committed and is visible to readers. */
    private void evict(Collection<String> hashes) {
        var r = redis();
        if (r == null || hashes.isEmpty()) return;
        hashes.forEach(r::evict);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    hashes.forEach(r::evict);
                }
            });
        }
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
