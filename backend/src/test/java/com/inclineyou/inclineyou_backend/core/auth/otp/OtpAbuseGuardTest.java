package com.inclineyou.inclineyou_backend.core.auth.otp;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.SignInBlockedException;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.infrastructure.ratelimit.Bucket4jLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The in-process path: no Redis, which is also what CI has. */
class OtpAbuseGuardTest {

    private AppProperties props;
    private AppUserRepository users;
    private OtpStore store;
    private Bucket4jLimiter buckets;
    private OtpAbuseGuard guard;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        props = new AppProperties();
        users = mock(AppUserRepository.class);
        store = mock(OtpStore.class);
        buckets = mock(Bucket4jLimiter.class);
        ObjectProvider<StringRedisTemplate> noRedis = mock(ObjectProvider.class);
        when(noRedis.getIfAvailable()).thenReturn(null);
        when(users.findByPhone(anyString())).thenReturn(Optional.empty());
        when(buckets.tryConsume(anyString(), anyLong(), any())).thenReturn(Bucket4jLimiter.Decision.ALLOWED);
        when(buckets.hasToken(anyString(), anyLong(), any())).thenReturn(true);
        guard = new OtpAbuseGuard(props, noRedis, buckets, users);
    }

    private static String phone(int n) { return "+91987654" + String.format("%04d", n); }

    @Test
    void sixthDifferentNumberFromOneIpBlocksItForADay() {
        for (int i = 1; i <= 5; i++) guard.beforeSend("1.2.3.4", phone(i));

        assertThatThrownBy(() -> guard.beforeSend("1.2.3.4", phone(6)))
                .isInstanceOf(SignInBlockedException.class)
                .extracting("retryAfterSeconds").isEqualTo(24 * 3600);
        // ...and stays blocked even for a number it already used.
        assertThatThrownBy(() -> guard.beforeSend("1.2.3.4", phone(1)))
                .isInstanceOf(SignInBlockedException.class);
        // another address is untouched
        assertThatCode(() -> guard.beforeSend("5.6.7.8", phone(1))).doesNotThrowAnyException();
    }

    @Test
    void theSameNumberAskedAgainIsNotANewStranger() {
        for (int i = 0; i < 20; i++) guard.beforeSend("1.2.3.4", phone(1));
    }

    @Test
    void fiveRefusedSendsBlockTheIp() {
        for (int i = 0; i < 5; i++) guard.strike("9.9.9.9");
        assertThatThrownBy(() -> guard.beforeSend("9.9.9.9", phone(1)))
                .isInstanceOf(SignInBlockedException.class);
    }

    @Test
    void knownNumbersNeverSpendTheNewNumberBudget() {
        when(users.findByPhone(phone(1))).thenReturn(Optional.of(mock(AppUser.class)));
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));

        assertThatCode(() -> guard.beforeSend("1.2.3.4", phone(1))).doesNotThrowAnyException();
    }

    @Test
    void anUnknownNumberIsRefusedOnceTheBudgetIsSpent() {
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));

        assertThatThrownBy(() -> guard.beforeSend("1.2.3.4", phone(2)))
                .isInstanceOf(SignInBlockedException.class)
                .extracting("code").isEqualTo(SignInBlockedException.SIGNUPS_PAUSED);
    }

    @Test
    void anUnknownNumberAlreadyAdmittedTodayDoesNotSpendTheBudgetAgain() {
        guard.beforeSend("1.2.3.4", phone(2));                    // admitted: spends one
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));

        assertThatCode(() -> guard.beforeSend("1.2.3.4", phone(2))).doesNotThrowAnyException();
    }

    /* ── sign-in: on a paused day a known and an unknown number are answered alike (8 Nov 2026) ── */

    private void budgetSpent() {
        when(buckets.hasToken(anyString(), anyLong(), any())).thenReturn(false);
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));
    }

    @Test
    void signInNeverThrowsForTheBudgetAndReportsThePauseToEveryNumberAlike() {
        when(users.findByPhone(phone(1))).thenReturn(Optional.of(mock(AppUser.class)));
        budgetSpent();

        var known = guard.beforeSignIn("1.2.3.4", phone(1));
        var unknown = guard.beforeSignIn("1.2.3.4", phone(2));

        assertThat(known.signupsPaused()).isTrue();
        assertThat(unknown.signupsPaused()).isTrue();          // the flag cannot tell them apart
        assertThat(known.deliver()).isTrue();                   // a trainer still gets in
        assertThat(unknown.deliver()).isFalse();                // a stranger gets no message
    }

    @Test
    void signInOnAnOrdinaryDayAdmitsAnUnknownNumberAndReportsNoPause() {
        var a = guard.beforeSignIn("1.2.3.4", phone(2));
        assertThat(a.deliver()).isTrue();
        assertThat(a.signupsPaused()).isFalse();
    }

    @Test
    void aNumberAnsweredWithoutAMessageIsNotAdmittedLater() {
        budgetSpent();
        assertThat(guard.beforeSignIn("1.2.3.4", phone(2)).deliver()).isFalse();
        // still spent: asking again must not slip it through as "already admitted today"
        assertThat(guard.beforeSignIn("1.2.3.4", phone(2)).deliver()).isFalse();
    }

    @Test
    void theInviteRouteStillRefusesOnAPausedDay() {
        budgetSpent();
        assertThatThrownBy(() -> guard.beforeSend("1.2.3.4", phone(3)))
                .isInstanceOf(SignInBlockedException.class)
                .extracting("code").isEqualTo(SignInBlockedException.SIGNUPS_PAUSED);
    }

    /* ── Redis switched off means off (8 Nov 2026) ── */

    @Test
    @SuppressWarnings("unchecked")
    void withRedisSwitchedOffTheGuardNeverTouchesRedisEvenIfATemplateExists() {
        // Spring Boot creates a template whenever the Redis library is present, flag or no flag.
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        ObjectProvider<StringRedisTemplate> present = mock(ObjectProvider.class);
        when(present.getIfAvailable()).thenReturn(template);
        props.getRedis().setEnabled(false);
        var offGuard = new OtpAbuseGuard(props, present, buckets, users);

        for (int i = 1; i <= 5; i++) offGuard.beforeSend("1.2.3.4", phone(i));
        offGuard.beforeSignIn("1.2.3.4", phone(5));
        offGuard.strike("1.2.3.4");
        offGuard.beforeAccountSend("trainer:a", phone(7));
        assertThatThrownBy(() -> offGuard.beforeSend("1.2.3.4", phone(6)))   // the in-process maps still count
                .isInstanceOf(SignInBlockedException.class);

        org.mockito.Mockito.verifyNoInteractions(template);
    }

    /* ── a signed-in account sending to a number not its own (phone/request) ── */

    @Test
    void anAccountMayTextThreeNewNumbersADayAndResendToThemFreely() {
        for (int i = 1; i <= 3; i++) guard.beforeAccountSend("trainer:a", phone(i));
        // resends to an admitted number are the ladder's business, not the cap's
        for (int i = 0; i < 10; i++) guard.beforeAccountSend("trainer:a", phone(2));

        assertThatThrownBy(() -> guard.beforeAccountSend("trainer:a", phone(4)))
                .isInstanceOf(OtpThrottledException.class)
                .extracting("retryAfterSeconds").satisfies(s -> assertThat((int) s).isBetween(24 * 3600 - 5, 24 * 3600));
        // still free for the three already admitted, and another account is untouched
        assertThatCode(() -> guard.beforeAccountSend("trainer:a", phone(1))).doesNotThrowAnyException();
        assertThatCode(() -> guard.beforeAccountSend("trainer:b", phone(4))).doesNotThrowAnyException();
    }

    @Test
    void anAccountSendSpendsTheNewNumberBudgetAndIsThrottledWhenItIsGone() {
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));

        assertThatThrownBy(() -> guard.beforeAccountSend("trainer:a", phone(1)))
                .isInstanceOf(OtpThrottledException.class)
                .extracting("retryAfterSeconds").isEqualTo(600);
    }

    @Test
    void anAccountSendNeverTouchesTheIpGuard() {
        for (int i = 1; i <= 3; i++) guard.beforeAccountSend("trainer:a", phone(i));
        assertThatCode(() -> guard.beforeSend("1.2.3.4", phone(9))).doesNotThrowAnyException();
    }
}
