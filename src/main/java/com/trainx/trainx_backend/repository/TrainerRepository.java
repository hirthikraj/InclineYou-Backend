package com.trainx.trainx_backend.repository;

import com.trainx.trainx_backend.entity.Trainer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TrainerRepository extends JpaRepository<Trainer, UUID> {
    Optional<Trainer> findByPhoneAndDeletedAtIsNull(String phone);
}
