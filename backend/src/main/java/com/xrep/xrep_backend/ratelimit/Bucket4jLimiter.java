package com.xrep.xrep_backend.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Token buckets held in Redis, with an in-process bucket underneath.
 *
 * One class serving two callers — the per-number OTP send ceiling and the
 * per-caller API ceiling — because they are the same question asked about
 * different keys, and having one implementation means one place where the
 * failover behaviour is decided.
 *
 * ── Why Redis and not the map ─────────────────────────────────────────────────
 *
 * The in-memory limiter was honest about its limitation and the known-gaps list
 * carried it: counters are per process, so a restart clears them and each
 * instance keeps its own, making the real ceiling `limit × instances`. That is
 * tolerable for a capacity guard and NOT tolerable for the OTP send ceiling,
 * which is what stands between us and somebody else's phone buzzing all night on
 * our bill. Redis makes the ceiling the ceiling.
 *
 * ── When Redis is not there ───────────────────────────────────────────────────
 *
 * Fall back to {@link RateLimiter}, the in-process implementation. That is a
 * weaker limit, not an absent one — the alternative during a cache outage is
 * either refusing every request or allowing every request, and both are worse
 * than "the ceiling is temporarily per-instance again".
 */
@Component
@Slf4j
public class Bucket4jLimiter {

    private final RedisProxyManagerHolder proxyManager;
    private final RateLimiter fallback;

    private final AtomicLong lastComplaint = new AtomicLong(0);
    private static final long COMPLAIN_EVERY_MS = 30_000;

    public Bucket4jLimiter(RedisProxyManagerHolder proxyManager, RateLimiter fallback) {
        this.proxyManager = proxyManager;
        this.fallback = fallback;
    }

    /** Allowed, or refused with the wait that makes it allowed. */
    public record Decision(boolean allowed, int retryAfterSeconds) {
        public static final Decision ALLOWED = new Decision(true, 0);
    }

    /**
     * Take one token from {@code key}'s bucket.
     *
     * @param capacity tokens the bucket holds — the ceiling
     * @param period   how long a full bucket takes to refill from empty
     */
    public Decision tryConsume(String key, long capacity, Duration period) {
        if (capacity <= 0) return Decision.ALLOWED;

        ProxyManager<String> manager = proxyManager.get();
        if (manager != null) {
            try {
                return decide(manager.builder()
                        .build(key, () -> configuration(capacity, period))
                        .tryConsumeAndReturnRemaining(1));
            } catch (RuntimeException e) {
                // Drop the connection before falling back, so the next request does not queue behind the same dead socket.
                proxyManager.invalidate();
                complain(e);
            }
        }
        return fallbackDecision(key, capacity, period);
    }

    /**
     * Greedy refill: tokens return continuously rather than all at once.
     *
     * The alternative, `refillIntervally`, hands back the whole capacity on a
     * fixed boundary — which is the fixed-window problem the in-memory limiter's
     * own comment warns about, where twice the limit gets through across the
     * edge. Greedy is also the kinder shape for the person on the end of it: a
     * number at its daily ceiling recovers one code every few hours instead of
     * being shut out until the same time tomorrow.
     */
    private static BucketConfiguration configuration(long capacity, Duration period) {
        return BucketConfiguration.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(capacity)
                        .refillGreedy(capacity, period)
                        .build())
                .build();
    }

    private static Decision decide(ConsumptionProbe probe) {
        if (probe.isConsumed()) return Decision.ALLOWED;
        long seconds = Math.max(1, probe.getNanosToWaitForRefill() / 1_000_000_000L
                + (probe.getNanosToWaitForRefill() % 1_000_000_000L > 0 ? 1 : 0));
        return new Decision(false, (int) seconds);
    }

    /**
     * The in-process bucket, expressed in the same terms.
     *
     * {@link RateLimiter} takes an {@code AppProperties.Tier}, which is a limit
     * and a window — the same two numbers, so the translation is direct and the
     * fallback enforces the same shape at a smaller scope.
     */
    private Decision fallbackDecision(String key, long capacity, Duration period) {
        var tier = new com.xrep.xrep_backend.config.AppProperties.Tier();
        tier.setLimit((int) Math.min(Integer.MAX_VALUE, capacity));
        tier.setWindowSeconds((int) Math.max(1, period.toSeconds()));
        var decision = fallback.take(key, tier);
        return new Decision(decision.allowed(), decision.retryAfterSeconds());
    }

    /** Bounded, so a Redis outage cannot fill the log faster than it fills the alerts. */
    private void complain(RuntimeException e) {
        long now = System.currentTimeMillis();
        long previous = lastComplaint.get();
        if (now - previous > COMPLAIN_EVERY_MS && lastComplaint.compareAndSet(previous, now)) {
            log.warn("Redis unavailable for rate limiting — falling back to in-process buckets: {}",
                    e.toString());
        }
    }

    /** Visible for tests and /health: is the distributed path actually in use? */
    public boolean distributed() {
        return proxyManager.get() != null;
    }
}
