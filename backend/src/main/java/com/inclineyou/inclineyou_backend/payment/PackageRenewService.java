package com.inclineyou.inclineyou_backend.payment;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * {@code POST /v1/packages/{packageId}/renew} — sell the same pack again, with
 * the terms copied here rather than sent by the browser (api-contract Today A3).
 *
 * <p>Which terms (R5, decided 26 Sep): when the old package came off a price-list
 * pack that is still active, the pack's CURRENT name, service, basis, sessions,
 * price, validity and trainer share; otherwise — a custom package, or a pack
 * since retired — the old package's own terms, its length included. A discount
 * is never copied: it was the reason for one sale, not a term of the pack.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageRenewService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService reads;

    /**
     * @param id        optional, client-generated, so a retried request returns
     *                  the package the first one made instead of selling two
     * @param startDate optional {@code yyyy-MM-dd}; defaults to today in the
     *                  workspace's calendar
     */
    public record RenewRequest(String id, String startDate) {}

    /** The new package, and whether this call made it (201) or a replay found it (200). */
    public record Renewed(PackageReadService.CurrentPackage pkg, boolean created) {}

    @Transactional
    public Renewed renew(UUID trainerId, UUID packageId, RenewRequest req) {
        RenewRequest r = req == null ? new RenewRequest(null, null) : req;
        // Input first, so a malformed request is a 400 whatever state the pack is in.
        UUID newId = parseId(r.id());
        LocalDate parsedStart = WorkspaceClock.parseDate(r.startDate(), "startDate");

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("pid", packageId.toString());

        // Fast path: a retry of a renew that already landed answers with what it
        // made. Checked again under the client lock below, because a retry racing
        // its first attempt sees no row here.
        if (newId != null) {
            p.put("newId", newId.toString());
            var replay = replay(trainerId, newId, p);
            if (replay != null) return replay;
        }
        var rows = jdbc.queryForList("""
                SELECT k.client_id::text AS client_id, k.pack_id::text AS pack_id, k.name, k.service, k.basis,
                       k.sessions_total, k.amount, k.currency, k.start_date, k.end_date,
                       k.trainer_share_percent, k.trainer_share_amount, k.created_at,
                       pk.id IS NOT NULL AS pack_live, pk.name AS pack_name, pk.service AS pack_service,
                       pk.basis AS pack_basis, pk.sessions AS pack_sessions, pk.amount AS pack_amount,
                       pk.currency AS pack_currency, pk.validity_days AS pack_validity,
                       pk.trainer_share_percent AS pack_share_percent, pk.trainer_share_amount AS pack_share_amount
                FROM package k
                LEFT JOIN pack pk ON pk.id = k.pack_id AND pk.status = 'active' AND pk.deleted_at IS NULL
                WHERE k.id = :pid::uuid AND k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                """, p);
        if (rows.isEmpty()) throw ApiException.notFound("That package is not on your books.");
        var old = rows.getFirst();
        p.put("cid", old.get("client_id"));

        boolean fromPack = Boolean.TRUE.equals(old.get("pack_live"));
        String service = (String) (fromPack ? old.get("pack_service") : old.get("service"));
        p.put("service", service);

        /*
         * The double-sell guard. Locking the client row serialises two renews of
         * the same client, and the second then sees the first one's package.
         *
         * It refuses when a running, unpaused pack for the same service exists
         * that is NEWER than the one being renewed — i.e. this one has already
         * been renewed. The contract's literal wording ("an active pack with
         * sessions left") would refuse the ordinary case: the queue offers Renew
         * precisely while the current pack still has a session or two left.
         */
        jdbc.queryForList("SELECT id FROM client WHERE id = :cid::uuid FOR UPDATE", p);
        // Under the lock a concurrent first attempt with the same id has
        // committed and is visible: that is a replay (200), and must be answered
        // before the guard below reads its package as "already renewed".
        if (newId != null) {
            var replay = replay(trainerId, newId, p);
            if (replay != null) return replay;
        }
        p.put("oldCreated", old.get("created_at"));
        Boolean renewed = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM package
                    WHERE client_id = :cid::uuid AND service = :service AND id <> :pid::uuid
                      AND status = 'active' AND paused_at IS NULL AND deleted_at IS NULL
                      AND created_at > :oldCreated)
                """, p, Boolean.class);
        if (Boolean.TRUE.equals(renewed)) throw PackageRuleException.alreadyRenewed();

        LocalDate start = parsedStart != null ? parsedStart : WorkspaceClock.today(clock.zone());

        String basis = (String) (fromPack ? old.get("pack_basis") : old.get("basis"));
        Integer sessions = fromPack ? (Integer) old.get("pack_sessions") : (Integer) old.get("sessions_total");
        Integer validityDays = fromPack ? (Integer) old.get("pack_validity") : lengthInDays(old);

        p.put("id", (newId == null ? UUID.randomUUID() : newId).toString());
        p.put("packId", old.get("pack_id"));
        p.put("name", fromPack ? old.get("pack_name") : old.get("name"));
        p.put("basis", basis);
        p.put("sessions", "sessions".equals(basis) ? sessions : null);
        p.put("amount", (BigDecimal) (fromPack ? old.get("pack_amount") : old.get("amount")));
        p.put("currency", fromPack ? old.get("pack_currency") : old.get("currency"));
        p.put("start", Date.valueOf(start));
        p.put("end", validityDays == null ? null : Date.valueOf(start.plusDays(validityDays)));
        p.put("sharePercent", fromPack ? old.get("pack_share_percent") : old.get("trainer_share_percent"));
        p.put("shareAmount", fromPack ? old.get("pack_share_amount") : old.get("trainer_share_amount"));

        // tenant_id is stamped by the trigger; due on the day it starts.
        int inserted = jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis,
                                     sessions_total, sessions_remaining, amount, currency,
                                     start_date, end_date, due_date, trainer_share_percent, trainer_share_amount)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :packId::uuid, :name, :service, :basis,
                        :sessions, :sessions, :amount, :currency,
                        :start, :end, :start, :sharePercent, :shareAmount)
                ON CONFLICT (id) DO NOTHING
                """, p);
        log.info("package renewed trainer={} from={} to={} fromPack={}", trainerId, packageId, p.get("id"), fromPack);

        // Nothing inserted: the id is taken by a row this trainer cannot see
        // (another workspace; a visible one was answered as a replay above). A
        // collided id, never reported as a package this call created.
        if (inserted == 0) throw ApiException.idConflict();
        return new Renewed(reads.one(trainerId, UUID.fromString((String) p.get("id")))
                .orElseThrow(ApiException::idConflict), true);
    }

    /**
     * The package an earlier attempt with this id made, as a replay (200) —
     * only when it is this trainer's, for the same client as the package being
     * renewed. The same id anywhere else is ID_CONFLICT, and says nothing more.
     * Null when no row has the id yet.
     */
    private Renewed replay(UUID trainerId, UUID newId, Map<String, Object> p) {
        var existing = jdbc.queryForList("""
                SELECT (n.trainer_id = :tid::uuid AND n.client_id = o.client_id) AS mine
                FROM package n LEFT JOIN package o ON o.id = :pid::uuid
                WHERE n.id = :newId::uuid
                """, p);
        if (existing.isEmpty()) return null;
        if (!Boolean.TRUE.equals(existing.getFirst().get("mine"))) throw ApiException.idConflict();
        return new Renewed(reads.one(trainerId, newId).orElseThrow(ApiException::idConflict), false);
    }

    /** A custom package repeats its own length: end − start, when it had both. */
    private static Integer lengthInDays(Map<String, Object> old) {
        if (old.get("start_date") instanceof Date s && old.get("end_date") instanceof Date e) {
            return (int) (e.toLocalDate().toEpochDay() - s.toLocalDate().toEpochDay());
        }
        return null;
    }

    private static UUID parseId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("id: not a UUID");
        }
    }
}
