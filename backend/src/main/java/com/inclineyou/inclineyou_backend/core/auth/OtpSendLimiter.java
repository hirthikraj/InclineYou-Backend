package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.infrastructure.ratelimit.Bucket4jLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * How many codes one number may be sent, and how fast.
 *
 * Two limits with different jobs, and they are implemented differently because
 * they are different shapes — which is the whole note worth reading here.
 *
 * ── The daily ceiling: a token bucket (Bucket4j, in Redis) ────────────────────
 *
 * Ten codes per rolling day. This is a classic capacity limit, which is exactly
 * what a token bucket models, and putting it in Redis makes the ceiling THE
 * ceiling rather than ten-per-instance. Bucket4j also answers "how long until
 * you may try again" from the refill schedule, which is the number the screen
 * quotes.
 *
 * One behaviour change worth naming: recovery is now smooth rather than a cliff.
 * The SQL version counted rows in a rolling 24h window, so a number that burned
 * ten codes in a minute waited nearly a full day and then got all ten back. A
 * greedy-refill bucket returns one code every 2.4 hours instead. Same ceiling,
 * gentler edge, and nobody is locked out for a day by a bad afternoon.
 *
 * ── The resend ladder: NOT a token bucket ─────────────────────────────────────
 *
 * 30s, then 60s, then 120s between successive codes. A token bucket cannot
 * express this: its interval is constant by construction, and the point of a
 * ladder is that the wait GROWS with each resend. Modelling it as a bucket would
 * silently flatten it to a fixed 30s and quietly triple what a determined caller
 * can send in an hour — so it stays a direct question to the send history, which
 * {@link OtpStore} answers from a Redis sorted set or from `otp_request`.
 *
 * The first code inside a window never waits. That is somebody signing in, not
 * somebody hammering.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OtpSendLimiter {

    private final AppProperties props;
    private final OtpStore store;
    private final Bucket4jLimiter buckets;

    /**
     * @throws OtpThrottledException with the real wait, always — never a generic
     *         refusal. "Try again later" is the answer that makes people retry
     *         immediately.
     */
    public void check(String phone, Instant now) {
        var otp = props.getOtp();

        // The day's ceiling first. When both limits apply it is the longer wait, and quoting the 30-second one would be a promise the next request breaks.
        var daily = buckets.tryConsume(
                "otp:day:" + phone,
                otp.getMaxSendsPerDay(),
                Duration.ofHours(24));

        if (!daily.allowed()) {
            log.warn("OTP send refused for {}: {} in 24h", masked(phone), otp.getMaxSendsPerDay());
            throw new OtpThrottledException(daily.retryAfterSeconds());
        }

        var ladder = otp.getResendLadderSeconds();
        if (ladder == null || ladder.isEmpty()) return;

        Instant windowStart = now.minus(Duration.ofMinutes(otp.getSendWindowMinutes()));
        long sentInWindow = store.countSendsSince(phone, windowStart);
        if (sentInWindow == 0) return;

        Instant lastSent = store.lastSentAt(phone);
        if (lastSent == null) return;

        int step = (int) Math.min(sentInWindow, ladder.size()) - 1;
        Instant readyAt = lastSent.plusSeconds(ladder.get(step));
        if (readyAt.isAfter(now)) {
            throw new OtpThrottledException(secondsUntil(now, readyAt));
        }
    }

    /**
     * How long the caller must wait before asking for the next code, read right
     * after one was sent — the next rung of the ladder, which is what the
     * resend countdown draws. 0 when no ladder is configured.
     */
    public int resendAfterSeconds(String phone, Instant now) {
        var otp = props.getOtp();
        var ladder = otp.getResendLadderSeconds();
        if (ladder == null || ladder.isEmpty()) return 0;
        Instant windowStart = now.minus(Duration.ofMinutes(otp.getSendWindowMinutes()));
        long sent = Math.max(1, store.countSendsSince(phone, windowStart));
        return ladder.get((int) Math.min(sent, ladder.size()) - 1);
    }

    /** Rounded up, and never 0 — "retry after 0 seconds" reads as "retry now". */
    static int secondsUntil(Instant now, Instant when) {
        long millis = Duration.between(now, when).toMillis();
        return (int) Math.max(1, (millis + 999) / 1000);
    }

    private static String masked(String phone) {
        return phone == null || phone.length() <= 4 ? "…" : "…" + phone.substring(phone.length() - 4);
    }
}
