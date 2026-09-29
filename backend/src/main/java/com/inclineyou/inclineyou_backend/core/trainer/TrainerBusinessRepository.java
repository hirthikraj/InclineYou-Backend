package com.inclineyou.inclineyou_backend.core.trainer;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface TrainerBusinessRepository extends JpaRepository<TrainerBusiness, UUID> {
}
