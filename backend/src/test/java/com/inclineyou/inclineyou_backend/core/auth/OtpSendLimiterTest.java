package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.infrastructure.ratelimit.Bucket4jLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * How many codes a number may ask for, and how fast.
 *
 * `maxAttempts` caps guesses at a code and has always been enforced. This is the
 * other direction: /v1/auth/otp/request would mint a code every time it was
 * asked, so fifty calls meant fifty codes — free while SMS is stubbed, and
 * somebody else's phone buzzing all night on our bill the day it isn't.
 *
 * The arithmetic is the part worth pinning down. Which rung of the ladder a
 * request lands on, and what wait it is told, are both easy to get one off.
 *
 * These moved here from OtpServiceTest when the limits moved out of OtpService.
 * The daily ceiling is now a Bucket4j bucket and is mocked as one; the ladder is
 * still counted from the send history, because a token bucket cannot express a
 * wait that GROWS with each resend.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OtpSendLimiterTest {

    private static final String PHONE = "9876543210";

    @Mock OtpStore store;
    @Mock Bucket4jLimiter buckets;

    AppProperties props;
    OtpSendLimiter limiter;

    @BeforeEach
    void setUp() {
        props = new AppProperties();
        props.getOtp().setExpiryMinutes(10);
        props.getOtp().setResendLadderSeconds(List.of(30, 60, 120));
        props.getOtp().setSendWindowMinutes(60);
        props.getOtp().setMaxSendsPerDay(10);

        // Under the ceiling unless a test says otherwise.
        when(buckets.tryConsume(anyString(), anyLong(), any(Duration.class)))
                .thenReturn(Bucket4jLimiter.Decision.ALLOWED);

        limiter = new OtpSendLimiter(props, store, buckets);
    }

    private void check() {
        limiter.check(PHONE, Instant.now());
    }

    /* --------------------------------------------------------- the ladder */

    @Nested
    @DisplayName("the resend ladder")
    class Ladder {

        @Test
        @DisplayName("the first code in a window goes out with no wait")
        void firstIsFree() {
            sentInWindow(0);
            assertThatCode(OtpSendLimiterTest.this::check).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a second code 10s after the first is refused for 20 more")
        void secondTooSoon() {
            sentInWindow(1, Instant.now().minusSeconds(10));

            assertThatThrownBy(OtpSendLimiterTest.this::check)
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    // 30s rung minus the 10 already served. Rounded up, so 20 or 21.
                    .satisfies(s -> assertThat((int) s).isBetween(20, 21));
        }

        @Test
        @DisplayName("a second code once the 30s rung is served goes out")
        void secondAfterCooldown() {
            sentInWindow(1, Instant.now().minusSeconds(31));
            assertThatCode(OtpSendLimiterTest.this::check).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("the third code climbs to the 60s rung")
        void thirdClimbs() {
            sentInWindow(2, Instant.now().minusSeconds(31));

            assertThatThrownBy(OtpSendLimiterTest.this::check)
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(29, 30));
        }

        @Test
        @DisplayName("the ladder clamps at its last rung rather than running off the end")
        void clampsAtLastRung() {
            // Nine sends deep, three rungs defined — the index must not walk past 2.
            sentInWindow(9, Instant.now().minusSeconds(1));

            assertThatThrownBy(OtpSendLimiterTest.this::check)
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(118, 120));
        }

        @Test
        @DisplayName("an empty ladder switches the spacing off, leaving the day's ceiling")
        void emptyLadderIsNoSpacing() {
            props.getOtp().setResendLadderSeconds(List.of());
            sentInWindow(5, Instant.now().minusSeconds(1));

            assertThatCode(OtpSendLimiterTest.this::check).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a send older than the window doesn't count toward the ladder")
        void windowExpires() {
            when(store.countSendsSince(eq(PHONE), any(Instant.class))).thenReturn(0L);
            when(store.lastSentAt(PHONE)).thenReturn(Instant.now().minus(Duration.ofHours(3)));

            assertThatCode(OtpSendLimiterTest.this::check).doesNotThrowAnyException();
        }
    }

    /* ------------------------------------------- what the screen counts down */

    @Nested
    @DisplayName("the wait quoted right after a send")
    class NextWait {

        @Test
        @DisplayName("after the first code the next wait is the 30s rung, then 60, then 120, and it stays there")
        void climbs() {
            for (int[] sentAndWait : new int[][]{{1, 30}, {2, 60}, {3, 120}, {9, 120}}) {
                when(store.countSendsSince(eq(PHONE), any(Instant.class))).thenReturn((long) sentAndWait[0]);
                assertThat(limiter.resendAfterSeconds(PHONE, Instant.now())).isEqualTo(sentAndWait[1]);
            }
        }

        @Test
        @DisplayName("an empty ladder quotes no wait")
        void noLadder() {
            props.getOtp().setResendLadderSeconds(List.of());
            assertThat(limiter.resendAfterSeconds(PHONE, Instant.now())).isZero();
        }
    }

    /* ------------------------------------------------------ the day's cap */

    @Nested
    @DisplayName("the daily ceiling")
    class DailyCap {

        @Test
        @DisplayName("over the ceiling is refused with the bucket's own wait")
        void capRefuses() {
            // Bucket4j computes the wait from the refill schedule; the limiter's
            // job is to pass it through rather than invent one.
            when(buckets.tryConsume(eq("otp:day:" + PHONE), eq(10L), eq(Duration.ofHours(24))))
                    .thenReturn(new Bucket4jLimiter.Decision(false, 4 * 3600));
            sentInWindow(0);

            assertThatThrownBy(OtpSendLimiterTest.this::check)
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .isEqualTo(4 * 3600);
        }

        @Test
        @DisplayName("the ceiling is quoted ahead of the ladder — it is the longer wait")
        void capBeatsLadder() {
            // At the ceiling AND one second past a send: the answer must be hours,
            // not the 120s rung, or the next request contradicts this one.
            when(buckets.tryConsume(anyString(), anyLong(), any(Duration.class)))
                    .thenReturn(new Bucket4jLimiter.Decision(false, 3601));
            sentInWindow(5, Instant.now().minusSeconds(1));

            assertThatThrownBy(OtpSendLimiterTest.this::check)
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isGreaterThan(3600));

            // And the ladder was never consulted: the ceiling short-circuits.
            verify(store, never()).lastSentAt(anyString());
        }

        @Test
        @DisplayName("the ceiling is keyed per number, not globally")
        void keyedPerNumber() {
            sentInWindow(0);
            check();
            verify(buckets).tryConsume(eq("otp:day:" + PHONE), eq(10L), eq(Duration.ofHours(24)));
        }
    }

    /* -------------------------------------------------------------- helpers */

    private void sentInWindow(long count) {
        sentInWindow(count, Instant.now().minusSeconds(1));
    }

    private void sentInWindow(long count, Instant lastSent) {
        when(store.countSendsSince(eq(PHONE), any(Instant.class))).thenReturn(count);
        when(store.lastSentAt(PHONE)).thenReturn(count == 0 ? null : lastSent);
    }
}
