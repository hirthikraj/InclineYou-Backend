package com.inclineyou.inclineyou_backend.repository;

import com.inclineyou.inclineyou_backend.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client, UUID> {

    List<Client> findByTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID trainerId);

    Optional<Client> findByIdAndTrainerIdAndDeletedAtIsNull(UUID id, UUID trainerId);
}
