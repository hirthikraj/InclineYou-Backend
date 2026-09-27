package com.inclineyou.inclineyou_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * The v1 {@code client} row (release/proposed-schema.html).
 *
 * <p>What is NOT here any more, and where it went: the weekly rhythm
 * ({@code sessions_per_week}, {@code session_duration_minutes},
 * {@code delivery_mode}, {@code weekly_schedule}) is {@code client_schedule} and
 * {@code client_schedule_slot}; the measuring cycle is {@code assessment_schedule};
 * {@code payment_mode} and {@code trainer_split_percent} are gone — the split is
 * set per package (api-contract R3).
 *
 * <p>{@code tenant_id} is read-only here: {@code stamp_tenant_id} sets it at
 * insert and {@code freeze_tenant_id} refuses any change (TENANCY.md).
 */
@Entity
@Table(name = "client")
@Getter
@Setter
public class Client {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "tenant_id", insertable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "trainer_id", nullable = false)
    private UUID trainerId;

    @Column(length = 100)
    private String name;

    @Column(length = 16)
    private String phone;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(columnDefinition = "text")
    private String goal;

    @Column(name = "height_cm", precision = 5, scale = 1)
    private BigDecimal heightCm;

    @Column(name = "activity_level", length = 20)
    private String activityLevel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    /* ── status · client_status_dates ties each state to its timestamp ───── */

    @Column(nullable = false, length = 20)
    private String status = "active";

    @Column(name = "paused_at")
    private Instant pausedAt;

    @Column(name = "paused_until")
    private LocalDate pausedUntil;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "archive_reason", length = 20)
    private String archiveReason;

    @Column(name = "archive_note", length = 200)
    private String archiveNote;

    /** {@code independent} | {@code gym} — required by the schema (R18). */
    @Column(name = "client_type", nullable = false, length = 12)
    private String clientType = "independent";

    /* ── the portal relationship · V18 ────────────────────────────────────── */

    /**
     * Starts {@code not_invited}: v1 sends no portal invite, and
     * {@code client_membership_dates} refuses {@code accepted} without an
     * {@code accepted_at}.
     */
    @Column(name = "membership_status", nullable = false, length = 20)
    private String membershipStatus = "not_invited";

    @Column(name = "invited_at")
    private Instant invitedAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "declined_at")
    private Instant declinedAt;

    @Column(name = "removed_at")
    private Instant removedAt;

    @Column(name = "removed_ack_at")
    private Instant removedAckAt;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
