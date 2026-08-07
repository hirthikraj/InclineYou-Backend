package com.trainx.trainx_backend.repository;

import com.trainx.trainx_backend.entity.OtpRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.verified = false ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpRequest> findLatestUnverified(@Param("phone") String phone);
}
