package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client, UUID> {

    List<Client> findByTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID trainerId);

    Optional<Client> findByIdAndTrainerIdAndDeletedAtIsNull(UUID id, UUID trainerId);

    /**
     * Every roster this number is on, with the trainer who owns it.
     *
     * Asked on every OTP verify, because the client role is a lens over the same
     * records and the only thing that identifies a client is their phone. A
     * paused row is still a membership — that is screen 7b, which names who
     * paused it and when — but a soft-deleted one is not, which is why the
     * filter is on `deletedAt` and not on `status`.
     *
     * Note this can legitimately return more than one row: the same person can
     * train with two trainers, and each keeps their own client record. Sign-in
     * resolves a single one silently and asks only when it genuinely cannot.
     */
    @Query("""
            SELECT c.id            AS clientId,
                   c.trainerId     AS trainerId,
                   c.name          AS clientName,
                   c.status        AS status,
                   c.pausedAt      AS pausedAt,
                   t.name          AS trainerName,
                   t.gymName       AS gymName,
                   t.phone         AS trainerPhone
            FROM Client c
            JOIN Trainer t ON t.id = c.trainerId
            WHERE c.phone = :phone
              AND c.deletedAt IS NULL
              AND t.deletedAt IS NULL
            ORDER BY c.createdAt ASC
            """)
    List<Membership> findMembershipsByPhone(@Param("phone") String phone);

    /** A Spring Data projection — no DTO to keep in step with the query. */
    interface Membership {
        UUID getClientId();
        UUID getTrainerId();
        String getClientName();
        String getStatus();
        Instant getPausedAt();
        String getTrainerName();
        String getGymName();
        String getTrainerPhone();
    }
}
