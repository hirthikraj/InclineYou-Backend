package com.inclineyou.inclineyou_backend.core.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Postgres side of the OTP state — the path CI runs, where there is no
 * Redis, and the one production falls back to when Redis is down.
 *
 * <p>Deliberately not {@code @Transactional}: the store counts a wrong guess in
 * its own transaction (so the count survives the caller throwing), and a test
 * transaction holding the row uncommitted would hide the very thing under test.
 * Its rows are removed by number afterwards.
 */
@SpringBootTest
class JpaOtpStoreTest {

    @Autowired JpaOtpStore store;
    @Autowired OtpRequestLedger ledger;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private final String phone = "+9190" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM otp_request WHERE phone = :p", Map.of("p", phone));
    }

    @Test
    @DisplayName("the request row is the code: it is read back, counted against, and spent once")
    void rowIsTheCode() {
        Instant expires = Instant.now().plusSeconds(600);
        OtpRequest r = ledger.open(phone, OtpRequest.SIGN_IN, "hash-1", expires);
        store.saveCode(phone, "hash-1", expires);          // a no-op: the ledger already wrote it

        var code = store.activeCode(phone).orElseThrow();
        assertThat(code.hash()).isEqualTo("hash-1");
        assertThat(code.wrongAttempts()).isZero();

        assertThat(store.recordWrongAttempt(phone)).isEqualTo(1);
        assertThat(store.recordWrongAttempt(phone)).isEqualTo(2);
        assertThat(store.activeCode(phone).orElseThrow().wrongAttempts()).isEqualTo(2);

        store.consume(phone);
        assertThat(store.activeCode(phone)).isEmpty();
        assertThat(ledger.find(r.getId()).orElseThrow().getConsumedAt()).isNotNull();
    }

    @Test
    @DisplayName("a newer request retires the older one — only the latest code can be checked")
    void newerRequestSupersedes() {
        Instant expires = Instant.now().plusSeconds(600);
        OtpRequest first = ledger.open(phone, OtpRequest.SIGN_IN, "hash-1", expires);
        OtpRequest second = ledger.open(phone, OtpRequest.SIGN_IN, "hash-2", expires);

        assertThat(ledger.find(first.getId()).orElseThrow().getConsumedAt()).isNotNull();
        assertThat(ledger.find(second.getId()).orElseThrow().getConsumedAt()).isNull();
        assertThat(store.activeCode(phone).orElseThrow().hash()).isEqualTo("hash-2");
    }

    @Test
    @DisplayName("the send window is the rows themselves: counted, with the oldest and the latest")
    void sendWindowIsTheRows() {
        Instant expires = Instant.now().plusSeconds(600);
        ledger.open(phone, OtpRequest.SIGN_IN, "h", expires);
        ledger.open(phone, OtpRequest.SIGN_IN, "h", expires);

        Instant since = Instant.now().minusSeconds(60);
        assertThat(store.countSendsSince(phone, since)).isEqualTo(2);
        assertThat(store.lastSentAt(phone)).isNotNull();
        assertThat(store.oldestSendSince(phone, since)).isBeforeOrEqualTo(store.lastSentAt(phone));
    }

    @Test
    @DisplayName("a lock is kept on the number: stamped on the open request, or on a dead carrier row when there is none")
    void lockSurvives() {
        Instant until = Instant.now().plusSeconds(600);

        // No request open at all — the mirrored lock still lands, on a row born dead.
        store.lock(phone, until);
        assertThat(store.lockedUntil(phone)).isCloseTo(until, org.assertj.core.api.Assertions.within(1, java.time.temporal.ChronoUnit.MILLIS));
        assertThat(store.activeCode(phone)).isEmpty();

        // And a request opened afterwards does not clear it: the lock belongs to the number.
        ledger.open(phone, OtpRequest.SIGN_IN, "h", Instant.now().plusSeconds(600));
        assertThat(store.lockedUntil(phone)).isAfter(Instant.now().plusSeconds(590));
    }

    @Test
    @DisplayName("delivery moves queued → sent, or to failed with its reason")
    void deliveryStates() {
        Instant expires = Instant.now().plusSeconds(600);
        OtpRequest sent = ledger.open(phone, OtpRequest.SIGN_IN, "h", expires);
        assertThat(ledger.find(sent.getId()).orElseThrow().getDeliveryStatus()).isEqualTo("queued");
        ledger.sent(sent.getId());
        assertThat(ledger.find(sent.getId()).orElseThrow().getDeliveryStatus()).isEqualTo("sent");

        OtpRequest failed = ledger.open(phone, OtpRequest.CHANGE_PHONE_NEW, "h", expires);
        ledger.failed(failed.getId(), "provider_error");
        var row = ledger.find(failed.getId()).orElseThrow();
        assertThat(row.getDeliveryStatus()).isEqualTo("failed");
        assertThat(row.getDeliveryError()).isEqualTo("provider_error");
    }
}
