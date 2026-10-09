package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.infrastructure.ratelimit.Bucket4jLimiter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What stands between a script and Meta's daily recipient ceiling.
 *
 * The WhatsApp account is unverified, so it may message about 250 DISTINCT
 * numbers in a rolling day. {@link OtpSendLimiter} limits one number; this limits
 * the one thing it cannot see — somebody asking for many numbers.
 *
 * <ul>
 *   <li><b>An IP is blocked for a day</b> when it asks codes for more than
 *       {@code maxNumbersPerIp} different numbers in an hour, or collects
 *       {@code maxStrikesPerIp} refusals from the per-number limits.</li>
 *   <li><b>New numbers share a daily budget</b> ({@code newNumbersPerDay}). A
 *       number that already has an account is never counted, so a flood of
 *       strangers cannot spend the quota existing trainers sign in with.</li>
 * </ul>
 *
 * Deliberately NOT a blocklist of phone numbers: anyone can type a trainer's
 * number into the sign-in screen, so blocking the number would hand the attacker
 * a way to lock the real owner out for a day. The IP is what the attacker has to
 * bring themselves.
 *
 * State is Redis (AOF, so a restart does not clear a block) with an in-process map
 * underneath, the same failure stance as {@link Bucket4jLimiter}: a weaker guard
 * during an outage, never a refused sign-in.
 */
@Component
@Slf4j
public class OtpAbuseGuard {

    private final AppProperties props;
    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final Bucket4jLimiter buckets;
    private final AppUserRepository users;
    private final OtpStore store;

    /** key → value with deadline; the fallback for every Redis key below. */
    private final Map<String, Entry> memory = new ConcurrentHashMap<>();

    private record Entry(Set<String> members, long count, Instant until) {}

    public OtpAbuseGuard(AppProperties props, ObjectProvider<StringRedisTemplate> redisProvider,
                         Bucket4jLimiter buckets, AppUserRepository users, OtpStore store) {
        this.props = props;
        this.redisProvider = redisProvider;
        this.buckets = buckets;
        this.users = users;
        this.store = store;
    }

    /**
     * Call before a sign-in code is requested for a well-formed {@code phone}.
     *
     * @throws SignInBlockedException the IP is blocked, or the day's budget for new numbers is spent
     */
    public void beforeSend(String ip, String phone) {
        Instant now = Instant.now();
        var cfg = props.getOtp().getAbuse();

        Duration left = blockedFor(ip, now);
        if (left != null) {
            throw new SignInBlockedException(SignInBlockedException.BLOCKED,
                    "Too many sign-in attempts from this connection. Try again later.", left);
        }

        // A repeat ask for the same number is not a new stranger; only the number set matters here.
        long distinct = addMember("otp:ip:nums:" + ip, phone, Duration.ofMinutes(cfg.getWindowMinutes()));
        if (distinct > cfg.getMaxNumbersPerIp()) {
            block(ip, "asked codes for " + distinct + " different numbers");
            throw new SignInBlockedException(SignInBlockedException.BLOCKED,
                    "Too many sign-in attempts from this connection. Try again later.",
                    Duration.ofHours(cfg.getBlockHours()));
        }

        // Admit a new number once per day: its resends are the per-number ladder's business, not the budget's.
        boolean known = users.findByPhone(phone).isPresent();
        boolean alreadyAdmitted = store.countSendsSince(phone, now.minus(Duration.ofHours(24))) > 0;
        if (!known && !alreadyAdmitted) {
            var d = buckets.tryConsume("otp:newnumbers:day", cfg.getNewNumbersPerDay(), Duration.ofHours(24));
            if (!d.allowed()) {
                log.warn("OTP new-number budget ({}/day) is spent; refusing unknown numbers", cfg.getNewNumbersPerDay());
                throw new SignInBlockedException(SignInBlockedException.SIGNUPS_PAUSED,
                        "New sign-ups are paused for today. Please try again tomorrow.",
                        Duration.ofSeconds(d.retryAfterSeconds()));
            }
        }
    }

    /** The per-number limits refused this IP. Enough of them and it is blocked. */
    public void strike(String ip) {
        var cfg = props.getOtp().getAbuse();
        long strikes = increment("otp:ip:strikes:" + ip, Duration.ofMinutes(cfg.getWindowMinutes()));
        if (strikes >= cfg.getMaxStrikesPerIp()) block(ip, strikes + " refused sends");
    }

    /* ─────────────────────────────── state ─────────────────────────────── */

    private void block(String ip, String why) {
        Duration ttl = Duration.ofHours(props.getOtp().getAbuse().getBlockHours());
        Instant until = Instant.now().plus(ttl);
        log.warn("OTP: blocking {} for {}h — {}", ip, ttl.toHours(), why);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForValue().set("otp:ip:block:" + ip, Long.toString(until.toEpochMilli()), ttl);
                return;
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        memory.put("otp:ip:block:" + ip, new Entry(Set.of(), 0, until));
    }

    private Duration blockedFor(String ip, Instant now) {
        String key = "otp:ip:block:" + ip;
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                String v = redis.opsForValue().get(key);
                if (v != null) {
                    Duration left = Duration.between(now, Instant.ofEpochMilli(Long.parseLong(v)));
                    return left.isNegative() || left.isZero() ? null : left;
                }
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        Entry e = memory.get(key);
        if (e == null) return null;
        if (!e.until().isAfter(now)) { memory.remove(key); return null; }
        return Duration.between(now, e.until());
    }

    /** Add to a windowed set and return its size. */
    private long addMember(String key, String member, Duration window) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForSet().add(key, member);
                Long ttl = redis.getExpire(key);
                if (ttl == null || ttl < 0) redis.expire(key, window);
                Long size = redis.opsForSet().size(key);
                return size == null ? 0 : size;
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        prune();
        Instant now = Instant.now();
        return memory.compute(key, (k, old) -> {
            Set<String> members = old != null && old.until().isAfter(now) ? new HashSet<>(old.members()) : new HashSet<>();
            Instant until = old != null && old.until().isAfter(now) ? old.until() : now.plus(window);
            members.add(member);
            return new Entry(members, 0, until);
        }).members().size();
    }

    private long increment(String key, Duration window) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                Long n = redis.opsForValue().increment(key);
                if (n != null && n == 1) redis.expire(key, window);
                return n == null ? 0 : n;
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        prune();
        Instant now = Instant.now();
        return memory.compute(key, (k, old) -> {
            boolean live = old != null && old.until().isAfter(now);
            return new Entry(Set.of(), live ? old.count() + 1 : 1, live ? old.until() : now.plus(window));
        }).count();
    }

    /** Bounded: a flood of distinct IPs must not grow the fallback without limit. */
    private void prune() {
        if (memory.size() < 10_000) return;
        Instant now = Instant.now();
        memory.entrySet().removeIf(e -> !e.getValue().until().isAfter(now));
    }

    private void complain(RuntimeException e) {
        log.warn("Redis unavailable for the OTP abuse guard — using in-process state: {}", e.toString());
    }
}
