package com.inclineyou.inclineyou_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Everything about a trainer's coaching business that a CLIENT — or a client
 * deciding whether to become one — reads. Split off {@code trainer} in the
 * 25 Sep 2026 schema rebuild so that table stays the thin identity row sign-in
 * loads on every request.
 *
 * <p>One row per trainer, keyed by {@code trainer_id} rather than its own
 * generated id, and kept alive by the {@code trg_trainer_business} trigger:
 * it is inserted the instant a {@code trainer} row is, so a lookup here is
 * always a fetch of an existing row, never a create.
 */
@Entity
@Table(name = "trainer_business")
@Getter
@Setter
public class TrainerBusiness {

    @Id
    @Column(name = "trainer_id", nullable = false)
    private java.util.UUID trainerId;

    /**
     * {@code gym_floor} | {@code home_visit} | {@code online} | {@code hybrid},
     * plus anything {@code custom:}-prefixed — what a client is choosing
     * between. See V34; not the same question as the money book's defaults.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "training_modes", columnDefinition = "jsonb")
    private List<String> trainingModes = new ArrayList<>();

    /** The localities a trainer travels to. Free text — see V34. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "service_areas", columnDefinition = "jsonb")
    private List<String> serviceAreas = new ArrayList<>();

    /** The gym or studio on a map, stored exactly as pasted — see V34. */
    @Column(name = "map_link", columnDefinition = "text")
    private String mapLink;

    /** NULL means no gym: an independent trainer keeps all of it. */
    @Column(name = "gym_name", length = 120)
    private String gymName;

    @Column(name = "upi_vpa", length = 100)
    private String upiVpa;

    /** A band id, never a number of years. */
    @Column(name = "experience_band", length = 20)
    private String experienceBand;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> certifications = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> specialities = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> languages = new ArrayList<>();

    /** One line under the name. Capped in the service, not the column. */
    @Column(columnDefinition = "text")
    private String headline;

    /** 100–200 words. Capped in the service, not the column. */
    @Column(columnDefinition = "text")
    private String bio;

    /** Canonical {@code https://www.youtube.com/watch?v=<id>}, or NULL — see V33. */
    @Column(name = "intro_video_url", columnDefinition = "text")
    private String introVideoUrl;

    /** Canonical profile URL, or NULL — see V35. */
    @Column(name = "instagram_url", columnDefinition = "text")
    private String instagramUrl;

    /** Canonical CHANNEL URL (not a video), or NULL — see V35. */
    @Column(name = "youtube_url", columnDefinition = "text")
    private String youtubeUrl;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
