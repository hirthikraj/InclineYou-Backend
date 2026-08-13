package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.Trainer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TrainerRepository extends JpaRepository<Trainer, UUID> {
    Optional<Trainer> findByPhoneAndDeletedAtIsNull(String phone);
}
