package com.inclineyou.inclineyou_backend.core.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The one-time code, its counters and the send history, in Redis.
 *
 * Three keys per number, and each is shaped by the question it answers:
 *
 * <pre>
 *   otp:code:{phone}    HASH  { hash, expiresAt, attempts }   TTL = code lifetime
 *   otp:lock:{phone}    STRING  epoch-millis the lock lifts   TTL = lock duration
 *   otp:sends:{phone}   ZSET  send timestamps, scored by time TTL = 24h + slack
 * </pre>
 *
 * ── What this buys over the table ─────────────────────────────────────────────
 *
 * Expiry stops being somebody's job. `V1__init_schema.sql` says `otp_request` is
 * "cleaned up by a scheduled job" and no such job was ever written, so the table
 * has been growing since the first sign-in. A TTL cannot be forgotten.
 *
 * And {@code HINCRBY} makes the wrong-attempt counter atomic, which closes
 * SEC-OTP-06 — two verifies can no longer both read `2`, both write `3`, and
 * quietly hand somebody a fourth guess at a six-digit code.
 *
 * ── Why the sends are a sorted set ────────────────────────────────────────────
 *
 * The daily ceiling is a ROLLING window that also has to answer "try again in
 * how long" — the count drops the moment the oldest send ages out. A counter
 * with a TTL gives a fixed window and cannot answer the second half at all. A
 * ZSET scored by timestamp answers both: {@code ZCOUNT} for the count,
 * {@code ZRANGE 0 0} for the oldest, {@code ZREMRANGEBYSCORE} to forget what has
 * aged out. That is the same behaviour the SQL `MIN`/`COUNT` gave, kept exactly.
 *
 * ── On durability ─────────────────────────────────────────────────────────────
 *
 * Everything here except the code itself is an abuse control, so this Redis
 * needs AOF on. A lock that a restart clears is the bug V17 was written to fix;
 * see {@code RedisConfig} and the `--appendonly yes` in docker-compose.
 */
@Component
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class RedisOtpStore implements OtpStore {

    private final StringRedisTemplate redis;

    private static final String HASH = "hash";
    private static final String EXPIRES = "expiresAt";
    private static final String ATTEMPTS = "attempts";

    /** Kept a little past the rolling day so the window is never short of history. */
    private static final Duration SENDS_RETENTION = Duration.ofHours(25);

    private static String codeKey(String phone)  { return "otp:code:"  + phone; }
    private static String lockKey(String phone)  { return "otp:lock:"  + phone; }
    private static String sendsKey(String phone) { return "otp:sends:" + phone; }

    @Override
    public void saveCode(String phone, String hash, Instant expiresAt) {
        String key = codeKey(phone);
        redis.delete(key);
        redis.opsForHash().putAll(key, Map.of(
                HASH, hash,
                EXPIRES, Long.toString(expiresAt.toEpochMilli()),
                ATTEMPTS, "0"));
        redis.expireAt(key, expiresAt);
    }

    @Override
    public Optional<Code> activeCode(String phone) {
        var entries = redis.<String, String>opsForHash().entries(codeKey(phone));
        if (entries == null || entries.isEmpty()) return Optional.empty();

        String hash = entries.get(HASH);
        String expires = entries.get(EXPIRES);
        if (hash == null || expires == null) return Optional.empty();

        return Optional.of(new Code(
                hash,
                Instant.ofEpochMilli(Long.parseLong(expires)),
                parseInt(entries.get(ATTEMPTS))));
    }

    /** {@code HINCRBY} — the whole reason this is worth doing (SEC-OTP-06). */
    @Override
    public int recordWrongAttempt(String phone) {
        Long next = redis.opsForHash().increment(codeKey(phone), ATTEMPTS, 1L);
        return next == null ? 0 : next.intValue();
    }

    @Override
    public void consume(String phone) {
        redis.delete(codeKey(phone));
    }

    @Override
    public void lock(String phone, Instant until) {
        Duration ttl = Duration.between(Instant.now(), until);
        if (ttl.isNegative() || ttl.isZero()) return;
        redis.opsForValue().set(lockKey(phone), Long.toString(until.toEpochMilli()), ttl);
        redis.delete(codeKey(phone));
    }

    @Override
    public Instant lockedUntil(String phone) {
        String raw = redis.opsForValue().get(lockKey(phone));
        return raw == null ? null : Instant.ofEpochMilli(Long.parseLong(raw));
    }

    /* ------------------------------------------------------------ send window */

    @Override
    public void recordSend(String phone, Instant at) {
        String key = sendsKey(phone);
        double score = at.toEpochMilli();
        redis.opsForZSet().add(key, at.toEpochMilli() + ":" + java.util.UUID.randomUUID(), score);
        trim(key, at.minus(SENDS_RETENTION));
        redis.expire(key, SENDS_RETENTION);
    }

    @Override
    public long countSendsSince(String phone, Instant since) {
        Long n = redis.opsForZSet().count(sendsKey(phone), since.toEpochMilli(), Double.MAX_VALUE);
        return n == null ? 0L : n;
    }

    @Override
    public Instant lastSentAt(String phone) {
        Set<org.springframework.data.redis.core.ZSetOperations.TypedTuple<String>> top =
                redis.opsForZSet().reverseRangeWithScores(sendsKey(phone), 0, 0);
        return firstScore(top);
    }

    @Override
    public Instant oldestSendSince(String phone, Instant since) {
        var range = redis.opsForZSet().rangeByScoreWithScores(
                sendsKey(phone), since.toEpochMilli(), Double.MAX_VALUE, 0, 1);
        return firstScore(range);
    }

    @Override
    public boolean available() {
        try {
            // PING rather than a real read: it costs nothing and answers exactly
            // the question the delegating store is asking.
            return redis.getConnectionFactory() != null
                    && "PONG".equalsIgnoreCase(
                            redis.execute((org.springframework.data.redis.connection.RedisConnection c) ->
                                    c.ping()));
        } catch (RuntimeException e) {
            return false;
        }
    }

    /* ----------------------------------------------------------------- detail */

    private void trim(String key, Instant before) {
        redis.opsForZSet().removeRangeByScore(key, 0, before.toEpochMilli());
    }

    private static Instant firstScore(
            Set<org.springframework.data.redis.core.ZSetOperations.TypedTuple<String>> tuples) {
        if (tuples == null || tuples.isEmpty()) return null;
        var first = tuples.iterator().next();
        Double score = first.getScore();
        return score == null ? null : Instant.ofEpochMilli(score.longValue());
    }

    private static int parseInt(String raw) {
        try {
            return raw == null ? 0 : Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
