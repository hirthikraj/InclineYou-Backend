package com.inclineyou.inclineyou_backend.core.auth.otp;

import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.SignInBlockedException;
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

    private static final String NEW_NUMBERS = "otp:newnumbers:day";

    /** key → value with deadline; the fallback for every Redis key below. */
    private final Map<String, Entry> memory = new ConcurrentHashMap<>();

    private record Entry(Set<String> members, long count, Instant until) {}

    public OtpAbuseGuard(AppProperties props, ObjectProvider<StringRedisTemplate> redisProvider,
                         Bucket4jLimiter buckets, AppUserRepository users) {
        this.props = props;
        this.redisProvider = redisProvider;
        this.buckets = buckets;
        this.users = users;
    }

    /**
     * Call before a sign-in code is requested for a well-formed {@code phone}.
     *
     * @throws SignInBlockedException the IP is blocked, or the day's budget for new numbers is spent
     */
    public void beforeSend(String ip, String phone) {
        Instant now = Instant.now();
        checkIp(ip, phone, now);
        long wait = spendNewNumberBudget(phone, now);
        if (wait > 0) {
            throw new SignInBlockedException(SignInBlockedException.SIGNUPS_PAUSED,
                    "New sign-ups are paused for today. Please try again tomorrow.",
                    Duration.ofSeconds(wait));
        }
    }

    /** What sign-in may do for a number: deliver its code or not, and the day's budget state, the same for every number. */
    public record SignInAdmission(boolean deliver, boolean signupsPaused) {
        /** A request the guard never looked at (a malformed number, refused before any send). */
        public static final SignInAdmission OPEN = new SignInAdmission(true, false);
    }

    /**
     * {@link #beforeSend} for {@code POST /v1/auth/otp/request}, where the answer must not say whether a number has an
     * account (8 Nov 2026, owner's review).
     *
     * <p>{@link #beforeSend} refuses an unknown number with {@code SIGNUPS_PAUSED} once the day's new-number budget is
     * spent, while a known number is still sent its code — so on a paused day anybody could type a number and read off
     * whether it is on InclineYou. Here the budget never throws. {@code signupsPaused} is read from the budget BEFORE
     * anything is spent, so it is one fact about the system, identical for every number asked at the same moment; and
     * an unknown number the budget cannot admit gets {@code deliver = false}: the caller goes through every step of a
     * real send except the message itself, so the answer, the resend wait and the delivery poll match a known
     * number's. Nobody learns anything they could not learn by holding the phone.
     *
     * @throws SignInBlockedException the IP is blocked (that refusal is about the caller, not the number)
     */
    public SignInAdmission beforeSignIn(String ip, String phone) {
        Instant now = Instant.now();
        checkIp(ip, phone, now);
        var cfg = props.getOtp().getAbuse();
        boolean paused = !buckets.hasToken(NEW_NUMBERS, cfg.getNewNumbersPerDay(), Duration.ofHours(24));
        if (users.findByPhone(phone).isPresent() || admittedToday(phone)) return new SignInAdmission(true, paused);
        if (paused || !buckets.tryConsume(NEW_NUMBERS, cfg.getNewNumbersPerDay(), Duration.ofHours(24)).allowed()) {
            log.warn("OTP new-number budget ({}/day) is spent; an unknown number is answered without a message", cfg.getNewNumbersPerDay());
            return new SignInAdmission(false, true);
        }
        markAdmitted(phone);
        return new SignInAdmission(true, false);
    }

    /** The per-IP half both entry points share: blocked, or one stranger too many. */
    private void checkIp(String ip, String phone, Instant now) {
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
    }

    /**
     * Call before a signed-in account has a code sent to a number that is not its own — today, a trainer's new number
     * ({@code POST /v1/trainers/me/phone/request}).
     *
     * <p>{@link #beforeSend} cannot cover this: the caller is signed in, so its address says nothing, and every target is a
     * number with no account, which is exactly what the shared budget and Meta's ~250-recipients-a-day ceiling count. Without
     * a cap, one session and a step-up ticket could send codes to thousands of strangers and leave no sign-in code
     * deliverable to anyone that day. So: {@code maxNumbersPerAccount} different numbers per account per day (a repeat to
     * one already admitted is free — that is a resend, the ladder's business), and an unknown number spends the same
     * new-number budget a sign-up does. Call it BEFORE the "is this number taken" check, so the cap also bounds how many
     * numbers an account can test for membership.
     *
     * @throws OtpThrottledException with the real wait — the refusal the phone-change screen already draws
     */
    public void beforeAccountSend(String account, String phone) {
        Instant now = Instant.now();
        var cfg = props.getOtp().getAbuse();
        long capWait = admit("otp:acct:nums:" + account, phone, Duration.ofHours(24), cfg.getMaxNumbersPerAccount());
        if (capWait > 0) {
            log.warn("OTP: account {} refused a code to a further number ({} a day)", account, cfg.getMaxNumbersPerAccount());
            throw new OtpThrottledException((int) Math.min(Integer.MAX_VALUE, capWait));
        }
        long budgetWait = spendNewNumberBudget(phone, now);
        if (budgetWait > 0) throw new OtpThrottledException((int) Math.min(Integer.MAX_VALUE, budgetWait));
    }

    /**
     * A number with no account spends one of the day's shared first codes, once per day — its resends are the per-number
     * ladder's business, not the budget's. Answers 0 when the send may go, else the seconds until the budget refills.
     */
    private long spendNewNumberBudget(String phone, Instant now) {
        var cfg = props.getOtp().getAbuse();
        if (users.findByPhone(phone).isPresent() || admittedToday(phone)) return 0;
        var d = buckets.tryConsume(NEW_NUMBERS, cfg.getNewNumbersPerDay(), Duration.ofHours(24));
        if (d.allowed()) {
            markAdmitted(phone);
            return 0;
        }
        log.warn("OTP new-number budget ({}/day) is spent; refusing unknown numbers", cfg.getNewNumbersPerDay());
        return Math.max(1, d.retryAfterSeconds());
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
        StringRedisTemplate redis = redis();
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
        StringRedisTemplate redis = redis();
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

    /**
     * Admit {@code member} to a windowed set of at most {@code max}: 0 when it is in (already, or now), else the seconds until
     * the window ends. Check-then-add, so two requests at the same instant can overshoot by one — a cap on a person's
     * phone-change attempts, not on money.
     */
    private long admit(String key, String member, Duration window, int max) {
        StringRedisTemplate redis = redis();
        if (redis != null) {
            try {
                if (Boolean.TRUE.equals(redis.opsForSet().isMember(key, member))) return 0;
                Long size = redis.opsForSet().size(key);
                if (size != null && size >= max) {
                    Long ttl = redis.getExpire(key);
                    return ttl == null || ttl <= 0 ? window.toSeconds() : ttl;
                }
                redis.opsForSet().add(key, member);
                Long ttl = redis.getExpire(key);
                if (ttl == null || ttl < 0) redis.expire(key, window);
                return 0;
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        prune();
        Instant now = Instant.now();
        long[] wait = {0};
        memory.compute(key, (k, old) -> {
            boolean live = old != null && old.until().isAfter(now);
            Set<String> members = live ? new HashSet<>(old.members()) : new HashSet<>();
            Instant until = live ? old.until() : now.plus(window);
            if (!members.contains(member)) {
                if (members.size() >= max) {
                    wait[0] = Math.max(1, Duration.between(now, until).toSeconds());
                    return new Entry(members, 0, until);
                }
                members.add(member);
            }
            return new Entry(members, 0, until);
        });
        return wait[0];
    }

    /**
     * "This unknown number has had its slot of the day's budget." A marker of its own rather than the number's send
     * history: a sign-in answered without a message (see {@link #beforeSignIn}) still records a send, so the resend
     * ladder treats it like any other, and reading the history here would admit that number for real on its next ask
     * without spending anything.
     */
    private boolean admittedToday(String phone) {
        String key = "otp:admitted:" + phone;
        StringRedisTemplate redis = redis();
        if (redis != null) {
            try {
                return Boolean.TRUE.equals(redis.hasKey(key));
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        Entry e = memory.get(key);
        return e != null && e.until().isAfter(Instant.now());
    }

    private void markAdmitted(String phone) {
        String key = "otp:admitted:" + phone;
        Duration day = Duration.ofHours(24);
        StringRedisTemplate redis = redis();
        if (redis != null) {
            try {
                redis.opsForValue().set(key, "1", day);
                return;
            } catch (RuntimeException e) {
                complain(e);
            }
        }
        prune();
        memory.put(key, new Entry(Set.of(), 1, Instant.now().plus(day)));
    }

    /** Add to a windowed set and return its size. */
    private long addMember(String key, String member, Duration window) {
        StringRedisTemplate redis = redis();
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
        StringRedisTemplate redis = redis();
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

    /**
     * The Redis template, or null when Redis is switched off ({@code app.redis.enabled=false}, {@code REDIS_ENABLED}).
     *
     * <p>The flag has to be read here, not left to the bean's existence. Unlike {@code RedisOtpStore} and
     * {@code RedisSessionStore}, which are conditional on it, this class takes Spring Boot's own auto-configured
     * template — and Spring Boot creates that whenever the Redis library is on the classpath, flag or no flag. So with
     * Redis "off" the guard still wrote to whatever answered on localhost:6379 (found 8 Nov 2026: tests run with the
     * flag off were leaving keys in the dev Redis), and with no Redis server at all every check would have waited for
     * a refused connection before falling back. Off means the in-process maps, straight away.
     */
    private StringRedisTemplate redis() {
        return props.getRedis().isEnabled() ? redisProvider.getIfAvailable() : null;
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
