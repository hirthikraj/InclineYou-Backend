package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    Optional<AppUser> findByPhoneAndDeletedAtIsNull(String phone);

    /**
     * Everything sign-in needs, in one round trip.
     *
     * The shape is the point. Role alone does not decide the screen — a client
     * can be invited, accepted, paused or removed, and each is a different
     * destination — so a lookup that returned only {@code app_user.role} would
     * owe a second query to find out which. The joins answer both at once.
     *
     * Two LEFT JOINs, and they stay LEFT: an `app_user` row with no matching
     * trainer or client is not corrupt, it is somebody mid-flow — a client who
     * declined, a trainer whose row was soft-deleted — and an INNER JOIN would
     * turn them into "unknown number" and offer them a brand-new account.
     *
     * Ad-hoc entity joins on `phone` rather than on a mapped association,
     * because there is no FK to map: the same phone is the join key by design,
     * and adding FKs from `trainer` and `client` to `app_user` would mean
     * rewriting two live tables to introduce a column the schema law says we
     * cannot retype later.
     *
     * Rows multiply by membership — one person on two trainers' rosters is two
     * rows and one human being. That is still one round trip, and the caller
     * folds them back into a single identity with a list of rosters.
     *
     * What this deliberately does NOT select: specialities, certifications,
     * languages, UPI, goals, metadata. None of it decides a route. The dashboard
     * fetches the profile once it knows which dashboard it is.
     */
    @Query("""
            SELECT u.id                AS userId,
                   u.phone             AS phone,
                   u.role              AS role,
                   u.privacyAcceptedAt AS privacyAcceptedAt,
                   t.id                AS trainerId,
                   t.setupCompletedAt  AS setupCompletedAt,
                   t.name              AS trainerOwnName,
                   c.id                AS clientId,
                   c.trainerId         AS clientTrainerId,
                   c.name              AS clientName,
                   c.status            AS status,
                   c.membershipStatus  AS membershipStatus,
                   c.pausedAt          AS pausedAt,
                   c.removedAt         AS removedAt,
                   c.removedAckAt      AS removedAckAt,
                   ct.name             AS coachName,
                   ct.gymName          AS coachGymName,
                   ct.phone            AS coachPhone
            FROM AppUser u
            LEFT JOIN Trainer t
                   ON t.phone = u.phone
                  AND t.deletedAt IS NULL
            LEFT JOIN Client c
                   ON c.phone = u.phone
                  AND c.deletedAt IS NULL
            LEFT JOIN Trainer ct
                   ON ct.id = c.trainerId
                  AND ct.deletedAt IS NULL
            WHERE u.phone = :phone
              AND u.deletedAt IS NULL
            ORDER BY c.createdAt ASC
            """)
    List<Identity> findIdentityByPhone(@Param("phone") String phone);

    /**
     * One row of the sign-in join: the person, plus at most one of their
     * memberships. A trainer with no rosters produces exactly one row whose
     * client fields are all null.
     */
    interface Identity {
        UUID getUserId();
        /** The signed-in number itself — not to be confused with {@link #getCoachPhone()}. */
        String getPhone();
        String getRole();
        Instant getPrivacyAcceptedAt();

        /* Set only when this number owns a trainer account. */
        UUID getTrainerId();
        Instant getSetupCompletedAt();
        String getTrainerOwnName();

        /* Set only when this row carries a membership. */
        UUID getClientId();
        UUID getClientTrainerId();
        String getClientName();
        String getStatus();
        String getMembershipStatus();
        Instant getPausedAt();
        Instant getRemovedAt();
        Instant getRemovedAckAt();

        /* The coach on THIS membership — null on a row that has no membership. */
        String getCoachName();
        String getCoachGymName();
        String getCoachPhone();
    }
}
