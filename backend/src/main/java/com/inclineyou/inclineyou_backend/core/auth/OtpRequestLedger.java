package com.inclineyou.inclineyou_backend.core.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The record of every code that was asked for: one {@code otp_request} row per
 * request, written whichever {@link OtpStore} holds the live state.
 *
 * <p>The row is what a {@code requestId} means. It lets the caller come back
 * with an id instead of a phone number (api-contract R93: no endpoint answers
 * questions about an arbitrary number), and it carries the delivery status the
 * "Didn't get it?" screen polls. The abuse counters (wrong attempts, the lock,
 * the send window) stay in {@link OtpStore} and stay keyed by number, so a fresh
 * request cannot reset them.
 *
 * <p>When Redis is down the Postgres store has no rows of its own to write: this
 * row is the code, with its hash, and {@link JpaOtpStore} reads it back.
 */
@Component
@RequiredArgsConstructor
public class OtpRequestLedger {

    private final OtpRequestRepository requests;

    /** Retire whatever was open on this number, then record the new request. */
    @Transactional
    public OtpRequest open(String phone, String purpose, String hash, Instant expiresAt) {
        requests.supersede(phone, Instant.now());
        OtpRequest r = new OtpRequest();
        r.setPhone(phone);
        r.setPurpose(purpose);
        r.setOtpHash(hash);
        r.setExpiresAt(expiresAt);
        r.setDeliveryStatus("queued");
        return requests.save(r);
    }

    @Transactional(readOnly = true)
    public Optional<OtpRequest> find(UUID id) {
        return requests.findById(id);
    }

    @Transactional
    public void sent(UUID id) {
        requests.markSent(id);
    }

    @Transactional
    public void failed(UUID id, String error) {
        requests.markFailed(id, error.length() <= 64 ? error : error.substring(0, 64));
    }

    @Transactional
    public void consume(UUID id) {
        requests.consume(id, Instant.now());
    }
}
