package com.inclineyou.inclineyou_backend.ratelimit;

import com.inclineyou.inclineyou_backend.config.AppProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The bucket arithmetic.
 *
 * Worth pinning down for the same reason the OTP ladder was: whether the last
 * token is spendable, and what wait a refusal quotes, are both off-by-one
 * candidates — and this one sits in front of every endpoint in the product, so
 * getting it wrong is either no limit at all or an outage.
 */
class RateLimiterTest {

    private final RateLimiter limiter = new RateLimiter();

    private static AppProperties.Tier tier(int limit, int windowSeconds) {
        return new AppProperties.Tier(limit, windowSeconds);
    }

    @Test
    @DisplayName("spends exactly `limit` requests, then refuses")
    void spendsTheBudgetThenRefuses() {
        var t = tier(5, 60);

        for (int i = 1; i <= 5; i++) {
            assertThat(limiter.take("a", t).allowed())
                    .withFailMessage("request %d of 5 should be allowed", i)
                    .isTrue();
        }

        var refused = limiter.take("a", t);
        assertThat(refused.allowed()).isFalse();
        // 5 per minute is a token every 12 seconds, so that is the wait quoted.
        assertThat(refused.retryAfterSeconds()).isEqualTo(12);
    }

    @Test
    @DisplayName("a refusal never quotes a zero-second wait")
    void neverQuotesZero() {
        // 600 per minute is ten a second: the honest wait is a tenth of a second,
        // and "retry after 0" reads as "retry now", which is what was just refused.
        var t = tier(600, 60);
        for (int i = 0; i < 600; i++) limiter.take("b", t);

        var refused = limiter.take("b", t);
        assertThat(refused.allowed()).isFalse();
        assertThat(refused.retryAfterSeconds()).isEqualTo(1);
    }

    @Test
    @DisplayName("refills smoothly, so a fresh window is not a fresh budget")
    void refillsOverTime() throws InterruptedException {
        var t = tier(5, 1); // five a second
        for (int i = 0; i < 5; i++) limiter.take("c", t);
        assertThat(limiter.take("c", t).allowed()).isFalse();

        Thread.sleep(400); // ~2 tokens back

        assertThat(limiter.take("c", t).allowed()).isTrue();
        assertThat(limiter.take("c", t).allowed()).isTrue();
        assertThat(limiter.take("c", t).allowed()).isFalse();
    }

    @Test
    @DisplayName("one caller's budget is not another's")
    void keysAreIndependent() {
        var t = tier(2, 60);
        limiter.take("trainer-1", t);
        limiter.take("trainer-1", t);
        assertThat(limiter.take("trainer-1", t).allowed()).isFalse();

        assertThat(limiter.take("trainer-2", t).allowed()).isTrue();
    }

    @Test
    @DisplayName("the same caller is counted separately per tier")
    void tiersAreSeparateBuckets() {
        var t = tier(1, 60);
        assertThat(limiter.take("SYNC|trainer-1", t).allowed()).isTrue();
        assertThat(limiter.take("SYNC|trainer-1", t).allowed()).isFalse();
        // Spending the sync budget must not close the door on everything else.
        assertThat(limiter.take("STANDARD|trainer-1", t).allowed()).isTrue();
    }

    @Test
    @DisplayName("a limit of zero or less switches the tier off rather than blocking it")
    void zeroLimitMeansUnlimited() {
        var off = tier(0, 60);
        for (int i = 0; i < 50; i++) {
            assertThat(limiter.take("d", off).allowed()).isTrue();
        }
    }

    @Test
    @DisplayName("reset forgets every bucket")
    void resetClears() {
        var t = tier(1, 60);
        limiter.take("e", t);
        assertThat(limiter.take("e", t).allowed()).isFalse();

        limiter.reset();
        assertThat(limiter.take("e", t).allowed()).isTrue();
    }
}
