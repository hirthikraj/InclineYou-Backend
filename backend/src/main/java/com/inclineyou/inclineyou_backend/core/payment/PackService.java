package com.inclineyou.inclineyou_backend.core.payment;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * THE PRICE LIST — `pack`, not `package` (api-contract Business: GET · POST ·
 * PATCH · DELETE /v1/packs).
 *
 * <p>A <b>pack</b> is what the trainer offers (a 12-session block at ₹9,000); a
 * <b>package</b> is what one client bought. Editing a pack changes future sales
 * and renewals (R5), never a sold package, and a pack somebody bought from is
 * archived rather than deleted — {@code package.pack_id} points at it.
 *
 * <h2>A gym pack carries its trainer share, and the gym's share is derived</h2>
 * R3: the trainer's cut varies with the pack's price, so it is set per pack —
 * exactly one of {@code trainerSharePercent} / {@code trainerShareAmount}, and
 * only on an {@code owner = gym} pack (the {@code pack_trainer_share} check).
 * What the gym keeps is never stored: {@link PackRow#gymSharePercent} and
 * {@link PackRow#gymShareAmount} are worked out on read, so no client carries a
 * second copy of the formula.
 *
 * <h2>The write rules are the check constraints, said in sentences</h2>
 * Every rule below mirrors a constraint on {@code pack}, validated here first so
 * a refusal is a 400 naming the field instead of a 500 naming a constraint. The
 * database still has the last word.
 *
 * <p>PATCH is partial by key presence: a key sent is applied (null included), a
 * key omitted is untouched, so the body is a {@code Map}. The merged row is
 * validated as a whole, which is what lets a pack move from sessions to a period
 * without keeping the old count.
 */
@Service
@RequiredArgsConstructor
public class PackService {

    private final NamedParameterJdbcTemplate jdbc;
    private final PackageReadService reads;

    private static final Set<String> OWNERS = Set.of("trainer", "gym");
    private static final Set<String> STATUSES = Set.of("active", "inactive");
    private static final Set<String> SERVICES = Set.of("floor", "home_visit", "remote", "programming");
    private static final Set<String> BASES = Set.of("sessions", "period");
    private static final BigDecimal MAX_MONEY = new BigDecimal("99999999.99");

    /** What PATCH may touch. {@code owner} is named and refused, not ignored. */
    private static final Set<String> PATCHABLE = Set.of("name", "service", "basis", "sessions", "validityDays",
            "amount", "trainerSharePercent", "trainerShareAmount", "status", "orderIndex");
    private static final Set<String> CREATABLE = Set.of("id", "name", "service", "basis", "sessions", "validityDays",
            "amount", "owner", "trainerSharePercent", "trainerShareAmount", "orderIndex");

    /**
     * One price-list row on the 1.1 wire. {@code gymSharePercent} /
     * {@code gymShareAmount} are what the gym keeps of a gym pack, derived (null
     * on a trainer's own pack). {@code activeClients} and {@code soldCount} only
     * with {@code include=usage}.
     */
    public record PackRow(String id, String name, String service, String basis, Integer sessions,
                          Integer validityDays, String amount, String currency, String owner,
                          BigDecimal trainerSharePercent, String trainerShareAmount,
                          BigDecimal gymSharePercent, String gymShareAmount,
                          String status, int orderIndex, String version,
                          @JsonInclude(JsonInclude.Include.NON_NULL) Integer activeClients,
                          @JsonInclude(JsonInclude.Include.NON_NULL) Integer soldCount) {}

    /** A create's answer: {@code created} is false for a replayed id (200). */
    public record Created(PackRow row, boolean created) {}

    private static final String ROW_COLUMNS = """
            p.id::text AS id, p.name, p.service, p.basis, p.sessions, p.validity_days, p.amount, p.currency,
            p.owner, p.trainer_share_percent, p.trainer_share_amount, p.status, p.order_index, p.updated_at""";

    // ── Reads ─────────────────────────────────────────────────────

    /**
     * {@code GET /v1/packs} — bounded, ordered by orderIndex then id. {@code status}
     * defaults to active; {@code all} adds the retired ones. Usage is one grouped
     * pass over idx_package_pack, and only when asked for.
     */
    public List<PackRow> list(UUID trainerId, String status, String owner, String include) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var where = new ArrayList<String>(List.of("p.trainer_id = :tid::uuid", "p.deleted_at IS NULL"));
        String st = status == null || status.isBlank() ? "active" : status.strip();
        if (!"all".equals(st)) {
            if (!"active".equals(st)) throw ApiException.validation("status: active or all");
            where.add("p.status = 'active'");
        }
        if (owner != null && !owner.isBlank()) {
            if (!OWNERS.contains(owner.strip())) throw ApiException.validation("owner: trainer or gym");
            p.put("owner", owner.strip());
            where.add("p.owner = :owner");
        }
        if (include != null && !include.isBlank() && !"usage".equals(include.strip())) {
            throw ApiException.validation("include: usage");
        }
        boolean usage = include != null && "usage".equals(include.strip());
        p.put("usage", usage);
        return jdbc.query("""
                SELECT %s, u.active_clients, u.sold
                FROM pack p
                LEFT JOIN (
                    SELECT pack_id, count(DISTINCT client_id) FILTER (WHERE status = 'active') AS active_clients,
                           count(*) AS sold
                    FROM package WHERE trainer_id = :tid::uuid AND pack_id IS NOT NULL AND deleted_at IS NULL AND :usage
                    GROUP BY pack_id
                ) u ON u.pack_id = p.id
                WHERE %s
                ORDER BY p.order_index, p.id
                """.formatted(ROW_COLUMNS, String.join(" AND ", where)), p, (rs, i) -> row(rs, usage));
    }

    private static PackRow row(ResultSet rs, boolean usage) throws SQLException {
        BigDecimal amount = rs.getBigDecimal("amount");
        BigDecimal pct = rs.getBigDecimal("trainer_share_percent");   // a percentage is a JSON number, not money
        BigDecimal share = rs.getBigDecimal("trainer_share_amount");
        // What the gym keeps — derived on read, never stored (R3).
        BigDecimal gymPct = pct == null ? null : BigDecimal.valueOf(100).subtract(pct);
        String gymAmt = null;
        if (pct != null) {
            gymAmt = PackageReadService.money(amount.multiply(gymPct).divide(BigDecimal.valueOf(100), 2,
                    java.math.RoundingMode.HALF_UP));
        } else if (share != null) {
            gymAmt = PackageReadService.money(amount.subtract(share));
            gymPct = amount.signum() == 0 ? null
                    : amount.subtract(share).multiply(BigDecimal.valueOf(100)).divide(amount, 2, java.math.RoundingMode.HALF_UP);
        }
        return new PackRow(
                rs.getString("id"), rs.getString("name"), rs.getString("service"), rs.getString("basis"),
                (Integer) rs.getObject("sessions"), (Integer) rs.getObject("validity_days"),
                PackageReadService.money(amount), rs.getString("currency"), rs.getString("owner"),
                pct, PackageReadService.money(share), gymPct, gymAmt,
                rs.getString("status"), rs.getInt("order_index"),
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                usage ? rs.getInt("active_clients") : null, usage ? rs.getInt("sold") : null);
    }

    // ── Writes ─────────────────────────────────────────────────────

    /** The pack as one validated value — what a create is built from and a PATCH merges into. */
    private record Shape(String name, String service, String basis, Integer sessions, Integer validityDays,
                         BigDecimal amount, String owner, BigDecimal pct, BigDecimal shareAmount) {}

    /**
     * {@code POST /v1/packs} — 201, or 200 for a replayed id. The id is optional;
     * one that belongs to someone else's row (or a deleted one) is 409
     * ID_CONFLICT with no detail, so a create is never a probe.
     */
    @Transactional
    public Created create(UUID trainerId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("A pack needs a name, a price and what it covers.");
        for (String key : body.keySet()) {
            if (!CREATABLE.contains(key)) throw ApiException.validation(key + ": not a pack field");
        }
        UUID id = body.get("id") == null ? UUID.randomUUID() : uuid(body.get("id"), "id");

        var existing = jdbc.queryForList("SELECT trainer_id::text AS tid, deleted_at FROM pack WHERE id = :id::uuid",
                Map.of("id", id.toString()));
        if (!existing.isEmpty()) {
            var e = existing.get(0);
            if (!trainerId.toString().equals(e.get("tid")) || e.get("deleted_at") != null) throw ApiException.idConflict();
            return new Created(one(trainerId, id).orElseThrow(), false);
        }

        String owner = body.get("owner") == null ? "trainer" : text(body.get("owner"), "owner");
        var shape = validate(new Shape(
                text(body.get("name"), "name"),
                text(body.get("service"), "service"),
                body.get("basis") == null ? "sessions" : text(body.get("basis"), "basis"),
                integer(body.get("sessions"), "sessions"),
                integer(body.get("validityDays"), "validityDays"),
                decimal(body.get("amount"), "amount"),
                owner,
                decimal(body.get("trainerSharePercent"), "trainerSharePercent"),
                decimal(body.get("trainerShareAmount"), "trainerShareAmount")));

        if ("gym".equals(shape.owner())) requireGymName(trainerId);
        requireNameFree(trainerId, shape.name(), null);

        int order = body.get("orderIndex") == null ? nextOrder(trainerId) : intRequired(body.get("orderIndex"), "orderIndex");
        var p = params(shape);
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("currency", reads.workspaceCurrency());
        p.put("orderIndex", order);
        try {
            jdbc.update("""
                    INSERT INTO pack (id, trainer_id, name, service, basis, sessions, validity_days, amount, currency,
                                      owner, trainer_share_percent, trainer_share_amount, status, order_index)
                    VALUES (:id::uuid, :tid::uuid, :name, :service, :basis, :sessions, :validityDays, :amount, :currency,
                            :owner, :pct, :shareAmount, 'active', :orderIndex)
                    """, p);
        } catch (DuplicateKeyException e) {
            // The name, if the race got past requireNameFree; otherwise a row in another workspace that RLS hid.
            throw String.valueOf(e.getMessage()).contains("uq_pack_live_name") ? PackRuleException.nameTaken() : ApiException.idConflict();
        }
        return new Created(one(trainerId, id).orElseThrow(), true);
    }

    /**
     * {@code PATCH /v1/packs/{id}} — any subset. A status the pack already has is
     * a 200 that writes nothing, so archive and restore are idempotent and the
     * version only moves when something changed. {@code If-Match} is honoured
     * when sent (412), never required.
     */
    @Transactional
    public PackRow patch(UUID trainerId, UUID packId, String ifMatch, Map<String, Object> body) {
        if (body == null || body.isEmpty()) throw ApiException.validation("Nothing to change.");
        if (body.containsKey("owner")) throw PackRuleException.ownerImmutable();
        for (String key : body.keySet()) {
            if (!PATCHABLE.contains(key)) throw ApiException.validation(key + ": not an editable pack field");
        }
        var cur = jdbc.query("SELECT " + ROW_COLUMNS + """
                , p.deleted_at FROM pack p
                WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL FOR UPDATE
                """, Map.of("id", packId.toString(), "tid", trainerId.toString()), (rs, i) -> row(rs, false))
                .stream().findFirst().orElseThrow(PackRuleException::notFound);
        IfMatch.check(ifMatch, cur.version(), "That pack changed since you opened it.");

        var merged = validate(new Shape(
                body.containsKey("name") ? text(body.get("name"), "name") : cur.name(),
                body.containsKey("service") ? text(body.get("service"), "service") : cur.service(),
                body.containsKey("basis") ? text(body.get("basis"), "basis") : cur.basis(),
                body.containsKey("sessions") ? integer(body.get("sessions"), "sessions") : cur.sessions(),
                body.containsKey("validityDays") ? integer(body.get("validityDays"), "validityDays") : cur.validityDays(),
                body.containsKey("amount") ? decimal(body.get("amount"), "amount") : new BigDecimal(cur.amount()),
                cur.owner(),
                body.containsKey("trainerSharePercent") ? decimal(body.get("trainerSharePercent"), "trainerSharePercent") : cur.trainerSharePercent(),
                body.containsKey("trainerShareAmount") ? decimal(body.get("trainerShareAmount"), "trainerShareAmount")
                        : cur.trainerShareAmount() == null ? null : new BigDecimal(cur.trainerShareAmount())));

        String status = cur.status();
        if (body.containsKey("status")) {
            status = text(body.get("status"), "status");
            if (!STATUSES.contains(status)) throw ApiException.validation("status: active or inactive");
        }
        int order = body.containsKey("orderIndex") ? intRequired(body.get("orderIndex"), "orderIndex") : cur.orderIndex();

        var now = new Shape(cur.name(), cur.service(), cur.basis(), cur.sessions(), cur.validityDays(),
                new BigDecimal(cur.amount()), cur.owner(), cur.trainerSharePercent(),
                cur.trainerShareAmount() == null ? null : new BigDecimal(cur.trainerShareAmount()));
        if (sameShape(now, merged) && status.equals(cur.status()) && order == cur.orderIndex()) return cur;

        if (!merged.name().equalsIgnoreCase(cur.name())) requireNameFree(trainerId, merged.name(), packId);

        var p = params(merged);
        p.put("id", packId.toString());
        p.put("tid", trainerId.toString());
        p.put("status", status);
        p.put("orderIndex", order);
        jdbc.update("""
                UPDATE pack SET name = :name, service = :service, basis = :basis, sessions = :sessions,
                       validity_days = :validityDays, amount = :amount, trainer_share_percent = :pct,
                       trainer_share_amount = :shareAmount, status = :status, order_index = :orderIndex
                WHERE id = :id::uuid AND trainer_id = :tid::uuid
                """, p);
        return one(trainerId, packId).orElseThrow();
    }

    /**
     * {@code DELETE /v1/packs/{id}} — soft, and only for a pack nothing was ever
     * sold from (any package row counts, even a deleted one: the foreign key
     * would still point at it). 204, and 204 again; a pack that is not yours is 404.
     */
    @Transactional
    public void delete(UUID trainerId, UUID packId) {
        var rows = jdbc.queryForList("SELECT deleted_at FROM pack WHERE id = :id::uuid AND trainer_id = :tid::uuid FOR UPDATE",
                Map.of("id", packId.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw PackRuleException.notFound();
        if (rows.get(0).get("deleted_at") != null) return;
        Integer sold = jdbc.queryForObject("SELECT count(*) FROM package WHERE pack_id = :id::uuid",
                Map.of("id", packId.toString()), Integer.class);
        if (sold != null && sold > 0) throw PackRuleException.sold();
        jdbc.update("UPDATE pack SET deleted_at = now() WHERE id = :id::uuid AND trainer_id = :tid::uuid",
                Map.of("id", packId.toString(), "tid", trainerId.toString()));
    }

    /** One live pack in the list shape; empty if it is not this trainer's. */
    public java.util.Optional<PackRow> one(UUID trainerId, UUID packId) {
        return jdbc.query("SELECT " + ROW_COLUMNS + """
                 FROM pack p WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                """, Map.of("id", packId.toString(), "tid", trainerId.toString()), (rs, i) -> row(rs, false))
                .stream().findFirst();
    }

    // ── Rules ─────────────────────────────────────────────────────

    /** The pack check constraints, as 400s naming the field. */
    private Shape validate(Shape s) {
        String name = s.name() == null ? "" : s.name().strip();
        if (name.isEmpty()) throw ApiException.validation("name: a pack needs a name");
        if (name.length() > 80) throw ApiException.validation("name: at most 80 characters");
        if (s.service() == null || !SERVICES.contains(s.service())) {
            throw ApiException.validation("service: floor, home_visit, remote or programming");
        }
        if (!BASES.contains(s.basis())) throw ApiException.validation("basis: sessions or period");
        if (s.amount() == null) throw ApiException.validation("amount: a pack needs a price");
        if (s.amount().signum() < 0 || s.amount().compareTo(MAX_MONEY) > 0) {
            throw ApiException.validation("amount: between 0 and 99,999,999.99");
        }
        if (s.amount().scale() > 2) throw ApiException.validation("amount: at most two decimals");
        if (!OWNERS.contains(s.owner())) throw ApiException.validation("owner: trainer or gym");
        if ("programming".equals(s.service()) && !"period".equals(s.basis())) {
            throw ApiException.validation("basis: programming is sold by the period");
        }
        if ("sessions".equals(s.basis())) {
            if (s.sessions() == null || s.sessions() < 1 || s.sessions() > 500) {
                throw ApiException.validation("sessions: a session pack needs 1 to 500 sessions");
            }
        } else {
            if (s.sessions() != null) throw ApiException.validation("sessions: a period pack has no session count");
            if (s.validityDays() == null) throw ApiException.validation("validityDays: a period pack needs its length in days");
        }
        if (s.validityDays() != null && (s.validityDays() < 1 || s.validityDays() > 730)) {
            throw ApiException.validation("validityDays: 1 to 730");
        }
        boolean gym = "gym".equals(s.owner());
        int shares = (s.pct() == null ? 0 : 1) + (s.shareAmount() == null ? 0 : 1);
        if (gym) {
            if (!"floor".equals(s.service())) throw ApiException.validation("service: a gym pack is a floor pack");
            if (shares != 1) {
                throw ApiException.validation("trainerSharePercent: a gym pack carries exactly one of trainerSharePercent or trainerShareAmount");
            }
        } else if (shares != 0) {
            throw ApiException.validation("trainerSharePercent: only a gym pack has a trainer share");
        }
        if (s.pct() != null && (s.pct().signum() < 0 || s.pct().compareTo(BigDecimal.valueOf(100)) > 0 || s.pct().scale() > 2)) {
            throw ApiException.validation("trainerSharePercent: 0 to 100, at most two decimals");
        }
        if (s.shareAmount() != null && (s.shareAmount().signum() < 0 || s.shareAmount().compareTo(s.amount()) > 0
                || s.shareAmount().scale() > 2)) {
            throw ApiException.validation("trainerShareAmount: between 0 and the pack price");
        }
        return new Shape(name, s.service(), s.basis(), s.sessions(), s.validityDays(), s.amount(), s.owner(),
                s.pct(), s.shareAmount());
    }

    private static boolean sameShape(Shape a, Shape b) {
        return a.name().equals(b.name()) && a.service().equals(b.service()) && a.basis().equals(b.basis())
                && java.util.Objects.equals(a.sessions(), b.sessions())
                && java.util.Objects.equals(a.validityDays(), b.validityDays())
                && a.amount().compareTo(b.amount()) == 0
                && cmp(a.pct(), b.pct()) && cmp(a.shareAmount(), b.shareAmount());
    }

    private static boolean cmp(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    private static Map<String, Object> params(Shape s) {
        var p = new LinkedHashMap<String, Object>();
        p.put("name", s.name());
        p.put("service", s.service());
        p.put("basis", s.basis());
        p.put("sessions", s.sessions());
        p.put("validityDays", s.validityDays());
        p.put("amount", s.amount());
        p.put("owner", s.owner());
        p.put("pct", s.pct());
        p.put("shareAmount", s.shareAmount());
        return p;
    }

    /** A gym pack needs a gym to belong to (409: the trainer can fix it in Settings). */
    private void requireGymName(UUID trainerId) {
        Boolean has = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM trainer_business
                               WHERE trainer_id = :tid::uuid AND btrim(coalesce(gym_name, '')) <> '')
                """, Map.of("tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(has)) throw PackRuleException.gymNeeded();
    }

    /** Live names are unique per trainer, case-insensitively — the price list is read by name. */
    private void requireNameFree(UUID trainerId, String name, UUID except) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("name", name.strip());
        p.put("except", except == null ? null : except.toString());
        Boolean taken = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                               AND lower(name) = lower(:name)
                               AND (CAST(:except AS uuid) IS NULL OR id <> CAST(:except AS uuid)))
                """, p, Boolean.class);
        if (Boolean.TRUE.equals(taken)) throw PackRuleException.nameTaken();
    }

    private int nextOrder(UUID trainerId) {
        Integer max = jdbc.queryForObject("SELECT max(order_index) FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("tid", trainerId.toString()), Integer.class);
        return max == null ? 0 : max + 1;
    }

    // ── Body parsing: JSON types are checked, never coerced ───────────

    private static String text(Object v, String field) {
        if (v == null) return null;
        if (v instanceof String s) return s;
        throw ApiException.validation(field + ": must be text");
    }

    private static UUID uuid(Object v, String field) {
        try {
            return UUID.fromString(text(v, field).strip());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    private static Integer integer(Object v, String field) {
        if (v == null) return null;
        if (v instanceof Integer i) return i;
        if (v instanceof Long l && l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return l.intValue();
        throw ApiException.validation(field + ": must be a whole number");
    }

    private static int intRequired(Object v, String field) {
        Integer i = integer(v, field);
        if (i == null) throw ApiException.validation(field + ": must be a whole number");
        return i;
    }

    /** A decimal string ("9000.00") or a JSON number; anything else is refused. */
    private static BigDecimal decimal(Object v, String field) {
        if (v == null) return null;
        try {
            if (v instanceof String s) return new BigDecimal(s.strip());
            if (v instanceof Integer || v instanceof Long || v instanceof Double || v instanceof BigDecimal) {
                return new BigDecimal(v.toString());
            }
        } catch (NumberFormatException e) {
            // fall through
        }
        throw ApiException.validation(field + ": must be a number");
    }
}
