package com.xrep.xrep_backend.ratelimit;

import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.RedisClient;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.codec.StringCodec;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The Bucket4j proxy manager, connected on first use rather than at startup.
 *
 * ── Why this class exists at all ──────────────────────────────────────────────
 *
 * It was a plain {@code @Bean} first, and that was wrong in a way worth
 * recording: building a {@code LettuceBasedProxyManager} opens the connection,
 * so constructing it during context refresh made Redis a hard startup
 * dependency. With Redis down the application did not degrade to the in-memory
 * limiter as designed — it failed to boot at all, which is the exact outcome the
 * fallback was chosen to prevent, arrived at by accident.
 *
 * Deferring the connect is the whole fix. {@code RedisClient.create} does no
 * I/O; {@code client.connect} does, so only the second one is allowed to happen
 * lazily and inside a try.
 *
 * ── Retrying ──────────────────────────────────────────────────────────────────
 *
 * A failed connect is not permanent. Redis restarts, and an application that
 * gave up on it at 3am and stayed on in-memory buckets until the next deploy
 * would be quietly running with a weaker limit for days. So a failure is cached
 * only for {@link #RETRY_AFTER}, and the next caller past that tries again.
 */
@Component
@Slf4j
public class RedisProxyManagerHolder {

    /** Long enough not to hammer a dead server, short enough to heal unattended. */
    private static final Duration RETRY_AFTER = Duration.ofSeconds(30);

    private final ObjectProvider<RedisClient> clients;

    private volatile ProxyManager<String> manager;
    private volatile long nextAttemptAt = 0L;

    public RedisProxyManagerHolder(ObjectProvider<RedisClient> clients) {
        this.clients = clients;
    }

    /**
     * Drop the cached manager after a failed command, so the next caller falls
     * straight through to the in-memory bucket instead of paying the connection
     * timeout again.
     *
     * Without this the manager stays cached — it is an object, not a live socket
     * — and every single request during a Redis outage waits out the 250ms
     * timeout before failing over. On a busy endpoint that turns a cache outage
     * into a latency incident, which is precisely the failure the fallback was
     * supposed to prevent. It also made {@link #get()} report "connected" while
     * Redis was stopped, because holding a manager and being able to reach Redis
     * are not the same fact.
     */
    void invalidate() {
        synchronized (this) {
            manager = null;
            nextAttemptAt = System.currentTimeMillis() + RETRY_AFTER.toMillis();
        }
    }

    /** The manager, or null when Redis is off or unreachable right now. */
    public ProxyManager<String> get() {
        ProxyManager<String> current = manager;
        if (current != null) return current;

        long now = System.currentTimeMillis();
        if (now < nextAttemptAt) return null;

        RedisClient client = clients.getIfAvailable();
        if (client == null) return null; // app.redis.enabled = false

        synchronized (this) {
            if (manager != null) return manager;
            try {
                RedisCodec<String, byte[]> codec =
                        RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE);
                manager = Bucket4jLettuce
                        .casBasedBuilder(client.connect(codec))
                        .expirationAfterWrite(ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(Duration.ofHours(1)))
                        .build();
                log.info("rate limiting is using Redis");
                return manager;
            } catch (RuntimeException e) {
                nextAttemptAt = now + RETRY_AFTER.toMillis();
                log.warn("Redis unavailable for rate limiting, retrying in {}s: {}",
                        RETRY_AFTER.toSeconds(), e.toString());
                return null;
            }
        }
    }

    @PreDestroy
    void close() {
        manager = null;
    }
}
