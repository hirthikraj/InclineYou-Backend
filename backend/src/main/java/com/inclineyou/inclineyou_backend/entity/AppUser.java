package com.inclineyou.inclineyou_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * One row per phone — the single authority on which half of the product a
 * number belongs to. See V18__unified_user_and_membership.sql.
 *
 * Deliberately thin, and that is the design rather than an omission. Identity
 * lives here; everything else differs by role and lives in the role's own table,
 * because a table that holds both a trainer's UPI VPA and a client's goal is a
 * table where two thirds of every row is null. Sign-in reads this and a join;
 * the profile is fetched afterwards by whichever dashboard opened.
 */
@Entity
@Table(name = "app_user")
@Getter
@Setter
public class AppUser {

    /** 'trainer' | 'client' | 'gym_admin' — strings, like every other status here. */
    public static final String ROLE_TRAINER = "trainer";
    public static final String ROLE_CLIENT = "client";
    /**
     * Reserved, not built. Nothing mints one yet and no gym table exists; the
     * value is here so that the day it does, it is a code change and not a
     * migration on a live column.
     */
    public static final String ROLE_GYM_ADMIN = "gym_admin";

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    /**
     * Nullable now — V36's account closure scrubs it on erasure
     * ({@code app_user_erased}: {@code erased_at IS NULL} iff
     * {@code phone IS NOT NULL}), and the row itself outlives that. Still
     * unique whenever it is set ({@code app_user_phone_key}), which is what
     * makes a deleted account's number stay unavailable.
     */
    @Column(length = 16)
    private String phone;

    /**
     * Exclusive by decision: a trainer's number may not also sit on a roster, so
     * this one column is the whole answer and sign-in never has to ask.
     */
    @Column(nullable = false, length = 20)
    private String role;

    /**
     * When the privacy policy was accepted. A timestamp rather than a boolean
     * because consent given is evidence, and evidence has a date.
     */
    @Column(name = "privacy_accepted_at")
    private Instant privacyAcceptedAt;

    /** Which version they accepted — paired with {@link #privacyAcceptedAt}. */
    @Column(name = "privacy_policy_version", length = 20)
    private String privacyPolicyVersion;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** Set once the number is scrubbed for good — see {@link #phone}. */
    @Column(name = "erased_at")
    private Instant erasedAt;

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
