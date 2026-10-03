package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.PackCreated;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackRow;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackShape;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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

    private final PackJdbcRepository packs;
    private final WorkspaceClock clock;

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

    // ── Reads ─────────────────────────────────────────────────────

    /**
     * {@code GET /v1/packs} — bounded, ordered by orderIndex then id. {@code status}
     * defaults to active; {@code all} adds the retired ones. Usage is one grouped
     * pass over idx_package_pack, and only when asked for.
     */
    public List<PackRow> list(UUID trainerId, String status, String owner, String include) {
        String st = status == null || status.isBlank() ? "active" : status.strip();
        if (!"all".equals(st) && !"active".equals(st)) throw ApiException.validation("status: active or all");
        String ownerFilter = null;
        if (owner != null && !owner.isBlank()) {
            if (!OWNERS.contains(owner.strip())) throw ApiException.validation("owner: trainer or gym");
            ownerFilter = owner.strip();
        }
        if (include != null && !include.isBlank() && !"usage".equals(include.strip())) {
            throw ApiException.validation("include: usage");
        }
        boolean usage = include != null && "usage".equals(include.strip());
        return packs.list(trainerId, !"all".equals(st), ownerFilter, usage);
    }

    // ── Writes ─────────────────────────────────────────────────────

    /**
     * {@code POST /v1/packs} — 201, or 200 for a replayed id. The id is optional;
     * one that belongs to someone else's row (or a deleted one) is 409
     * ID_CONFLICT with no detail, so a create is never a probe.
     */
    @Transactional
    public PackCreated create(UUID trainerId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("A pack needs a name, a price and what it covers.");
        for (String key : body.keySet()) {
            if (!CREATABLE.contains(key)) throw ApiException.validation(key + ": not a pack field");
        }
        UUID id = body.get("id") == null ? UUID.randomUUID() : uuid(body.get("id"), "id");

        var existing = packs.ownership(id);
        if (existing.isPresent()) {
            var e = existing.get();
            if (!trainerId.toString().equals(e.trainerId()) || e.deleted()) throw ApiException.idConflict();
            return new PackCreated(packs.find(trainerId, id).orElseThrow(), false);
        }

        String owner = body.get("owner") == null ? "trainer" : text(body.get("owner"), "owner");
        var shape = validate(new PackShape(
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

        int order = body.get("orderIndex") == null ? packs.nextOrder(trainerId) : intRequired(body.get("orderIndex"), "orderIndex");
        try {
            packs.insert(id, trainerId, shape, clock.currency(), order);
        } catch (DuplicateKeyException e) {
            // The name, if the race got past requireNameFree; otherwise a row in another workspace that RLS hid.
            throw String.valueOf(e.getMessage()).contains("uq_pack_live_name") ? PackRuleException.nameTaken() : ApiException.idConflict();
        }
        return new PackCreated(packs.find(trainerId, id).orElseThrow(), true);
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
        var cur = packs.lockLive(trainerId, packId).orElseThrow(PackRuleException::notFound);
        IfMatch.check(ifMatch, cur.version(), "That pack changed since you opened it.");

        var merged = validate(new PackShape(
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

        var now = new PackShape(cur.name(), cur.service(), cur.basis(), cur.sessions(), cur.validityDays(),
                new BigDecimal(cur.amount()), cur.owner(), cur.trainerSharePercent(),
                cur.trainerShareAmount() == null ? null : new BigDecimal(cur.trainerShareAmount()));
        if (samePackShape(now, merged) && status.equals(cur.status()) && order == cur.orderIndex()) return cur;

        if (!merged.name().equalsIgnoreCase(cur.name())) requireNameFree(trainerId, merged.name(), packId);

        packs.update(packId, trainerId, merged, status, order);
        return packs.find(trainerId, packId).orElseThrow();
    }

    /**
     * {@code DELETE /v1/packs/{id}} — soft, and only for a pack nothing was ever
     * sold from (any package row counts, even a deleted one: the foreign key
     * would still point at it). 204, and 204 again; a pack that is not yours is 404.
     */
    @Transactional
    public void delete(UUID trainerId, UUID packId) {
        var deleted = packs.lockForDelete(trainerId, packId).orElseThrow(PackRuleException::notFound);
        if (deleted) return;
        if (packs.soldCount(packId) > 0) throw PackRuleException.sold();
        packs.softDelete(trainerId, packId);
    }

    /** One live pack in the list shape; empty if it is not this trainer's. */
    public java.util.Optional<PackRow> one(UUID trainerId, UUID packId) {
        return packs.find(trainerId, packId);
    }

    // ── Rules ─────────────────────────────────────────────────────

    /** The pack check constraints, as 400s naming the field. */
    private PackShape validate(PackShape s) {
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
        return new PackShape(name, s.service(), s.basis(), s.sessions(), s.validityDays(), s.amount(), s.owner(),
                s.pct(), s.shareAmount());
    }

    private static boolean samePackShape(PackShape a, PackShape b) {
        return a.name().equals(b.name()) && a.service().equals(b.service()) && a.basis().equals(b.basis())
                && java.util.Objects.equals(a.sessions(), b.sessions())
                && java.util.Objects.equals(a.validityDays(), b.validityDays())
                && a.amount().compareTo(b.amount()) == 0
                && cmp(a.pct(), b.pct()) && cmp(a.shareAmount(), b.shareAmount());
    }

    private static boolean cmp(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    /** A gym pack needs a gym to belong to (409: the trainer can fix it in Settings). */
    private void requireGymName(UUID trainerId) {
        if (!packs.hasGymName(trainerId)) throw PackRuleException.gymNeeded();
    }

    /** Live names are unique per trainer, case-insensitively — the price list is read by name. */
    private void requireNameFree(UUID trainerId, String name, UUID except) {
        if (packs.nameTaken(trainerId, name, except)) throw PackRuleException.nameTaken();
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
