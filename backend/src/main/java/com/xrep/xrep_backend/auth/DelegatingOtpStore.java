package com.xrep.xrep_backend.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

/**
 * Redis when it answers, Postgres when it does not.
 *
 * The failure mode this exists to prevent is the obvious one: a cache goes down
 * and nobody can sign in. That is unacceptable for the one screen standing
 * between a trainer and their own data, so every call here has a second home.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────────
 *
 * Fall open. The state behind these calls is a lock and a send ceiling, and
 * "Redis is unreachable so everything is allowed" would mean unlimited guesses
 * at a six-digit code and an unbounded SMS bill — reintroducing SEC-OTP-02 by
 * accident, at exactly the moment nobody is watching. Down means "ask the
 * database", never "stop asking".
 *
 * ── The cost, stated plainly ──────────────────────────────────────────────────
 *
 * The two stores do not share state. A number that has been counting sends in
 * Redis has no rows in `otp_request` to count, so at the moment of a failover its
 * send history reads as empty and the ladder restarts — one extra text, once,
 * per number that was mid-flight. A LOCK is the part that matters and it does not
 * have this problem: locking writes to whichever store is live at the time, and
 * both are consulted on the way in, so a lock imposed before a failover is still
 * found after one.
 */
@Component
@Primary
@Slf4j
public class DelegatingOtpStore implements OtpStore {

    private final ObjectProvider<RedisOtpStore> redis;
    private final JpaOtpStore jpa;

    /** Rate-limits the "Redis is down" log so an outage cannot become the outage. */
    private final AtomicLong lastComplaint = new AtomicLong(0);
    private static final long COMPLAIN_EVERY_MS = 30_000;

    /**
     * When to try Redis again after a failure — a plain circuit breaker.
     *
     * Without it, a Redis outage costs every sign-in the connection timeout on
     * every call it makes, and `send` makes several. Measured at ~1s per request
     * against a stopped Redis, for work that should take ~100ms: the fallback was
     * correct but the path to it was slow enough to be its own incident. Skipping
     * a store we already know is down turns that back into a straight Postgres
     * call.
     *
     * Deliberately short. Being stuck on the fallback for longer than necessary
     * means a weaker send ceiling than the one that is configured.
     */
    private static final long CIRCUIT_OPEN_MS = 5_000;
    private final AtomicLong skipRedisUntil = new AtomicLong(0);

    public DelegatingOtpStore(ObjectProvider<RedisOtpStore> redis, JpaOtpStore jpa) {
        this.redis = redis;
        this.jpa = jpa;
    }

    /* ------------------------------------------------------------------ code */

    @Override
    public void saveCode(String phone, String hash, Instant expiresAt) {
        run(s -> { s.saveCode(phone, hash, expiresAt); return null; });
    }

    @Override
    public Optional<Code> activeCode(String phone) {
        return run(s -> s.activeCode(phone));
    }

    @Override
    public int recordWrongAttempt(String phone) {
        return run(s -> s.recordWrongAttempt(phone));
    }

    @Override
    public void consume(String phone) {
        run(s -> { s.consume(phone); return null; });
    }

    /* ------------------------------------------------------------------ lock */

    /**
     * Written to BOTH stores, and this is the one place that is worth the extra
     * write. A lock is a ten-minute security promise; if it lived only in Redis
     * and Redis restarted mid-lock, the promise would quietly expire early. The
     * Postgres copy is the backstop, and it costs one row update per lockout —
     * which by definition happens rarely.
     */
    @Override
    public void lock(String phone, Instant until) {
        run(s -> { s.lock(phone, until); return null; });
        if (usingRedis()) {
            try {
                jpa.lock(phone, until);
            } catch (RuntimeException e) {
                log.warn("could not mirror OTP lock to Postgres for {}: {}", masked(phone), e.toString());
            }
        }
    }

    /**
     * The LATER of the two, so a lock recorded in either store is honoured.
     *
     * Deliberately not "whichever store is live": failing over must not hand
     * somebody a clean slate, and that is precisely when they would most like
     * one.
     */
    @Override
    public Instant lockedUntil(String phone) {
        Instant fromRedis = run(s -> s.lockedUntil(phone));
        Instant fromDb;
        try {
            fromDb = jpa.lockedUntil(phone);
        } catch (RuntimeException e) {
            fromDb = null;
        }
        if (fromRedis == null) return fromDb;
        if (fromDb == null) return fromRedis;
        return fromRedis.isAfter(fromDb) ? fromRedis : fromDb;
    }

    /* ----------------------------------------------------------- send window */

    @Override
    public void recordSend(String phone, Instant at) {
        run(s -> { s.recordSend(phone, at); return null; });
    }

    @Override
    public long countSendsSince(String phone, Instant since) {
        return run(s -> s.countSendsSince(phone, since));
    }

    @Override
    public Instant lastSentAt(String phone) {
        return run(s -> s.lastSentAt(phone));
    }

    @Override
    public Instant oldestSendSince(String phone, Instant since) {
        return run(s -> s.oldestSendSince(phone, since));
    }

    /* ---------------------------------------------------------------- plumbing */

    /** Redis is configured AND not currently being skipped by the breaker. */
    private boolean usingRedis() {
        return redis.getIfAvailable() != null
                && System.currentTimeMillis() >= skipRedisUntil.get();
    }

    /**
     * Try Redis, fall back to Postgres on any connection-shaped failure.
     *
     * A {@link RuntimeException} from the Redis path is caught broadly on
     * purpose: Lettuce surfaces timeouts, connection resets and command failures
     * as several unrelated types, and the correct response to all of them is the
     * same. A bug in the Redis store would be masked by this, which is the price
     * — and why {@link JpaOtpStore} is exercised by its own tests rather than
     * only through here.
     */
    private <T> T run(Function<OtpStore, T> call) {
        RedisOtpStore fast = redis.getIfAvailable();
        if (fast != null && System.currentTimeMillis() >= skipRedisUntil.get()) {
            try {
                T result = call.apply(fast);
                // Back in business. Cleared explicitly rather than left to expire
                // so a recovered Redis is used on the very next call.
                skipRedisUntil.set(0);
                return result;
            } catch (RuntimeException e) {
                skipRedisUntil.set(System.currentTimeMillis() + CIRCUIT_OPEN_MS);
                complain(e);
            }
        }
        return call.apply(jpa);
    }

    private void complain(RuntimeException e) {
        long now = System.currentTimeMillis();
        long previous = lastComplaint.get();
        if (now - previous > COMPLAIN_EVERY_MS && lastComplaint.compareAndSet(previous, now)) {
            log.warn("Redis unavailable for OTP state — falling back to Postgres: {}", e.toString());
        }
    }

    private static String masked(String phone) {
        return phone == null || phone.length() <= 4 ? "…" : "…" + phone.substring(phone.length() - 4);
    }
}
