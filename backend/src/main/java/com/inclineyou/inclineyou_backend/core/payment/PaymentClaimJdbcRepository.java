package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind "I've paid" (V50). Two sides: the trainer's (staff policy, plus {@code trainer_id} in every statement — RLS
 * is the backstop, not the filter) and the client's, whose only writes are the two SECURITY DEFINER doors
 * {@code client_claim_payment()} and {@code client_withdraw_payment_claim()}; a client reads its own claims through the
 * {@code payment_claim_client} policy, behind the money switch.
 */
@Repository
@RequiredArgsConstructor
public class PaymentClaimJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    private static final String COLUMNS = """
            SELECT pc.id::text AS id, pc.client_id::text AS client_id, c.name AS client_name, pc.package_id::text AS package_id,
                   k.name AS package_name, pc.amount, pc.currency, pc.paid_on::text AS paid_on, pc.reference, pc.note, pc.collector,
                   pc.status, pc.payment_id::text AS payment_id, pc.decided_at, pc.decline_reason, pc.created_at
              FROM payment_claim pc
              JOIN client c ON c.id = pc.client_id
              LEFT JOIN package k ON k.id = pc.package_id
            """;

    private static PaymentClaim row(ResultSet rs, int i) throws SQLException {
        var decided = rs.getTimestamp("decided_at");
        return new PaymentClaim(rs.getString("id"), rs.getString("client_id"), rs.getString("client_name"),
                rs.getString("package_id"), rs.getString("package_name"), rs.getBigDecimal("amount").setScale(2).toPlainString(),
                rs.getString("currency"), rs.getString("paid_on"), rs.getString("reference"), rs.getString("note"),
                rs.getString("collector"), rs.getString("status"), rs.getString("payment_id"),
                decided == null ? null : decided.getTime(), rs.getString("decline_reason"),
                rs.getTimestamp("created_at").getTime());
    }

    // ── the trainer's side ──────────────────────────────────────────────

    /**
     * This trainer's claims in one state, optionally for one client. Open ones oldest first (the queue: whoever has been
     * waiting longest), decided ones newest first.
     */
    public List<PaymentClaim> list(UUID trainerId, String status, UUID clientId, int limit) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("st", status);
        p.put("cid", clientId == null ? null : clientId.toString());
        p.put("n", limit);
        String order = "open".equals(status) ? "pc.created_at, pc.id" : "COALESCE(pc.decided_at, pc.created_at) DESC, pc.id";
        return jdbc.query(COLUMNS + """
                 WHERE pc.trainer_id = :tid::uuid AND pc.status = :st AND pc.deleted_at IS NULL
                   AND (CAST(:cid AS uuid) IS NULL OR pc.client_id = CAST(:cid AS uuid))
                 ORDER BY %s LIMIT :n""".formatted(order), p, PaymentClaimJdbcRepository::row);
    }

    public Optional<PaymentClaim> find(UUID trainerId, UUID claimId) {
        return jdbc.query(COLUMNS + " WHERE pc.id = :id::uuid AND pc.trainer_id = :tid::uuid AND pc.deleted_at IS NULL",
                Map.of("id", claimId.toString(), "tid", trainerId.toString()), PaymentClaimJdbcRepository::row).stream().findFirst();
    }

    /** The claim's row locked, so a confirm and a decline (or the client's withdraw) are serial. */
    public Optional<PaymentClaim> lock(UUID trainerId, UUID claimId) {
        var found = jdbc.queryForList("""
                SELECT id FROM payment_claim WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL FOR UPDATE
                """, Map.of("id", claimId.toString(), "tid", trainerId.toString()), UUID.class);
        return found.isEmpty() ? Optional.empty() : find(trainerId, claimId);
    }

    /** The client a package belongs to, if it is this trainer's and live. */
    public Optional<UUID> clientOfPackage(UUID trainerId, UUID packageId) {
        return jdbc.queryForList("""
                SELECT client_id FROM package WHERE id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("pid", packageId.toString(), "tid", trainerId.toString()), UUID.class).stream().findFirst();
    }

    public int confirm(UUID claimId, UUID packageId, UUID paymentId) {
        return jdbc.update("""
                UPDATE payment_claim SET status = 'confirmed', package_id = :pid::uuid, payment_id = :yid::uuid, decided_at = now()
                 WHERE id = :id::uuid AND status = 'open'
                """, Map.of("id", claimId.toString(), "pid", packageId.toString(), "yid", paymentId.toString()));
    }

    public int decline(UUID claimId, String reason) {
        var p = new HashMap<String, Object>();
        p.put("id", claimId.toString());
        p.put("why", reason);
        return jdbc.update("""
                UPDATE payment_claim SET status = 'declined', decline_reason = :why, decided_at = now()
                 WHERE id = :id::uuid AND status = 'open'
                """, p);
    }

    /** Undo of a decline: back in the queue as it was. */
    public int reopen(UUID claimId) {
        return jdbc.update("""
                UPDATE payment_claim SET status = 'open', decline_reason = NULL, decided_at = NULL
                 WHERE id = :id::uuid AND status = 'declined'
                """, Map.of("id", claimId.toString()));
    }

    /**
     * Undo of a confirm is deleting the payment it recorded (the money book's own Undo); the claim goes back to waiting, so
     * the trainer's queue and the client's screen agree with the book again.
     */
    public int reopenForPayment(UUID paymentId) {
        return jdbc.update("""
                UPDATE payment_claim SET status = 'open', payment_id = NULL, decided_at = NULL
                 WHERE payment_id = :yid::uuid AND status = 'confirmed'
                """, Map.of("yid", paymentId.toString()));
    }

    // ── the client's side ───────────────────────────────────────────────

    public JsonNode claim(UUID id, UUID clientId, UUID packageId, BigDecimal amount, LocalDate paidOn, String reference, String note) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("c", clientId.toString());
        p.put("pid", packageId == null ? null : packageId.toString());
        p.put("amt", amount);
        p.put("on", Date.valueOf(paidOn));
        p.put("ref", reference);
        p.put("note", note);
        return JSON.readTree(jdbc.queryForObject("""
                SELECT client_claim_payment(:id::uuid, :c::uuid, CAST(:pid AS uuid), :amt, :on, CAST(:ref AS varchar), CAST(:note AS varchar))::text
                """, p, String.class));
    }

    public JsonNode withdraw(UUID claimId) {
        return JSON.readTree(jdbc.queryForObject("SELECT client_withdraw_payment_claim(:id::uuid)::text",
                Map.of("id", claimId.toString()), String.class));
    }

    /** A client's own claim, through the client policy. */
    public Optional<PaymentClaim> forClient(UUID clientId, UUID claimId) {
        return jdbc.query(COLUMNS + " WHERE pc.id = :id::uuid AND pc.client_id = :c::uuid AND pc.deleted_at IS NULL",
                Map.of("id", claimId.toString(), "c", clientId.toString()), PaymentClaimJdbcRepository::row).stream().findFirst();
    }

    /** What the client's Payments screen lists: every open claim, and the ones decided in the last 30 days. Newest first. */
    public List<PaymentClaim> recentForClient(UUID clientId) {
        return jdbc.query(COLUMNS + """
                 WHERE pc.client_id = :c::uuid AND pc.deleted_at IS NULL
                   AND (pc.status = 'open' OR pc.decided_at > now() - interval '30 days')
                 ORDER BY pc.created_at DESC, pc.id LIMIT 20""", Map.of("c", clientId.toString()), PaymentClaimJdbcRepository::row);
    }

    /** {@code client_pay_terms()}: the UPI ID (never for a gym client), the part-payment switch, who collects, the gym. */
    public JsonNode terms(UUID clientId) {
        String raw = jdbc.queryForObject("SELECT client_pay_terms(:c::uuid)::text", Map.of("c", clientId.toString()), String.class);
        return raw == null ? null : JSON.readTree(raw);
    }

    /** {@code client_receipt()}: one of the client's own collected payments, with the business on it; null otherwise. */
    public JsonNode receipt(UUID paymentId) {
        String raw = jdbc.queryForObject("SELECT client_receipt(:y::uuid)::text", Map.of("y", paymentId.toString()), String.class);
        return raw == null ? null : JSON.readTree(raw);
    }
}
