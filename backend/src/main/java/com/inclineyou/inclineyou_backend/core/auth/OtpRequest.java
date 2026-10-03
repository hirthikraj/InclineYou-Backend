package com.inclineyou.inclineyou_backend.core.auth;

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

    @Column(nullable = false, length = 16)
    private String phone;

    /** {@code sign_in} | {@code change_phone_old} | {@code change_phone_new} — the schema's CHECK. */
    @Column(nullable = false, length = 20)
    private String purpose;

    @Column(name = "otp_hash", nullable = false)
    private String otpHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /**
     * When the code stopped being usable: spent by a right answer, or superseded
     * by a newer request for the same number. Null is the only live state.
     */
    @Column(name = "consumed_at")
    private Instant consumedAt;

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

    /** The WhatsApp provider's id for the message, once a provider is wired. */
    @Column(name = "provider_message_id", length = 100)
    private String providerMessageId;

    /** {@code queued} | {@code sent} | {@code delivered} | {@code read} | {@code failed}. */
    @Column(name = "delivery_status", length = 12)
    private String deliveryStatus;

    /** Why delivery failed; the schema allows it only when {@code deliveryStatus} is {@code failed}. */
    @Column(name = "delivery_error", length = 64)
    private String deliveryError;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public static final String SIGN_IN = "sign_in";
    public static final String CHANGE_PHONE_OLD = "change_phone_old";
    public static final String CHANGE_PHONE_NEW = "change_phone_new";

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }
}
