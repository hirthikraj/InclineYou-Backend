package com.xrep.xrep_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "client")
@Getter
@Setter
public class Client {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trainer_id", nullable = false)
    private UUID trainerId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 15)
    private String phone;

    @Column(columnDefinition = "text")
    private String goal;

    @Column(nullable = false, length = 20)
    private String status = "active";

    @Column(name = "payment_mode", nullable = false, length = 20)
    private String paymentMode = "trainer_collects";

    @Column(name = "trainer_split_percent", precision = 5, scale = 2)
    private BigDecimal trainerSplitPercent;

    @Column(name = "height_cm", precision = 5, scale = 1)
    private BigDecimal heightCm;

    @Column(name = "activity_level", length = 20)
    private String activityLevel;

    /**
     * 'floor' | 'remote', or null for "never said".
     *
     * Null is meaningful: a session with no mode of its own falls back to this,
     * and this falling back to floor happens in application code. Not validated
     * against a fixed set here for the same reason the statuses aren't — a third
     * mode should cost a deploy, not a migration.
     */
    @Column(name = "delivery_mode", length = 16)
    private String deliveryMode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "sessions_per_week")
    private Integer sessionsPerWeek;

    @Column(name = "session_duration_minutes")
    private Integer sessionDurationMinutes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "weekly_schedule", columnDefinition = "jsonb")
    private List<Map<String, Object>> weeklySchedule;

    /**
     * V14 · when access was paused, or null if it is not.
     *
     * `status` already says paused; this says when, which is the difference
     * between a wall and information at sign-in: "Ravi Kannan paused your
     * account on 22 July. Your history is safe." Stamped by the sync push when
     * the status flips, so an app that has never heard of this column still
     * produces the date.
     */
    @Column(name = "paused_at")
    private Instant pausedAt;

    /* ------------------------------------------------------ V18 · consent */

    /**
     * 'invited' | 'accepted' | 'declined' | 'paused' | 'removed'.
     *
     * The CLIENT's answer, kept apart from {@link #status} on purpose: that one
     * is the TRAINER's view of the arrangement (are we training, is it on hold,
     * is it over), and a single column serving both would have to answer to two
     * people who can disagree. A trainer can hold a membership they are still
     * being billed for while the client has never opened the app.
     *
     * Defaults to accepted for the same reason the column does in V18: every row
     * that predates consent is a live arrangement, and putting a wall in front of
     * somebody who has trained for months is the one outcome this must not cause.
     */
    @Column(name = "membership_status", nullable = false, length = 20)
    private String membershipStatus = "accepted";

    @Column(name = "invited_at")
    private Instant invitedAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "declined_at")
    private Instant declinedAt;

    @Column(name = "removed_at")
    private Instant removedAt;

    /**
     * When the client acknowledged the removal on their own phone.
     *
     * The row outlives the membership — the trainer's payments, packages and
     * session history all point at it — so `removed` stays true forever, and
     * without this stamp sign-in would redraw the removal notice every time.
     */
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
