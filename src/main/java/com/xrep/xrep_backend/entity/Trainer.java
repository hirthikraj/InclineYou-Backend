package com.xrep.xrep_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "trainer")
@Getter
@Setter
public class Trainer {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, length = 15)
    private String phone;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "upi_vpa", length = 100)
    private String upiVpa;

    @Column(name = "fcm_token")
    private String fcmToken;

    /* ------------------------------------------------ trainer setup profile */

    /** A band id, never a number of years — see V8__trainer_profile.sql. */
    @Column(name = "experience_band", length = 20)
    private String experienceBand;

    /** Initialised empty, never null: an absent list and an empty one mean the same thing here. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> specialities = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> certifications = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> languages = new ArrayList<>();

    /** NULL until the trainer comes out the far side of setup. The authority on whether it is owed. */
    @Column(name = "setup_completed_at")
    private Instant setupCompletedAt;

    /* ------------------------------------------------ the gym arrangement */

    /** NULL means no gym: an independent trainer keeps all of it. See V11__money.sql. */
    @Column(name = "gym_name", length = 120)
    private String gymName;

    /** What the GYM keeps, as a percentage of floor sessions. Remote is always 0%. */
    @Column(name = "gym_share_percent")
    private BigDecimal gymSharePercent;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata = new HashMap<>();

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
