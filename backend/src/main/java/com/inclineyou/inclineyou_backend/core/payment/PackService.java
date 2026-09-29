package com.inclineyou.inclineyou_backend.core.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * THE PRICE LIST — `pack`, not `package`.
 *
 * Two tables one letter apart, and the difference is the whole domain: a
 * <b>pack</b> is what the trainer <i>offers</i> (a 12-session block at ₹9,000),
 * and a <b>package</b> is what one client <i>bought</i>. {@link PackageService}
 * owns the second. Changing a price here must never rewrite a sale, which is why
 * retiring is a status and never a delete — and why `package.pack_id` carries a
 * foreign key that would refuse the delete anyway.
 *
 * <h2>Why this exists at all</h2>
 *
 * Until now `pack` reached the wire only inside the sync envelope — `pushPacks`
 * and the `packs` table in {@code SyncService}, which is all the phone ever
 * needed, because the phone holds the table locally and reconciles. The web half
 * is online-only and holds nothing, so its Packages screen had exactly two ways
 * to read a price list: a full `/v1/sync/pull` on every render, which
 * `lib/today/api.ts` and `lib/setup/api.ts` both forbid on a built screen in so
 * many words, or this. Additive-only: a new controller, no schema change, and
 * the sync path is untouched so no phone build notices.
 *
 * <h2>Two price lists, one table</h2>
 *
 * V19's `owner` column is the point of most of this file. A trainer employed at a
 * gym keeps two lists — their own packs, which they price and can discount, and
 * the packages the gym's counter sells, which they can do neither to. Both are
 * price-list entries, so it is one column rather than a second table every read
 * would have to union.
 *
 * <b>`owner` is set once, at creation, and PATCH cannot move it.</b> That is not
 * tidiness: moving a pack between the two lists would re-attribute every package
 * already sold from it, and the gym's prices are not the trainer's to re-badge.
 * It mirrors the same refusal in `pushPacks`, which COALESCEs a null owner to
 * whatever is already stored rather than letting an old build flatten it.
 *
 * <h2>Every refusal is a sentence</h2>
 *
 * Through {@link PackRuleException}, never {@code ResponseStatusException} — see
 * that class for why the difference is visible to a trainer and not only to a
 * log.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    /**
     * One entry on a price list.
     *
     * `activeClients` is computed here rather than left to the caller. The screen
     * that reads this always wants it — "3 clients on this" is what makes
     * retiring a price a decision rather than a click — and deriving it in the
     * browser would mean shipping every sold package to a screen that has no
     * other use for them.
     */
    public record PackResponse(
            String id,
            String name,
            String type,
            Integer sessions,
            BigDecimal amount,
            String currency,
            Integer validityDays,
            String status,
            String owner,
            int orderIndex,
            int activeClients,
            long createdAt,
            long updatedAt
    ) {}

    /**
     * `owner` and `orderIndex` are optional and default the way the column does —
     * an old caller that has never heard of the gym list still writes the only
     * thing it ever meant.
     */
    public record CreatePackRequest(
            @NotBlank String name,
            @NotBlank String type,
            Integer sessions,
            @NotNull BigDecimal amount,
            Integer validityDays,
            String owner,
            Integer orderIndex
    ) {}

    /**
     * The PATCH body is a {@code Map} and not a record, and that is the one
     * design decision in this file worth defending.
     *
     * A record cannot tell **absent** from **null**: Jackson deserialises both to
     * `null`, so `COALESCE(:validityDays, validity_days)` — the obvious
     * implementation — makes a validity impossible to CLEAR. A trainer emptying
     * *Valid for* on the form would silently keep the old expiry, which is the
     * quiet kind of wrong that only surfaces months later when a pack expires
     * that the trainer believed had no expiry. `sessions` has the same problem in
     * a worse place: a 12-session pack edited into a Monthly would keep 12.
     *
     * So presence is read from the JSON. **A key that is there is applied, `null`
     * included; a key that is absent is untouched** — which is what PATCH means,
     * and it lets `{"status":"inactive"}` be the whole retire request.
     *
     * The SET list is built from a fixed whitelist of column names below and
     * every value is a bound parameter, so nothing from the body reaches the SQL
     * text.
     */
    public static final Set<String> PATCHABLE =
            Set.of("name", "type", "sessions", "amount", "validityDays", "status", "orderIndex");

    private static final Set<String> TYPES  = Set.of("session_pack", "monthly", "single");
    private static final Set<String> OWNERS = Set.of("trainer", "gym");
    private static final Set<String> STATUSES = Set.of("active", "inactive");

    /**
     * The one row of columns every read selects — the device
     * {@code PackageService} uses for the same reason: three reads that spell
     * their own SELECT are three places the next column has to be added.
     *
     * The correlated count is `status = 'active'` and not merely "not deleted",
     * because the question the screen asks is *how many people are on this
     * right now*, and a pack somebody finished last year is not a reason to keep
     * selling it.
     */
    private static final String PACK_COLUMNS = """
            p.id::text, p.name, p.type, p.sessions, p.amount, p.currency, p.validity_days,
            p.status, p.owner, p.order_index,
            (SELECT COUNT(*) FROM package pkg
              WHERE pkg.pack_id = p.id AND pkg.status = 'active' AND pkg.deleted_at IS NULL
            ) AS active_clients,
            p.created_at, p.updated_at
            """;

    // ── Reads ─────────────────────────────────────────────────────────────────

    /**
     * The whole price list, both owners, retired entries included.
     *
     * <b>Retired ones are returned rather than filtered.</b> The screen draws
     * them in their own group — "no longer offered, N still on it" — and a
     * caller that wants only what is for sale passes `status=active`. Filtering
     * them out here would make bringing one back impossible without a second
     * endpoint.
     *
     * Ordered by the trainer's own `order_index`, then by price, which is the
     * ordering `buildPacks` on the phone applies and the one the sync-fed screens
     * already show.
     */
    public List<PackResponse> listPacks(UUID trainerId, String owner, String status) {
        var conditions = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        conditions.add("p.trainer_id = :tid::uuid");
        conditions.add("p.deleted_at IS NULL");

        if (owner != null && !owner.isBlank()) {
            p.put("owner", requireOneOf(owner, OWNERS, "owner"));
            conditions.add("p.owner = :owner");
        }
        if (status != null && !status.isBlank()) {
            p.put("status", requireOneOf(status, STATUSES, "status"));
            conditions.add("p.status = :status");
        }

        var rows = jdbc.queryForList("""
                SELECT %s
                FROM pack p
                WHERE %s
                ORDER BY p.order_index, p.amount
                """.formatted(PACK_COLUMNS, String.join(" AND ", conditions)), p);
        return rows.stream().map(this::toPackResponse).toList();
    }

    /**
     * One price-list row on the 1.1 wire (api-contract Clients, the add flow's
     * step 2). {@code activeClients} and {@code soldCount} only with
     * {@code include=usage}, which Business asks for.
     */
    public record PackRow(String id, String name, String service, String basis, Integer sessions,
                          Integer validityDays, String amount, String currency, String owner,
                          BigDecimal trainerSharePercent, String trainerShareAmount, String status, int orderIndex,
                          String version,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Integer activeClients,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Integer soldCount) {}

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
            if (!"active".equals(st)) throw com.inclineyou.inclineyou_backend.shared.exception.ApiException.validation("status: active or all");
            where.add("p.status = 'active'");
        }
        if (owner != null && !owner.isBlank()) {
            if (!OWNERS.contains(owner.strip())) throw com.inclineyou.inclineyou_backend.shared.exception.ApiException.validation("owner: trainer or gym");
            p.put("owner", owner.strip());
            where.add("p.owner = :owner");
        }
        if (include != null && !include.isBlank() && !"usage".equals(include.strip())) {
            throw com.inclineyou.inclineyou_backend.shared.exception.ApiException.validation("include: usage");
        }
        boolean usage = include != null && "usage".equals(include.strip());
        return jdbc.query("""
                SELECT p.id::text AS id, p.name, p.service, p.basis, p.sessions, p.validity_days, p.amount, p.currency,
                       p.owner, p.trainer_share_percent, p.trainer_share_amount, p.status, p.order_index, p.updated_at,
                       u.active_clients, u.sold
                FROM pack p
                LEFT JOIN (
                    SELECT pack_id, count(DISTINCT client_id) FILTER (WHERE status = 'active') AS active_clients,
                           count(*) AS sold
                    FROM package WHERE trainer_id = :tid::uuid AND pack_id IS NOT NULL AND deleted_at IS NULL AND :usage
                    GROUP BY pack_id
                ) u ON u.pack_id = p.id
                WHERE %s
                ORDER BY p.order_index, p.id
                """.formatted(String.join(" AND ", where)), withUsage(p, usage), (rs, i) -> new PackRow(
                rs.getString("id"), rs.getString("name"), rs.getString("service"), rs.getString("basis"),
                (Integer) rs.getObject("sessions"), (Integer) rs.getObject("validity_days"),
                PackageReadService.money(rs.getBigDecimal("amount")), rs.getString("currency"), rs.getString("owner"),
                rs.getBigDecimal("trainer_share_percent"),   // a percentage is a JSON number, not money
                PackageReadService.money(rs.getBigDecimal("trainer_share_amount")),
                rs.getString("status"), rs.getInt("order_index"),
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                usage ? rs.getInt("active_clients") : null, usage ? rs.getInt("sold") : null));
    }

    private static Map<String, Object> withUsage(Map<String, Object> p, boolean usage) {
        p.put("usage", usage);
        return p;
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    /**
     * Add a price.
     *
     * The id is generated here rather than by the column default so the response
     * can be built without a second read — and so this route writes under the
     * same contract the sync path does, where the id arrives from the client.
     */
    @Transactional
    public PackResponse createPack(UUID trainerId, CreatePackRequest req) {
        String type  = requireOneOf(req.type(), TYPES, "type");
        String owner = req.owner() == null || req.owner().isBlank()
                ? "trainer"
                : requireOneOf(req.owner(), OWNERS, "owner");

        if (req.amount() == null || req.amount().signum() <= 0) throw PackRuleException.needsPrice();

        /*
         * A monthly fee is a duration, not a count — `sessions` is NULL for it by
         * the column's own comment, so a count sent alongside one is dropped
         * rather than stored where nothing will ever divide by it.
         *
         * Written as if/else and NOT as a chained ternary, which is how this was
         * first written and how it threw a 500 on the honest mistake of posting a
         * session pack with no count: one arm of `a ? null : b ? 1 : req.sessions()`
         * is an `int`, so Java unboxes the WHOLE expression and a null
         * `req.sessions()` is an NPE before any validation can name it.
         */
        Integer sessions;
        if ("monthly".equals(type))      sessions = null;
        else if ("single".equals(type))  sessions = 1;
        else                             sessions = req.sessions();

        if (sessions != null && sessions <= 0) throw PackRuleException.needsSessions();
        if ("session_pack".equals(type) && sessions == null) throw PackRuleException.needsSessions();

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",           id.toString());
        p.put("tid",          trainerId.toString());
        p.put("name",         req.name().trim());
        p.put("type",         type);
        p.put("sessions",     sessions);
        p.put("amount",       req.amount());
        p.put("currency",     "INR");
        p.put("validityDays", req.validityDays());
        p.put("owner",        owner);
        p.put("orderIndex",   req.orderIndex() == null ? 0 : req.orderIndex());
        p.put("now",          Timestamp.from(now));

        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, type, sessions, amount, currency,
                    validity_days, status, owner, order_index, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :type, :sessions, :amount, :currency,
                    :validityDays, 'active', :owner, :orderIndex, :now, :now)
                """, p);

        return new PackResponse(id.toString(), req.name().trim(), type, sessions, req.amount(), "INR",
                req.validityDays(), "active", owner, p.get("orderIndex") instanceof Integer i ? i : 0,
                0, now.toEpochMilli(), now.toEpochMilli());
    }

    /**
     * Change a price, rename it, retire it, or bring it back.
     *
     * PARTIAL, by key presence — see {@link #PATCHABLE} for why that is a `Map`
     * and not a record. `{"status":"inactive"}` is the whole retire request;
     * `{"validityDays":null}` genuinely clears an expiry.
     *
     * The `WHERE trainer_id` is the tenant check and is not decorative: without
     * it a valid token could rename any trainer's price list by id. Zero rows
     * updated is a 404 rather than a 403, because a trainer has no business
     * learning that somebody else's pack exists.
     */
    @Transactional
    public PackResponse updatePack(UUID trainerId, String packId, Map<String, Object> body) {
        if (body == null) body = Map.of();

        // Named rather than ignored. A caller that sends `owner` believes it is
        // moving a pack between the two lists, and silently dropping the field
        // would let them believe it worked. See the class comment.
        if (body.containsKey("owner")) throw PackRuleException.ownerImmutable();
        for (String key : body.keySet()) {
            if (!PATCHABLE.contains(key)) throw PackRuleException.unknownField(key);
        }

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  packId);
        p.put("tid", trainerId.toString());

        String type = null;
        if (body.containsKey("type")) {
            type = requireOneOf(text(body.get("type"), "type"), TYPES, "type");
            p.put("type", type);
            sets.add("type = :type");
        }

        if (body.containsKey("name")) {
            String name = text(body.get("name"), "name");
            if (name == null || name.isBlank()) throw PackRuleException.needsName();
            p.put("name", name.trim());
            sets.add("name = :name");
        }

        if (body.containsKey("amount")) {
            BigDecimal amount = toDecimal(body.get("amount"));
            if (amount == null || amount.signum() <= 0) throw PackRuleException.needsPrice();
            p.put("amount", amount);
            sets.add("amount = :amount");
        }

        if (body.containsKey("validityDays")) {
            p.put("validityDays", toInt(body.get("validityDays")));
            sets.add("validity_days = CAST(:validityDays AS INTEGER)");
        }

        if (body.containsKey("status")) {
            p.put("status", requireOneOf(text(body.get("status"), "status"), STATUSES, "status"));
            sets.add("status = :status");
        }

        if (body.containsKey("orderIndex")) {
            Integer order = toInt(body.get("orderIndex"));
            p.put("orderIndex", order == null ? 0 : order);
            sets.add("order_index = :orderIndex");
        }

        /*
         * `sessions` is the one field the body does not get the last word on, and
         * the reason is the same one `createPack` applies: a monthly fee is a
         * DURATION, and `sessions` is NULL for it by the column's own comment. A
         * pack edited from a 12-session block into a Monthly must not keep the 12
         * — nothing would ever divide by it again, and the next screen to read
         * the row would find a monthly pack claiming a session count.
         */
        if ("monthly".equals(type)) {
            p.put("sessions", null);
            sets.add("sessions = CAST(:sessions AS INTEGER)");
        } else if ("single".equals(type)) {
            p.put("sessions", 1);
            sets.add("sessions = :sessions");
        } else if (body.containsKey("sessions")) {
            Integer sessions = toInt(body.get("sessions"));
            if (sessions != null && sessions <= 0) throw PackRuleException.needsSessions();
            p.put("sessions", sessions);
            sets.add("sessions = CAST(:sessions AS INTEGER)");
        }

        // Nothing to say is not an error — the row is returned as it stands, so a
        // no-op PATCH reads the same as one that changed something.
        if (sets.isEmpty()) return getPack(trainerId, packId);

        sets.add("updated_at = NOW()");

        int updated = jdbc.update("""
                UPDATE pack SET %s
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """.formatted(String.join(", ", sets)), p);

        if (updated == 0) throw PackRuleException.notFound();

        // Re-read rather than reconstruct: `activeClients` is a correlated count
        // and `updated_at` is NOW() on the server's clock, so a response built in
        // Java here would be two fields of fiction.
        return getPack(trainerId, packId);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private PackResponse getPack(UUID trainerId, String packId) {
        var rows = jdbc.queryForList("""
                SELECT %s
                FROM pack p
                WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                """.formatted(PACK_COLUMNS), Map.of("id", packId, "tid", trainerId.toString()));
        if (rows.isEmpty()) throw PackRuleException.notFound();
        return toPackResponse(rows.get(0));
    }

    /**
     * Statuses stay plain strings validated in application code — V19's own note
     * — so a third owner one day is a code change and not a migration. Which
     * makes this the only place they are checked, and a 400 is the honest answer
     * to a value the column would happily store and no screen could read.
     */
    private String requireOneOf(String value, Set<String> allowed, String field) {
        if (!allowed.contains(value)) throw PackRuleException.unknownValue(field, value);
        return value;
    }

    private PackResponse toPackResponse(Map<String, Object> r) {
        return new PackResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("type")),
                toInt(r.get("sessions")),
                toDecimal(r.get("amount")),
                str(r.get("currency")),
                toInt(r.get("validity_days")),
                str(r.get("status")),
                str(r.get("owner")),
                toInt(r.get("order_index")) == null ? 0 : toInt(r.get("order_index")),
                toInt(r.get("active_clients")) == null ? 0 : toInt(r.get("active_clients")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    /** A JSON string, or a 400 naming the field — never a silent `toString()` of
     *  a number or an object, which would store `12` as a pack's name. */
    private String text(Object v, String field) {
        if (v == null) return null;
        if (v instanceof String str) return str;
        throw PackRuleException.notText(field);
    }

    private Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(v.toString());
    }

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
