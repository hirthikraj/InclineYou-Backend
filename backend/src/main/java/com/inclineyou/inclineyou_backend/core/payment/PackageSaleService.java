package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/packages} — sell a pack, off the price list or
 * custom (api-contract 1.1 Clients A7).
 *
 * <p>No "already active" guard (R71): pre-selling the next pack while the current
 * one has a session or two left is the normal case, and the charge already picks
 * between live packs. A double-tapped Sell is stopped by the client-minted id.
 *
 * <p>The stored amount is NET: {@code amount} is what the client owes, and
 * {@code discount_amount} only says why it is below the list price.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageSaleService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService reads;

    private static final Set<String> KEYS = Set.of("id", "packId", "name", "service", "basis", "sessionsTotal",
            "amount", "validityDays", "trainerSharePercent", "trainerShareAmount", "startDate", "dueDate", "discountAmount");
    private static final Set<String> SERVICES = Set.of("floor", "home_visit", "remote", "programming");

    public record Sold(PackageReadService.CurrentPackage pkg, boolean created) {}

    @Transactional
    public Sold sell(UUID trainerId, UUID clientId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("body: required");
        for (String key : body.keySet()) {
            if (!KEYS.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        UUID id = uuid(body.get("id"), "id");
        UUID packId = uuid(body.get("packId"), "packId");
        LocalDate start = date(body.get("startDate"), "startDate");
        LocalDate due = date(body.get("dueDate"), "dueDate");
        BigDecimal discount = money(body.get("discountAmount"), "discountAmount");
        BigDecimal sharePercent = number(body.get("trainerSharePercent"), "trainerSharePercent");
        BigDecimal shareAmount = money(body.get("trainerShareAmount"), "trainerShareAmount");

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        var clients = jdbc.queryForList("""
                SELECT status, client_type FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL FOR UPDATE
                """, p);
        if (clients.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        if (id != null) {
            p.put("id", id.toString());
            var owner = jdbc.queryForList("""
                    SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid) AS mine FROM package WHERE id = :id::uuid
                    """, p);
            if (!owner.isEmpty()) {
                if (!Boolean.TRUE.equals(owner.getFirst().get("mine"))) throw ApiException.idConflict();
                return new Sold(reads.one(trainerId, id).orElseThrow(ApiException::idConflict), false);
            }
        }
        var client = clients.getFirst();
        if ("archived".equals(client.get("status"))) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        boolean gymClient = "gym".equals(client.get("client_type"));

        String name, service, basis, currency, owner;
        Integer sessions, validity;
        BigDecimal listPrice;
        if (packId != null) {
            // The pack's terms win over anything sent, except the trainer's share (R3).
            p.put("pk", packId.toString());
            var packs = jdbc.queryForList("""
                    SELECT name, service, basis, sessions, validity_days, amount, currency, owner, status,
                           trainer_share_percent, trainer_share_amount
                    FROM pack WHERE id = :pk::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, p);
            if (packs.isEmpty()) throw ApiException.notFound("That pack is not on your price list.");
            var pack = packs.getFirst();
            if (!"active".equals(pack.get("status"))) {
                throw ApiException.conflict("PACK_INACTIVE", "That pack was archived since the sheet opened.");
            }
            name = (String) pack.get("name");
            service = (String) pack.get("service");
            basis = (String) pack.get("basis");
            sessions = (Integer) pack.get("sessions");
            validity = (Integer) pack.get("validity_days");
            listPrice = (BigDecimal) pack.get("amount");
            currency = (String) pack.get("currency");
            owner = (String) pack.get("owner");
            if (sharePercent == null && shareAmount == null) {
                sharePercent = (BigDecimal) pack.get("trainer_share_percent");
                shareAmount = (BigDecimal) pack.get("trainer_share_amount");
            }
        } else {
            if (!(body.get("name") instanceof String n) || n.isBlank() || n.strip().length() > 80) {
                throw ApiException.validation("name: required, at most 80 characters");
            }
            name = n.strip();
            if (!(body.get("service") instanceof String sv) || !SERVICES.contains(sv)) {
                throw ApiException.validation("service: floor, home_visit, remote or programming");
            }
            service = sv;
            if (!(body.get("basis") instanceof String b) || !Set.of("sessions", "period").contains(b)) {
                throw ApiException.validation("basis: sessions or period");
            }
            basis = b;
            sessions = whole(body.get("sessionsTotal"), 1, 500, "sessionsTotal");
            if ("sessions".equals(basis) != (sessions != null)) {
                throw ApiException.validation("sessionsTotal: required for basis sessions, and only for it");
            }
            if ("programming".equals(service) && !"period".equals(basis)) {
                throw ApiException.validation("basis: programming is sold by period");
            }
            validity = whole(body.get("validityDays"), 1, 730, "validityDays");
            listPrice = money(body.get("amount"), "amount");
            if (listPrice == null) throw ApiException.validation("amount: required");
            currency = reads.workspaceCurrency();
            // A custom sale has no pack, so the owner follows the client (check_package_client_type).
            owner = gymClient ? "gym" : "trainer";
        }

        if (gymClient != "gym".equals(owner)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACK_OWNER_MISMATCH",
                    gymClient ? "A gym client buys the gym's packs." : "This client buys your own packs, not the gym's.");
        }
        if (discount != null && discount.compareTo(listPrice) > 0) {
            throw ApiException.validation("discountAmount: more than the price");
        }
        BigDecimal amount = discount == null ? listPrice : listPrice.subtract(discount);
        if (sharePercent != null && shareAmount != null) {
            throw ApiException.validation("trainerSharePercent: send a percent or an amount, not both");
        }
        boolean share = sharePercent != null || shareAmount != null;
        if (share && !"floor".equals(service)) throw ApiException.validation("trainerSharePercent: floor service only");
        if (gymClient && !share) throw ApiException.validation("trainerSharePercent: a gym client's pack carries your share");
        if (!gymClient && share) throw ApiException.validation("trainerSharePercent: only on a gym client's pack");
        if (sharePercent != null && (sharePercent.signum() < 0 || sharePercent.compareTo(BigDecimal.valueOf(100)) > 0)) {
            throw ApiException.validation("trainerSharePercent: between 0 and 100");
        }
        if (shareAmount != null && shareAmount.compareTo(amount) > 0) {
            throw ApiException.validation("trainerShareAmount: above the price");
        }

        LocalDate from = start != null ? start : WorkspaceClock.today(clock.zone());
        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("packId", packId == null ? null : packId.toString());
        p.put("name", name);
        p.put("service", service);
        p.put("basis", basis);
        p.put("sessions", sessions);
        p.put("amount", amount);
        p.put("discount", discount);
        p.put("currency", currency);
        p.put("start", Date.valueOf(from));
        p.put("end", validity == null ? null : Date.valueOf(from.plusDays(validity)));
        p.put("due", Date.valueOf(due != null ? due : from));
        p.put("sharePercent", sharePercent);
        p.put("shareAmount", shareAmount);
        int inserted = jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, discount_amount, currency, start_date, end_date, due_date,
                                     trainer_share_percent, trainer_share_amount)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :packId::uuid, :name, :service, :basis, :sessions,
                        :sessions, :amount, :discount, :currency, :start, :end, :due, :sharePercent, :shareAmount)
                ON CONFLICT (id) DO NOTHING
                """, p);
        // Nothing inserted: the id belongs to a row this trainer cannot see.
        if (inserted == 0) throw ApiException.idConflict();
        UUID made = UUID.fromString((String) p.get("id"));
        log.info("package sold trainer={} client={} package={} fromPack={}", trainerId, clientId, made, packId != null);
        return new Sold(reads.one(trainerId, made).orElseThrow(), true);
    }

    private static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw).strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    private static LocalDate date(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation(field + ": yyyy-MM-dd");
        return WorkspaceClock.parseDate(s, field);
    }

    /** Money is a decimal string on the wire; a bare number is accepted too. Never negative. */
    private static BigDecimal money(Object raw, String field) {
        if (raw == null) return null;
        try {
            BigDecimal v = new BigDecimal(String.valueOf(raw).strip());
            if (v.signum() < 0 || v.scale() > 2 || v.compareTo(new BigDecimal("99999999.99")) > 0) throw new NumberFormatException();
            return v;
        } catch (NumberFormatException e) {
            throw ApiException.validation(field + ": a decimal amount like \"4000.00\"");
        }
    }

    private static BigDecimal number(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof Number n)) throw ApiException.validation(field + ": a number");
        return new BigDecimal(n.toString());
    }

    private static Integer whole(Object raw, int min, int max, String field) {
        if (raw == null) return null;
        if (!(raw instanceof Number n) || n.doubleValue() != n.intValue() || n.intValue() < min || n.intValue() > max) {
            throw ApiException.validation(field + ": a whole number between " + min + " and " + max);
        }
        return n.intValue();
    }
}
