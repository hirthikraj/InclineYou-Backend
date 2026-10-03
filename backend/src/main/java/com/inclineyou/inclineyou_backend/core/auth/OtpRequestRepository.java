package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.OtpRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.consumedAt IS NULL ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpRequest> findLatestUnverified(@Param("phone") String phone);

    /**
     * The same row, locked for update — SEC-OTP-06.
     *
     * Counting a wrong guess is read-modify-write, and under READ COMMITTED two
     * verifies landing together both read the same `wrong_attempts` and both
     * write the same increment. One guess is spent instead of two, and a burst
     * buys more than the three tries a number is allowed at a six-digit code.
     * The lock serialises them; the window it closes is small but it is the
     * window that matters most in this file.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.consumedAt IS NULL ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpRequest> findLatestUnverifiedForUpdate(@Param("phone") String phone);

    /**
     * The end of the wait this number is serving, or null if it is not serving one.
     *
     * MAX across the number's rows rather than the latest row's value: the lock
     * belongs to the phone, and the row that imposed it is not necessarily the
     * newest one by the time it is read. A value in the past is simply a lock that
     * has run out — nothing needs clearing, which is the other half of why this
     * beats a map that had to be pruned by hand.
     */
    @Query("SELECT MAX(o.lockedUntil) FROM OtpRequest o WHERE o.phone = :phone")
    Instant lockedUntilFor(@Param("phone") String phone);

    /* ── the send-rate throttle reads these three ──────────────────────────────
     * Every code ever sent to a number is already a row here, so the rate limit
     * is a question this table can answer. That is the point: a counter in memory
     * resets on deploy and is per-instance, and a send limit that a restart clears
     * is not a send limit.
     */

    /** How many codes this number has been sent since `since`. */
    @Query("SELECT COUNT(o) FROM OtpRequest o WHERE o.phone = :phone AND o.createdAt > :since")
    long countSentSince(@Param("phone") String phone, @Param("since") Instant since);

    /** When the last one went out, or null if this number has never asked. */
    @Query("SELECT MAX(o.createdAt) FROM OtpRequest o WHERE o.phone = :phone")
    Instant lastSentAt(@Param("phone") String phone);

    /**
     * The oldest send still inside the window — the moment the rolling count
     * drops by one, which is when a number at its daily ceiling is free again.
     */
    @Query("SELECT MIN(o.createdAt) FROM OtpRequest o WHERE o.phone = :phone AND o.createdAt > :since")
    Instant oldestSentSince(@Param("phone") String phone, @Param("since") Instant since);

    /**
     * A new request for a number retires every code still open on it, so only the
     * latest {@code requestId} can ever be verified (api-contract, otp/request).
     * Retired is {@code consumed_at}: the schema has one column for "this code can
     * no longer be used", and why it cannot is not a question anything asks.
     */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE OtpRequest o SET o.consumedAt = :now WHERE o.phone = :phone AND o.consumedAt IS NULL")
    int supersede(@Param("phone") String phone, @Param("now") Instant now);

    /** queued → sent, once the sender has taken the code. Any other state is left alone. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE OtpRequest o SET o.deliveryStatus = 'sent' WHERE o.id = :id AND o.deliveryStatus = 'queued'")
    int markSent(@Param("id") UUID id);

    /** The sender refused the code. The schema ties {@code delivery_error} to {@code failed}. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE OtpRequest o SET o.deliveryStatus = 'failed', o.deliveryError = :error WHERE o.id = :id")
    int markFailed(@Param("id") UUID id, @Param("error") String error);

    /** The right code was given — it must not work twice (AUTH-29). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE OtpRequest o SET o.consumedAt = :now WHERE o.id = :id AND o.consumedAt IS NULL")
    int consume(@Param("id") UUID id, @Param("now") Instant now);

    /** {@link OtpRequestSweeper}'s purge: old rows, never one whose lock is still running. */
    @Modifying
    @Transactional
    @Query(value = """
            DELETE FROM otp_request
            WHERE created_at < :cutoff
              AND (locked_until IS NULL OR locked_until < NOW())
            """, nativeQuery = true)
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
