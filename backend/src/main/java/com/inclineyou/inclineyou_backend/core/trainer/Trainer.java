package com.inclineyou.inclineyou_backend.core.trainer;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * The trainer's identity row — who coaches, which workspace is home, and
 * whether setup is owed. Everything a CLIENT reads about them (headline, bio,
 * certifications, the gym arrangement, social links…) lives on the sibling
 * {@link TrainerBusiness} row instead, one-to-one by {@code trainer_id} and
 * kept in existence by the {@code trg_trainer_business} trigger the moment
 * this row is inserted — see the 25 Sep 2026 schema rebuild.
 *
 * <p>The phone number is deliberately not here: sign-in identity is
 * {@code app_user}, and {@link #appUserId} is the one link between "who signs
 * in" and "who coaches". A number change or an account deletion touches that
 * row, never this one.
 */
@Entity
@Table(name = "trainer")
@Getter
@Setter
public class Trainer {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** The sign-in identity this trainer row belongs to. One-to-one, unique. */
    @Column(name = "app_user_id", nullable = false)
    private UUID appUserId;

    /**
     * Never actually NULL on a live row — {@code trainer_erased_scrubbed}
     * requires a name whenever {@code erased_at} is null — but not real until
     * setup replaces the sign-up placeholder. See
     * {@link com.inclineyou.inclineyou_backend.core.auth.AuthService}'s
     * {@code displayName}.
     */
    @Column(length = 100)
    private String name;

    /** A contact address, not a login — see V36. Null means never answered. */
    @Column(length = 254)
    private String email;

    /** {@code woman} | {@code man} | {@code nonbinary} | {@code undisclosed}, or null. */
    @Column(length = 24)
    private String gender;

    @Column(nullable = false, length = 64)
    private String timezone = "Asia/Kolkata";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata = new HashMap<>();

    @Column(name = "fcm_token")
    private String fcmToken;

    /** NULL until the trainer comes out the far side of setup. The authority on whether it is owed. */
    @Column(name = "setup_completed_at")
    private Instant setupCompletedAt;

    /**
     * Where this trainer's own data lives — the workspace created for them at
     * sign-up. Read by {@code TenantScope} as the fallback for a token minted
     * before a workspace claim existed, or before the switcher moved them.
     */
    @Column(name = "home_tenant_id")
    private UUID homeTenantId;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** Set once the profile is scrubbed for good — see {@code trainer_erased_scrubbed}. */
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
