package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
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
     * Any row on this number, soft-deleted included — V36.
     *
     * <p>Deliberately unfiltered where its sibling above is not. The UNIQUE
     * index on {@code phone} does not care about {@code deleted_at}, so a
     * deleted row still occupies its number and an availability check that
     * ignored it would report the number free and then collide at flush time —
     * a 500 where a sentence belongs. It is also the honest answer: a closed
     * account keeps its number, which is what the delete confirmation promises.
     */
    Optional<AppUser> findByPhone(String phone);


    /**
     * Everything sign-in needs, in one round trip: the role, and the trainer's
     * setup state.
     *
     * <p>The trainer join stays a LEFT JOIN: an `app_user` row whose trainer was
     * soft-deleted is not corrupt, it is a number with no account, and an INNER
     * JOIN would turn it into "unknown number". Deliberately selects nothing of
     * the profile — none of it decides a route.
     */
    @Query("""
            SELECT u.phone             AS phone,
                   u.role              AS role,
                   u.privacyPolicyVersion AS privacyPolicyVersion,
                   t.id                AS trainerId,
                   t.setupCompletedAt  AS setupCompletedAt,
                   t.name              AS trainerOwnName
            FROM AppUser u
            LEFT JOIN Trainer t
                   ON t.appUserId = u.id
                  AND t.deletedAt IS NULL
            WHERE u.phone = :phone
              AND u.deletedAt IS NULL
            """)
    List<Identity> findIdentityByPhone(@Param("phone") String phone);

    /** One row of the sign-in join: the person, and their trainer account if they have one. */
    interface Identity {
        String getPhone();
        String getRole();
        /** The privacy notice version they accepted, or null. */
        String getPrivacyPolicyVersion();

        /* Set only when this number owns a trainer account. */
        UUID getTrainerId();
        Instant getSetupCompletedAt();
        String getTrainerOwnName();
    }
}
