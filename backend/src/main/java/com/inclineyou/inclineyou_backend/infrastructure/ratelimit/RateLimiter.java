package com.inclineyou.inclineyou_backend.infrastructure.ratelimit;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * One token bucket per identity per tier.
 *
 * A bucket holds {@code limit} tokens and refills continuously at
 * {@code limit / windowSeconds} per second. A request takes one; when there is
 * less than one left the request is refused and told how long until there is.
 * Smooth refill rather than a counter that resets on the minute, because a fixed
 * window lets twice the limit through across its boundary — the first request of
 * a new window is free however hard the last one was hammered.
 *
 * ── This is now the FALLBACK ──────────────────────────────────────────────────
 *
 * Live counting happens in Redis via {@link Bucket4jLimiter}. This class is what
 * runs when Redis is unreachable, and it is kept rather than deleted because the
 * alternative during a cache outage is refusing every request or allowing every
 * request, and both are worse than a ceiling that is temporarily per-instance.
 *
 * Which is also its known limitation, unchanged: counters are per process, so a
 * restart clears them and a second instance keeps its own, making the effective
 * ceiling the configured one times the instance count. Acceptable for a capacity
 * guard for the length of an outage; never acceptable for the OTP send ceiling,
 * which is why that one is a Bucket4j bucket with a Postgres-backed history
 * underneath rather than this.
 */
@Component
@Slf4j
public class RateLimiter {

    /** Above this many live buckets, sweep the idle ones before adding more. */
    private static final int SWEEP_ABOVE = 10_000;
    private static final long SWEEP_EVERY_NANOS = 60L * 1_000_000_000L;

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong lastSweep = new AtomicLong(System.nanoTime());

    /** Allowed, or refused with the wait that makes it allowed. */
    public record Decision(boolean allowed, int retryAfterSeconds) {
        static final Decision ALLOWED = new Decision(true, 0);
    }

    public Decision take(String key, AppProperties.Tier tier) {
        if (tier.getLimit() <= 0) return Decision.ALLOWED;

        long now = System.nanoTime();
        sweepIfCrowded(now);

        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(tier.getLimit(), now));
        double rate = tier.ratePerSecond();

        // Short critical section per bucket rather than one lock for the map: two
        // requests from the same identity are the only pair that can race, and
        // they are the pair that must not both read the same last token.
        synchronized (bucket) {
            bucket.refill(rate, tier.getLimit(), now);
            if (bucket.tokens >= 1d) {
                bucket.tokens -= 1d;
                return Decision.ALLOWED;
            }
            double missing = 1d - bucket.tokens;
            int wait = (int) Math.max(1, Math.ceil(missing / rate));
            return new Decision(false, wait);
        }
    }

    /** For tests and for anything that needs a clean slate. */
    public void reset() {
        buckets.clear();
    }

    /**
     * Drop buckets that have refilled completely.
     *
     * A full bucket says exactly what an absent one says, so forgetting it costs
     * nothing and is what stops a map keyed by caller identity from growing
     * without limit — which is how a rate limiter becomes the outage.
     */
    private void sweepIfCrowded(long now) {
        if (buckets.size() <= SWEEP_ABOVE) return;
        long previous = lastSweep.get();
        if (now - previous < SWEEP_EVERY_NANOS) return;
        if (!lastSweep.compareAndSet(previous, now)) return; // another thread has it

        int before = buckets.size();
        buckets.values().removeIf(b -> {
            synchronized (b) {
                return b.tokens >= b.capacity;
            }
        });
        log.info("rate limiter swept {} idle buckets, {} live", before - buckets.size(), buckets.size());
    }

    private static final class Bucket {
        private final double capacity;
        private double tokens;
        private long lastRefillNanos;

        Bucket(int capacity, long now) {
            this.capacity = capacity;
            this.tokens = capacity;
            this.lastRefillNanos = now;
        }

        /** nanoTime, not the wall clock: a clock correction must not grant tokens. */
        void refill(double ratePerSecond, int limit, long now) {
            double elapsedSeconds = (now - lastRefillNanos) / 1_000_000_000d;
            if (elapsedSeconds <= 0) return;
            tokens = Math.min(limit, tokens + elapsedSeconds * ratePerSecond);
            lastRefillNanos = now;
        }
    }
}
