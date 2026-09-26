package com.inclineyou.inclineyou_backend.repository;

import com.inclineyou.inclineyou_backend.entity.Trainer;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
