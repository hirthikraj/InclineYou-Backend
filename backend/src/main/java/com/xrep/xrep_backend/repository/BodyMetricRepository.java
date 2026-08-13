package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.BodyMetric;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BodyMetricRepository extends JpaRepository<BodyMetric, UUID> {

    List<BodyMetric> findByClientIdAndDeletedAtIsNullOrderByRecordedAtDesc(UUID clientId);
}
