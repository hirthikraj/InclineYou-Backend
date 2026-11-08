package com.inclineyou.inclineyou_backend.core.auth.session;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * The Redis session cache must never let a revoked session through (8 Nov 2026 review of sign-out). CI has no Redis, so the
 * two races and the failure bound are pinned here against mocks: {@link DelegatingSessionStore} decides WHEN to evict,
 * {@link RedisSessionStore} how long a copy may live.
 */
class SessionCacheTest {

    private static final String HASH = "a".repeat(64);

    private final JdbcSessionStore jdbc = mock(JdbcSessionStore.class);
    private final RedisSessionStore redis = mock(RedisSessionStore.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<RedisSessionStore> provider = mock(ObjectProvider.class);
    private final DelegatingSessionStore store;

    SessionCacheTest() {
        when(provider.getIfAvailable()).thenReturn(redis);
        store = new DelegatingSessionStore(jdbc, provider);
    }

    @AfterEach
    void clearSync() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    private static SessionStore.Session session(Instant revokedAt, Instant expiresAt) {
        Instant now = Instant.now();
        return new SessionStore.Session(UUID.randomUUID(), HASH, "subject", "+919876543210", "trainer", UUID.randomUUID(), null,
                now, now, expiresAt, revokedAt, "ua");
    }

    private static SessionStore.Session live() { return session(null, Instant.now().plus(Duration.ofDays(30))); }

    @Test
    @DisplayName("finding 1: a sign-out that commits between a cache miss's read and its put does not leave the session cached as live")
    void revokeBetweenReadAndPutIsUndone() {
        when(redis.get(HASH)).thenReturn(Optional.empty());
        // The request reads the row live; by the time it looks again the revoke has committed.
        when(jdbc.find(HASH)).thenReturn(Optional.of(live()), Optional.of(session(Instant.now(), Instant.now().plusSeconds(60))));

        var answered = store.find(HASH);

        assertThat(answered).isPresent();   // this one request was already in flight
        var order = inOrder(redis);
        order.verify(redis).put(any());
        order.verify(redis).evict(HASH);    // ...but the copy does not outlive it
    }

    @Test
    @DisplayName("a cache miss on a session that stays live is cached and kept")
    void liveSessionStaysCached() {
        when(redis.get(HASH)).thenReturn(Optional.empty());
        when(jdbc.find(HASH)).thenReturn(Optional.of(live()));

        store.find(HASH);

        verify(redis).put(any());
        verify(redis, never()).evict(anyString());
    }

    @Test
    @DisplayName("finding 1: a revoke inside a transaction evicts again after commit, when a re-cached copy would otherwise survive")
    void revokeInTransactionEvictsAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        when(jdbc.listForSubject("subject")).thenReturn(List.of(live()));

        store.revokeAllForSubject("subject", Instant.now(), SessionStore.SIGN_OUT_ALL);
        verify(redis, times(1)).evict(HASH);

        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) sync.afterCommit();
        verify(redis, times(2)).evict(HASH);
    }

    @Test
    @DisplayName("every revoke path evicts: one, by id, others, all, and a workspace move")
    void everyRevokeEvicts() {
        when(jdbc.revokeById(any(), any(), any(), any())).thenReturn(Optional.of(HASH));
        when(jdbc.revokeOthers(any(), any(), any(), any())).thenReturn(List.of(HASH));
        when(jdbc.moveToTenant(eq(HASH), any())).thenReturn(true);

        store.revoke(HASH, Instant.now(), SessionStore.SIGN_OUT);
        store.revokeById(UUID.randomUUID(), "subject", Instant.now(), SessionStore.SIGN_OUT);
        store.revokeOthers("subject", "keep", Instant.now(), SessionStore.SIGN_OUT_ALL);
        store.moveToTenant(HASH, UUID.randomUUID());

        verify(redis, times(4)).evict(HASH);
    }

    /* ----------------------------------------------------------- RedisSessionStore */

    @SuppressWarnings("unchecked")
    private final HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
    private final StringRedisTemplate template = mock(StringRedisTemplate.class);

    private RedisSessionStore realCache() {
        doReturn(hashes).when(template).opsForHash();
        return new RedisSessionStore(template);
    }

    @Test
    @DisplayName("finding 2: a cached copy lives at most five minutes, not the session's thirty days")
    void cachedCopyIsShortLived() {
        var cache = realCache();
        when(template.expireAt(anyString(), any(Instant.class))).thenReturn(true);

        cache.put(live());

        var at = ArgumentCaptor.forClass(Instant.class);
        verify(template).expireAt(eq("session:" + HASH), at.capture());
        assertThat(at.getValue()).isBefore(Instant.now().plus(RedisSessionStore.MAX_TTL).plusSeconds(1));
        verify(template, never()).delete(anyString());
    }

    @Test
    @DisplayName("a copy whose TTL could not be set is removed rather than left to live forever")
    void copyWithoutTtlIsRemoved() {
        var cache = realCache();
        when(template.expireAt(anyString(), any(Instant.class))).thenThrow(new RuntimeException("redis timeout"));

        cache.put(live());

        verify(template).delete("session:" + HASH);
    }

    @Test
    @DisplayName("finding 2: a failed eviction is retried once")
    void evictionIsRetried() {
        var cache = realCache();
        when(template.delete(anyString())).thenThrow(new RuntimeException("redis timeout")).thenReturn(true);

        cache.evict(HASH);

        verify(template, times(2)).delete("session:" + HASH);
    }
}
