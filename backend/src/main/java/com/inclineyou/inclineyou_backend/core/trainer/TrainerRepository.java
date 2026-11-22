package com.inclineyou.inclineyou_backend.core.trainer;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TrainerRepository extends JpaRepository<Trainer, UUID> {
    /**
     * The trainer for a sign-in identity. {@code app_user_id} is
     * {@code trainer_app_user_id_key}-unique, so every live app_user with
     * role {@code trainer} has at most one of these.
     */
    Optional<Trainer> findByAppUserIdAndDeletedAtIsNull(UUID appUserId);

    /**
     * The trainer row, locked (SELECT … FOR UPDATE) for a write that saves it (20 Nov 2026). The JPA save writes the
     * whole row — deleted_at and setup_completed_at included — so an unlocked PATCH in flight while the account was
     * deleted or setup finished wrote the old values back, and two tabs both passed the same If-Match.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Trainer t WHERE t.id = :id")
    Optional<Trainer> findByIdForUpdate(@Param("id") UUID id);
}
