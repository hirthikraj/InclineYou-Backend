package com.xrep.xrep_backend.repository;

import com.xrep.xrep_backend.entity.OtpRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpRequestRepository extends JpaRepository<OtpRequest, UUID> {

    @Query("SELECT o FROM OtpRequest o WHERE o.phone = :phone AND o.verified = false ORDER BY o.createdAt DESC LIMIT 1")
    Optional<OtpRequest> findLatestUnverified(@Param("phone") String phone);
}
