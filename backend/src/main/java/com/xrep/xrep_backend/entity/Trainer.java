package com.xrep.xrep_backend.entity;

import com.xrep.xrep_backend.trainer.WorkMode;
import com.xrep.xrep_backend.trainer.WorkModeConverter;
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

    /* ------------------------------------------------ identity — V33 */

    /**
     * The part of the profile a CLIENT reads. Nothing in XRep branches on any of
     * these three; they exist so the person deciding whether to accept an invite
     * can see who is asking. See V33__trainer_identity.sql.
     *
     * All three are TEXT in the database on purpose — the caps below are product
     * decisions held in {@link com.xrep.xrep_backend.trainer.TrainerService}, so
     * raising one is a line of Java rather than a migration.
     */

    /** One line under the name. Capped at 80 characters in the service. */
    @Column(columnDefinition = "text")
    private String headline;

    /** 100-200 words. Capped at 1200 characters in the service. */
    @Column(columnDefinition = "text")
    private String bio;

    /** Canonical {@code https://www.youtube.com/watch?v=<id>}, or NULL. */
    @Column(name = "intro_video_url", columnDefinition = "text")
    private String introVideoUrl;

    /* ------------------------------------------------ the gym arrangement */

    /**
     * The onboarding answer, a defaults hint only. Gym-vs-freelance stays per
     * CLIENT; see V23__trainer_work_mode.sql. The column is still plain
     * VARCHAR(20) — {@link WorkMode} only constrains what Java is allowed to
     * write and read.
     */
    @Convert(converter = WorkModeConverter.class)
    @Column(name = "work_mode", length = 20)
    private WorkMode workMode;

    /** NULL means no gym: an independent trainer keeps all of it. See V11__money.sql. */
    @Column(name = "gym_name", length = 120)
    private String gymName;

    /** What the GYM keeps, as a percentage of floor sessions. Remote is always 0%. */
    @Column(name = "gym_share_percent")
    private BigDecimal gymSharePercent;

    /* ------------------------------------------ where and how — V34 */

    /**
     * The gym or studio on a map, stored EXACTLY as pasted.
     *
     * Deliberately not canonicalised the way {@code introVideoUrl} is: a
     * YouTube link reduces to an 11-character id that is the whole fact, while
     * a maps URL carries a place id, a name, coordinates and sometimes a plus
     * code, in shapes that differ per provider and per country. The service
     * only checks that it is an http(s) URL at all — see V34.
     */
    @Column(name = "map_link", columnDefinition = "text")
    private String mapLink;

    /**
     * How the coaching is delivered — {@code gym_floor}, {@code home_visit},
     * {@code online}, {@code hybrid}, plus anything {@code custom:}-prefixed.
     *
     * NOT the same answer as {@link #workMode}, and the difference is the point:
     * that one is the money book's defaults hint (which price lists exist, who
     * collects), this one is what a client is choosing between. A trainer on a
     * gym floor may still take home visits on Sundays.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "training_modes", columnDefinition = "jsonb")
    private List<String> trainingModes = new ArrayList<>();

    /** The localities a trainer travels to. Free text — see V34 on why not a catalogue. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "service_areas", columnDefinition = "jsonb")
    private List<String> serviceAreas = new ArrayList<>();

    /* ---------------------------------------- where to look — V35 */

    /**
     * Canonical {@code https://www.instagram.com/<handle>}, or NULL.
     *
     * Canonicalised on write, unlike {@link #mapLink} one field up: a profile
     * reduces to a handle the way a video reduces to an id, while a place
     * reduces to nothing. See {@link com.xrep.xrep_backend.trainer.SocialLink}.
     */
    @Column(name = "instagram_url", columnDefinition = "text")
    private String instagramUrl;

    /**
     * Canonical {@code https://www.youtube.com/<@handle | channel/… | c/… | user/…>},
     * or NULL — a CHANNEL, not a video. {@link #introVideoUrl} is the one video
     * the trainer chose; this is everything they have posted.
     */
    @Column(name = "youtube_url", columnDefinition = "text")
    private String youtubeUrl;

    /* ------------------------------------------------ the account — V36 */

    /**
     * A contact address, and deliberately NOT a second login.
     *
     * <p>Sign-in is a phone number and a six-digit code; there is no mail
     * transport in this backend, no verification token and nothing that could
     * send one. So this is stored, shown back on the Account screen, and
     * branched on by nothing — the position {@link #bio} is in.
     *
     * <p>Not unique and not indexed on purpose. Uniqueness is a property of a
     * login, and two trainers sharing a studio inbox is not an error.
     * V36 carries the argument.
     */
    @Column(name = "email", length = 254)
    private String email;

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
