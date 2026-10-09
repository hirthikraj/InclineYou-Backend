package com.inclineyou.inclineyou_backend.core.auth;

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
        guard = new OtpAbuseGuard(props, noRedis, buckets, users, store);
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
        when(store.countSendsSince(anyString(), any(Instant.class))).thenReturn(1L);
        when(buckets.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new Bucket4jLimiter.Decision(false, 600));

        assertThatCode(() -> guard.beforeSend("1.2.3.4", phone(2))).doesNotThrowAnyException();
    }
}
