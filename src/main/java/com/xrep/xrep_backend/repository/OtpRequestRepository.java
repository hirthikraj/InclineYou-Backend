package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.OtpRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.verified = false ORDER BY o.createdAt DESC LIMIT 1")
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
    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.verified = false ORDER BY o.createdAt DESC LIMIT 1")
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
}
