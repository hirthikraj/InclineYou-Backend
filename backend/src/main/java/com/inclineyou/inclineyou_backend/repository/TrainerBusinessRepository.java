package com.inclineyou.inclineyou_backend.repository;

import com.inclineyou.inclineyou_backend.entity.TrainerBusiness;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface TrainerBusinessRepository extends JpaRepository<TrainerBusiness, UUID> {
}
