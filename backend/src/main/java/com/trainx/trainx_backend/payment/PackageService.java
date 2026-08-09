package com.trainx.trainx_backend.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class PackageService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record PackageResponse(
            String id,
            String clientId,
            String type,
            Integer sessionsTotal,
            Integer sessionsRemaining,
            BigDecimal amount,
            String currency,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt
    ) {}

    public record CreatePackageRequest(
            @NotBlank String type,
            Integer sessionsTotal,
            @NotNull BigDecimal amount,
            String startDate,
            String endDate
    ) {}

    public record PaymentResponse(
            String id,
            String clientId,
            String packageId,
            BigDecimal amount,
            String currency,
            String method,
            String collectedBy,
            String status,
            String upiReference,
            Long paidAt,
            long createdAt,
            long updatedAt
    ) {}

    public record CreatePaymentRequest(
            @NotNull BigDecimal amount,
            @NotBlank String method,
            @NotBlank String collectedBy
    ) {}

    public record ConfirmPaymentRequest(String upiReference) {}

    // ── Packages ──────────────────────────────────────────────────────────────

    public List<PackageResponse> listPackages(UUID trainerId, String clientId) {
        requireClientOwnership(clientId, trainerId.toString());
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text, type, sessions_total, sessions_remaining,
                       amount, currency, start_date::text, end_date::text, status, created_at, updated_at
                FROM package
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY created_at DESC
                """, Map.of("cid", clientId, "tid", trainerId.toString()));
        return rows.stream().map(this::toPackageResponse).toList();
    }

    @Transactional
    public PackageResponse createPackage(UUID trainerId, String clientId, CreatePackageRequest req) {
        requireClientOwnership(clientId, trainerId.toString());

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        int sessionsRemaining = req.type().equals("session_pack") && req.sessionsTotal() != null
                ? req.sessionsTotal() : 0;

        var p = new HashMap<String, Object>();
        p.put("id",                id.toString());
        p.put("tid",               trainerId.toString());
        p.put("cid",               clientId);
        p.put("type",              req.type());
        p.put("sessionsTotal",     req.sessionsTotal());
        p.put("sessionsRemaining", sessionsRemaining);
        p.put("amount",            req.amount());
        p.put("currency",          "INR");
        p.put("startDate",         req.startDate() != null ? java.sql.Date.valueOf(req.startDate()) : null);
        p.put("endDate",           req.endDate() != null ? java.sql.Date.valueOf(req.endDate()) : null);
        p.put("now",               Timestamp.from(now));

        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                    amount, currency, start_date, end_date, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :type, :sessionsTotal, :sessionsRemaining,
                    :amount, :currency, :startDate, :endDate, 'active', :now, :now)
                """, p);

        return new PackageResponse(id.toString(), clientId, req.type(), req.sessionsTotal(), sessionsRemaining,
                req.amount(), "INR", req.startDate(), req.endDate(), "active",
                now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Payments ──────────────────────────────────────────────────────────────

    public List<PaymentResponse> listPayments(UUID trainerId, String packageId) {
        requirePackageOwnership(packageId, trainerId.toString());
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text, package_id::text, amount, currency, method,
                       collected_by, status, upi_reference, paid_at, created_at, updated_at
                FROM payment
                WHERE package_id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY created_at DESC
                """, Map.of("pid", packageId, "tid", trainerId.toString()));
        return rows.stream().map(this::toPaymentResponse).toList();
    }

    @Transactional
    public PaymentResponse createPayment(UUID trainerId, String packageId, CreatePaymentRequest req) {
        var pkg = requirePackageOwnership(packageId, trainerId.toString());
        String clientId = str(pkg.get("client_id"));

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",          id.toString());
        p.put("tid",         trainerId.toString());
        p.put("cid",         clientId);
        p.put("pkgId",       packageId);
        p.put("amount",      req.amount());
        p.put("currency",    "INR");
        p.put("method",      req.method());
        p.put("collectedBy", req.collectedBy());
        p.put("now",         Timestamp.from(now));

        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency,
                    method, collected_by, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pkgId::uuid, :amount, :currency,
                    :method, :collectedBy, 'pending', :now, :now)
                """, p);

        return new PaymentResponse(id.toString(), clientId, packageId, req.amount(), "INR",
                req.method(), req.collectedBy(), "pending", null, null,
                now.toEpochMilli(), now.toEpochMilli());
    }

    @Transactional
    public PaymentResponse confirmPayment(UUID trainerId, String paymentId, ConfirmPaymentRequest req) {
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text, package_id::text FROM payment
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", paymentId, "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found");

        Instant now = Instant.now();
        jdbc.update("""
                UPDATE payment SET status = 'paid', paid_at = :now, upi_reference = :ref, updated_at = :now
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", paymentId, "tid", trainerId.toString(),
                            "now", Timestamp.from(now), "ref", req.upiReference() != null ? req.upiReference() : ""));

        var updated = jdbc.queryForList("""
                SELECT id::text, client_id::text, package_id::text, amount, currency, method,
                       collected_by, status, upi_reference, paid_at, created_at, updated_at
                FROM payment WHERE id = :id::uuid
                """, Map.of("id", paymentId));
        return toPaymentResponse(updated.get(0));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void requireClientOwnership(String clientId, String tid) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", clientId, "tid", tid), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
    }

    private Map<String, Object> requirePackageOwnership(String packageId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text FROM package
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packageId, "tid", tid));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Package not found");
        return rows.get(0);
    }

    private PackageResponse toPackageResponse(Map<String, Object> r) {
        Object st = r.get("sessions_total");
        Object sr = r.get("sessions_remaining");
        return new PackageResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("type")),
                st != null ? Integer.parseInt(st.toString()) : null,
                sr != null ? Integer.parseInt(sr.toString()) : null,
                toDecimal(r.get("amount")),
                str(r.get("currency")),
                str(r.get("start_date")),
                str(r.get("end_date")),
                str(r.get("status")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private PaymentResponse toPaymentResponse(Map<String, Object> r) {
        Object pa = r.get("paid_at");
        Long paidAt = pa instanceof java.sql.Timestamp ts ? ts.toInstant().toEpochMilli()
                    : pa instanceof java.time.OffsetDateTime odt ? odt.toInstant().toEpochMilli() : null;
        return new PaymentResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("package_id")),
                toDecimal(r.get("amount")),
                str(r.get("currency")),
                str(r.get("method")),
                str(r.get("collected_by")),
                str(r.get("status")),
                str(r.get("upi_reference")),
                paidAt,
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private BigDecimal toDecimal(Object v) {
        if (v instanceof BigDecimal bd) return bd;
        return v != null ? new BigDecimal(v.toString()) : null;
    }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}
