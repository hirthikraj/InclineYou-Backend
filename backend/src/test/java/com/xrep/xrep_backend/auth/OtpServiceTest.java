package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
import com.xrep.xrep_backend.entity.OtpRequest;
import com.xrep.xrep_backend.repository.OtpRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The send-rate throttle — how many codes a number may ask for.
 *
 * `maxAttempts` caps guesses at a code and has always been enforced. The other
 * direction was open: /v1/auth/otp/request would mint a code every time it was
 * asked, so fifty calls meant fifty codes. Free while SMS is stubbed, and
 * somebody else's phone buzzing all night on our bill the day it isn't.
 *
 * The arithmetic is the part worth pinning down. Which rung of the ladder a
 * request lands on, and what wait it is told, are both easy to get one off.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OtpServiceTest {

    private static final String PHONE = "9876543210";

    @Mock OtpRequestRepository otpRepo;
    @Mock BCryptPasswordEncoder bcrypt;

    AppProperties props;
    OtpService otp;

    @BeforeEach
    void setUp() {
        props = new AppProperties();
        props.getOtp().setExpiryMinutes(10);
        props.getOtp().setMaxAttempts(3);
        props.getOtp().setLockMinutes(10);
        props.getOtp().setResendLadderSeconds(List.of(30, 60, 120));
        props.getOtp().setSendWindowMinutes(60);
        props.getOtp().setMaxSendsPerDay(10);

        when(bcrypt.encode(anyString())).thenReturn("$2a$10$stub");
        otp = new OtpService(otpRepo, props, bcrypt);
    }

    /* --------------------------------------------------------- the ladder */

    @Nested
    @DisplayName("the resend ladder")
    class Ladder {

        @Test
        @DisplayName("the first code in a window goes out with no wait")
        void firstIsFree() {
            sentInWindow(0);

            assertThatCode(() -> otp.send(PHONE)).doesNotThrowAnyException();
            verify(otpRepo).save(any(OtpRequest.class));
        }

        @Test
        @DisplayName("a second code 10s after the first is refused for 20 more")
        void secondTooSoon() {
            sentInWindow(1, Instant.now().minusSeconds(10));

            assertThatThrownBy(() -> otp.send(PHONE))
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    // 30s rung minus the 10 already served. Rounded up, so 20 or 21.
                    .satisfies(s -> assertThat((int) s).isBetween(20, 21));
            verify(otpRepo, never()).save(any(OtpRequest.class));
        }

        @Test
        @DisplayName("a second code once the 30s rung is served goes out")
        void secondAfterCooldown() {
            sentInWindow(1, Instant.now().minusSeconds(31));

            assertThatCode(() -> otp.send(PHONE)).doesNotThrowAnyException();
            verify(otpRepo).save(any(OtpRequest.class));
        }

        @Test
        @DisplayName("the third code climbs to the 60s rung")
        void thirdClimbs() {
            sentInWindow(2, Instant.now().minusSeconds(31));

            assertThatThrownBy(() -> otp.send(PHONE))
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(29, 30));
        }

        @Test
        @DisplayName("the ladder clamps at its last rung rather than running off the end")
        void clampsAtLastRung() {
            // Nine sends deep, three rungs defined — the index must not walk past 2.
            sentInWindow(9, Instant.now().minusSeconds(1));

            assertThatThrownBy(() -> otp.send(PHONE))
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(118, 120));
        }

        @Test
        @DisplayName("an empty ladder switches the spacing off, leaving the day's ceiling")
        void emptyLadderIsNoSpacing() {
            props.getOtp().setResendLadderSeconds(List.of());
            sentInWindow(5, Instant.now().minusSeconds(1));

            assertThatCode(() -> otp.send(PHONE)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a send older than the window doesn't count toward the ladder")
        void windowExpires() {
            // Two sends today, none in the last hour: the ladder starts over.
            when(otpRepo.countSentSince(eq(PHONE), any(Instant.class))).thenReturn(2L, 0L);
            when(otpRepo.lastSentAt(PHONE)).thenReturn(Instant.now().minus(Duration.ofHours(3)));

            assertThatCode(() -> otp.send(PHONE)).doesNotThrowAnyException();
        }
    }

    /* ------------------------------------------------------ the day's cap */

    @Nested
    @DisplayName("the daily ceiling")
    class DailyCap {

        @Test
        @DisplayName("the eleventh code in a day is refused until the first ages out")
        void capRefuses() {
            Instant oldest = Instant.now().minus(Duration.ofHours(20));
            when(otpRepo.countSentSince(eq(PHONE), any(Instant.class))).thenReturn(10L);
            when(otpRepo.oldestSentSince(eq(PHONE), any(Instant.class))).thenReturn(oldest);

            assertThatThrownBy(() -> otp.send(PHONE))
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    // Four hours left of the oldest send's rolling day.
                    .satisfies(s -> assertThat((int) s).isBetween(4 * 3600 - 2, 4 * 3600));
            verify(otpRepo, never()).save(any(OtpRequest.class));
        }

        @Test
        @DisplayName("the ceiling is quoted ahead of the ladder — it is the longer wait")
        void capBeatsLadder() {
            // At the ceiling AND one second past a send: the answer must be hours,
            // not the 120s rung, or the next request contradicts this one.
            when(otpRepo.countSentSince(eq(PHONE), any(Instant.class))).thenReturn(10L);
            when(otpRepo.oldestSentSince(eq(PHONE), any(Instant.class)))
                    .thenReturn(Instant.now().minus(Duration.ofHours(1)));
            when(otpRepo.lastSentAt(PHONE)).thenReturn(Instant.now().minusSeconds(1));

            assertThatThrownBy(() -> otp.send(PHONE))
                    .isInstanceOf(OtpThrottledException.class)
                    .extracting(e -> ((OtpThrottledException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isGreaterThan(3600));
        }
    }

    /* ---------------------------------------------------- lock vs throttle */

    @Nested
    @DisplayName("the wrong-attempt lock")
    class Lock {

        @Test
        @DisplayName("the attempt that hits the cap stamps locked_until on the row")
        void lockIsPersisted() {
            props.getOtp().setMaxAttempts(3);
            props.getOtp().setLockMinutes(10);
            OtpRequest live = liveRequest(2); // two already spent
            when(otpRepo.findLatestUnverified(PHONE)).thenReturn(Optional.of(live));
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verify(PHONE, "000000"))
                    .isInstanceOf(OtpLockedException.class)
                    .extracting(e -> ((OtpLockedException) e).getRetryAfterSeconds())
                    .isEqualTo(600);

            // The wait and the count that caused it are one row and one save —
            // in memory this was a map entry the next deploy threw away.
            assertThat(live.getWrongAttempts()).isEqualTo(3);
            assertThat(live.getLockedUntil()).isNotNull();
            assertThat(live.getLockedUntil()).isAfter(Instant.now().plusSeconds(590));
            verify(otpRepo).save(live);
        }

        @Test
        @DisplayName("a wrong code below the cap leaves the row unlocked")
        void noLockBelowTheCap() {
            props.getOtp().setMaxAttempts(3);
            OtpRequest live = liveRequest(0);
            when(otpRepo.findLatestUnverified(PHONE)).thenReturn(Optional.of(live));
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verify(PHONE, "000000"))
                    .isInstanceOf(InvalidOtpException.class)
                    .extracting(e -> ((InvalidOtpException) e).getAttemptsLeft())
                    .isEqualTo(2);
            assertThat(live.getLockedUntil()).isNull();
        }

        @Test
        @DisplayName("a lock read from the row refuses a verify — a fresh process included")
        void storedLockRefusesVerify() {
            // Nothing in this service instance ever locked this number: the wait
            // is a column, which is the whole point of moving it there.
            when(otpRepo.lockedUntilFor(PHONE)).thenReturn(Instant.now().plusSeconds(420));

            assertThatThrownBy(() -> otp.verify(PHONE, "123456"))
                    .isInstanceOf(OtpLockedException.class)
                    .extracting(e -> ((OtpLockedException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(419, 420));
            verify(otpRepo, never()).findLatestUnverified(anyString());
        }

        @Test
        @DisplayName("a locked number is told it is locked, not throttled")
        void lockWinsOverThrottle() {
            // Both would refuse the send. Only one has a countdown screen, so the
            // lock has to be the one that answers.
            when(otpRepo.lockedUntilFor(PHONE)).thenReturn(Instant.now().plusSeconds(300));
            sentInWindow(5, Instant.now().minusSeconds(1));

            assertThatThrownBy(() -> otp.send(PHONE)).isInstanceOf(OtpLockedException.class);
            verify(otpRepo, never()).save(any(OtpRequest.class));
        }

        @Test
        @DisplayName("a lock whose time has passed needs no clearing")
        void expiredLockIsSimplyOver() {
            when(otpRepo.lockedUntilFor(PHONE)).thenReturn(Instant.now().minusSeconds(1));
            sentInWindow(0);

            assertThatCode(() -> otp.send(PHONE)).doesNotThrowAnyException();
            verify(otpRepo).save(any(OtpRequest.class));
        }

        private OtpRequest liveRequest(int spent) {
            OtpRequest r = new OtpRequest();
            r.setPhone(PHONE);
            r.setOtpHash("$2a$10$stub");
            r.setExpiresAt(Instant.now().plusSeconds(600));
            r.setWrongAttempts(spent);
            return r;
        }
    }

    /* -------------------------------------------------------------- helpers */

    /** No sends at all — every count answers 0. */
    private void sentInWindow(long count) {
        sentInWindow(count, Instant.now().minusSeconds(1));
    }

    /**
     * `count` sends inside both the window and the day, the most recent at
     * `lastSent`. Both counts answer the same number, which is true for anything
     * short of a day-long spread and keeps the daily ceiling out of the way while
     * the ladder is under test.
     */
    private void sentInWindow(long count, Instant lastSent) {
        when(otpRepo.countSentSince(eq(PHONE), any(Instant.class))).thenReturn(count);
        when(otpRepo.lastSentAt(PHONE)).thenReturn(count == 0 ? null : lastSent);
    }
}
