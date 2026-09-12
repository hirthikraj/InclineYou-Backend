package com.inclineyou.inclineyou_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "otp_request")
@Getter
@Setter
public class OtpRequest {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, length = 15)
    private String phone;

    @Column(name = "otp_hash", nullable = false)
    private String otpHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean verified;

    @Column(name = "wrong_attempts", nullable = false)
    private int wrongAttempts;

    /**
     * When the wait this row's wrong attempts bought is over. Null on all but a
     * handful of rows: it is set once, on the attempt that hits the cap.
     *
     * The lock is a property of the NUMBER, not of one code, so it is read as
     * "the furthest-future lock on this phone" — see
     * {@code OtpRequestRepository#lockedUntilFor}. It lives on the row because
     * {@code wrongAttempts} does, and because a lock in memory is a lock a deploy
     * cancels.
     */
    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }
}
