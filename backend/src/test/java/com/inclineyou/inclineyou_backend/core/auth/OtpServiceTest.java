package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Instant;
import java.util.UUID;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The life of one code: issued, checked, spent — or guessed at until the number
 * is locked.
 *
 * The send limits moved to {@link OtpSendLimiter} and the storage behind
 * {@link OtpStore}, so what is pinned here is the sequence and the two rules
 * that are easy to break by accident: an expired code must not spend an attempt,
 * and a lock must be read before anything else happens.
 *
 * The store is mocked, which is the point of the interface — these rules must
 * hold identically whether the state is in Redis or in Postgres.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OtpServiceTest {

    private static final String PHONE = "9876543210";
    private static final String HASH = "$2a$10$stub";

    @Mock OtpStore store;
    @Mock OtpSendLimiter limiter;
    @Mock OtpSender sender;
    @Mock OtpRequestLedger ledger;
    @Mock BCryptPasswordEncoder bcrypt;

    AppProperties props;
    OtpService otp;

    @BeforeEach
    void setUp() {
        props = new AppProperties();
        props.getOtp().setExpiryMinutes(10);
        props.getOtp().setMaxAttempts(3);
        props.getOtp().setLockMinutes(10);

        when(bcrypt.encode(anyString())).thenReturn(HASH);
        when(ledger.open(anyString(), anyString(), anyString(), any(Instant.class))).thenAnswer(inv -> {
            var r = new OtpRequest();
            r.setId(java.util.UUID.randomUUID());
            r.setPhone(inv.getArgument(0));
            r.setPurpose(inv.getArgument(1));
            r.setOtpHash(inv.getArgument(2));
            r.setExpiresAt(inv.getArgument(3));
            return r;
        });
        otp = new OtpService(store, limiter, sender, ledger, props, bcrypt);
    }

    /* ---------------------------------------------------------------- send */

    @Nested
    @DisplayName("issuing a code")
    class Send {

        @Test
        @DisplayName("the code is stored hashed and never in the clear")
        void storedHashed() {
            otp.send(PHONE, OtpRequest.SIGN_IN);

            var code = ArgumentCaptor.forClass(String.class);
            verify(store).saveCode(eq(PHONE), code.capture(), any(Instant.class));
            assertThat(code.getValue()).isEqualTo(HASH);
        }

        @Test
        @DisplayName("the send is recorded, or the ladder has nothing to count")
        void sendIsRecorded() {
            otp.send(PHONE, OtpRequest.SIGN_IN);
            verify(store).recordSend(eq(PHONE), any(Instant.class));
        }

        @Test
        @DisplayName("a throttled send costs nothing — no code, no dispatch")
        void throttledSendsNothing() {
            org.mockito.Mockito.doThrow(new OtpThrottledException(30))
                    .when(limiter).check(anyString(), any(Instant.class));

            assertThatThrownBy(() -> otp.send(PHONE, OtpRequest.SIGN_IN)).isInstanceOf(OtpThrottledException.class);

            verify(store, never()).saveCode(anyString(), anyString(), any(Instant.class));
            verify(sender, never()).send(anyString(), anyString());
        }

        @Test
        @DisplayName("a locked number is told it is locked, not throttled")
        void lockWinsOverThrottle() {
            // Both would refuse. Only one has a countdown screen, so the lock has
            // to be the one that answers — and it is checked first.
            when(store.lockedUntil(PHONE)).thenReturn(Instant.now().plusSeconds(300));

            assertThatThrownBy(() -> otp.send(PHONE, OtpRequest.SIGN_IN)).isInstanceOf(OtpLockedException.class);
            verify(store, never()).saveCode(anyString(), anyString(), any(Instant.class));
            verify(limiter, never()).check(anyString(), any(Instant.class));
        }

        @Test
        @DisplayName("a lock whose time has passed needs no clearing")
        void expiredLockIsSimplyOver() {
            when(store.lockedUntil(PHONE)).thenReturn(Instant.now().minusSeconds(1));

            assertThatCode(() -> otp.send(PHONE, OtpRequest.SIGN_IN)).doesNotThrowAnyException();
            verify(store).saveCode(eq(PHONE), anyString(), any(Instant.class));
        }
    }

    /* -------------------------------------------------------------- verify */

    @Nested
    @DisplayName("checking a code")
    class Verify {

        @Test
        @DisplayName("the right code is consumed so it cannot be replayed")
        void rightCodeIsConsumed() {
            liveCode(0);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(true);

            assertThatCode(() -> otp.verify(PHONE, "123456")).doesNotThrowAnyException();
            verify(store).consume(PHONE);
        }

        @Test
        @DisplayName("no live code reads as expired, and spends nothing")
        void noCodeIsExpired() {
            when(store.activeCode(PHONE)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> otp.verify(PHONE, "123456"))
                    .isInstanceOf(OtpExpiredException.class);
            verify(store, never()).recordWrongAttempt(anyString());
        }

        @Test
        @DisplayName("an expired code must NOT burn an attempt")
        void expiredDoesNotSpendAnAttempt() {
            when(store.activeCode(PHONE)).thenReturn(Optional.of(
                    new OtpStore.Code(HASH, Instant.now().minusSeconds(1), 0)));

            assertThatThrownBy(() -> otp.verify(PHONE, "123456"))
                    .isInstanceOf(OtpExpiredException.class);
            // The recovery is "send a new one", not "retype" — charging an
            // attempt for our own expiry is the bug this pins.
            verify(store, never()).recordWrongAttempt(anyString());
        }

        @Test
        @DisplayName("a wrong code below the cap leaves the number unlocked")
        void noLockBelowTheCap() {
            liveCode(0);
            when(store.recordWrongAttempt(PHONE)).thenReturn(1);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verify(PHONE, "000000"))
                    .isInstanceOf(InvalidOtpException.class)
                    .extracting(e -> ((InvalidOtpException) e).getAttemptsLeft())
                    .isEqualTo(2);
            verify(store, never()).lock(anyString(), any(Instant.class));
        }

        @Test
        @DisplayName("the attempt that hits the cap locks the number for the full wait")
        void lockIsPersisted() {
            liveCode(2);                                  // two already spent
            when(store.recordWrongAttempt(PHONE)).thenReturn(3);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verify(PHONE, "000000"))
                    .isInstanceOf(OtpLockedException.class)
                    .extracting(e -> ((OtpLockedException) e).getRetryAfterSeconds())
                    .isEqualTo(600);

            var until = ArgumentCaptor.forClass(Instant.class);
            verify(store).lock(eq(PHONE), until.capture());
            assertThat(until.getValue()).isAfter(Instant.now().plusSeconds(590));
        }

        @Test
        @DisplayName("the count comes from the store, not from the code we read")
        void countIsAuthoritative() {
            // SEC-OTP-06: the increment is atomic and its RETURN value decides the
            // lock. Trusting the count read a moment earlier is exactly how two
            // parallel verifies both think they were the second attempt.
            liveCode(0);
            when(store.recordWrongAttempt(PHONE)).thenReturn(3);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verify(PHONE, "000000"))
                    .isInstanceOf(OtpLockedException.class);
            verify(store).lock(eq(PHONE), any(Instant.class));
        }

        @Test
        @DisplayName("a stored lock refuses a verify — a fresh process included")
        void storedLockRefusesVerify() {
            // Nothing in this instance ever locked this number: the wait is in
            // shared state, which is the whole point of moving it out of memory.
            when(store.lockedUntil(PHONE)).thenReturn(Instant.now().plusSeconds(420));

            assertThatThrownBy(() -> otp.verify(PHONE, "123456"))
                    .isInstanceOf(OtpLockedException.class)
                    .extracting(e -> ((OtpLockedException) e).getRetryAfterSeconds())
                    .satisfies(s -> assertThat((int) s).isBetween(419, 420));
            verify(store, never()).activeCode(anyString());
        }
    }

    /* ------------------------------------------------------------ requests */

    @Nested
    @DisplayName("a code and the request it belongs to")
    class Requests {

        private final UUID id = UUID.randomUUID();

        @Test
        @DisplayName("the send answers the id, the expiry and the next rung of the ladder; the row goes queued → sent")
        void sendAnswers() {
            when(limiter.resendAfterSeconds(eq(PHONE), any(Instant.class))).thenReturn(60);

            var issued = otp.send(PHONE, OtpRequest.SIGN_IN);

            assertThat(issued.requestId()).isNotNull();
            assertThat(issued.resendAfterSeconds()).isEqualTo(60);
            assertThat(issued.expiresAt()).isAfter(Instant.now().plusSeconds(590));
            verify(ledger).open(eq(PHONE), eq(OtpRequest.SIGN_IN), eq(HASH), any(Instant.class));
            verify(ledger).sent(issued.requestId());
        }

        @Test
        @DisplayName("a sender that refuses marks the request failed, and the failure still surfaces")
        void senderFailure() {
            org.mockito.Mockito.doThrow(new UnsupportedOperationException("no provider"))
                    .when(sender).send(anyString(), anyString());

            assertThatThrownBy(() -> otp.send(PHONE, OtpRequest.SIGN_IN))
                    .isInstanceOf(UnsupportedOperationException.class);

            verify(ledger).failed(any(UUID.class), eq("provider_error"));
            verify(ledger, never()).sent(any(UUID.class));
        }

        @Test
        @DisplayName("verifying by request id answers the number it was for, and retires the request")
        void verifyRequest() {
            when(ledger.find(id)).thenReturn(Optional.of(open(OtpRequest.SIGN_IN, null)));
            liveCode(0);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(true);

            assertThat(otp.verifyRequest(id, "123456")).isEqualTo(PHONE);
            verify(ledger).consume(id);
            verify(store).consume(PHONE);
        }

        @Test
        @DisplayName("unknown, used, superseded or another purpose's request is OTP_REQUEST_NOT_FOUND")
        void notFound() {
            when(ledger.find(id)).thenReturn(Optional.empty());
            assertThatThrownBy(() -> otp.verifyRequest(id, "123456")).isInstanceOf(ApiException.class);

            when(ledger.find(id)).thenReturn(Optional.of(open(OtpRequest.SIGN_IN, Instant.now())));
            assertThatThrownBy(() -> otp.verifyRequest(id, "123456")).isInstanceOf(ApiException.class);

            when(ledger.find(id)).thenReturn(Optional.of(open(OtpRequest.CHANGE_PHONE_NEW, null)));
            assertThatThrownBy(() -> otp.verifyRequest(id, "123456")).isInstanceOf(ApiException.class);

            verify(store, never()).activeCode(anyString());
        }

        @Test
        @DisplayName("a request past its expiry is OTP_EXPIRED and spends no attempt")
        void expired() {
            var r = open(OtpRequest.SIGN_IN, null);
            r.setExpiresAt(Instant.now().minusSeconds(1));
            when(ledger.find(id)).thenReturn(Optional.of(r));
            liveCode(0);

            assertThatThrownBy(() -> otp.verifyRequest(id, "123456")).isInstanceOf(OtpExpiredException.class);
            verify(store, never()).recordWrongAttempt(anyString());
        }

        @Test
        @DisplayName("a wrong code leaves the request open for another try")
        void wrongKeepsRequestOpen() {
            when(ledger.find(id)).thenReturn(Optional.of(open(OtpRequest.SIGN_IN, null)));
            liveCode(0);
            when(store.recordWrongAttempt(PHONE)).thenReturn(1);
            when(bcrypt.matches(anyString(), anyString())).thenReturn(false);

            assertThatThrownBy(() -> otp.verifyRequest(id, "000000")).isInstanceOf(InvalidOtpException.class);
            verify(ledger, never()).consume(any(UUID.class));
        }

        @Test
        @DisplayName("delivery reads the row's status; an aged-out or retired request is not found")
        void delivery() {
            var r = open(OtpRequest.SIGN_IN, null);
            r.setDeliveryStatus("failed");
            r.setDeliveryError("provider_error");
            when(ledger.find(id)).thenReturn(Optional.of(r));

            var d = otp.delivery(id);
            assertThat(d.status()).isEqualTo("failed");
            assertThat(d.error()).isEqualTo("provider_error");

            r.setExpiresAt(Instant.now().minusSeconds(1));
            assertThatThrownBy(() -> otp.delivery(id)).isInstanceOf(ApiException.class);
        }

        private OtpRequest open(String purpose, Instant consumedAt) {
            var r = new OtpRequest();
            r.setId(id);
            r.setPhone(PHONE);
            r.setPurpose(purpose);
            r.setExpiresAt(Instant.now().plusSeconds(600));
            r.setConsumedAt(consumedAt);
            r.setDeliveryStatus("sent");
            return r;
        }
    }

    /* -------------------------------------------------------------- helpers */

    private void liveCode(int spent) {
        when(store.activeCode(PHONE)).thenReturn(Optional.of(
                new OtpStore.Code(HASH, Instant.now().plusSeconds(600), spent)));
    }
}
