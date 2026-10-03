package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.payment.GymInput.*;

/**
 * {@code /v1/gym-arrangements} — the pay terms with a gym that is not on
 * InclineYou (R51): a base fee that is a {@code minimum} or a {@code basic}, or
 * none (share only). A trainer who moves gyms keeps each gym's months apart, so
 * this is a collection with history, not a singular PUT that quietly appended.
 *
 * <p>The schema allows ONE running arrangement per trainer
 * ({@code uq_gym_arrangement_open}); new terms close it the month before they
 * start, in the same transaction, so past months keep the terms they were
 * earned under.
 */
@Service
@RequiredArgsConstructor
public class GymArrangementService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService reads;

    public record Arrangement(String id, String gymName, String gymPlaceId, String baseKind, String baseAmount, String currency,
                              String startsMonth, String endsMonth, String note,
                              long createdAt, long updatedAt, String version) {}

    private static final String COLUMNS = """
            id::text AS id, gym_name, gym_place_id::text AS gym_place_id, base_kind, base_amount, currency, starts_month, ends_month, note,
            created_at, updated_at""";

    /** Every live row, the running one first, then by startsMonth newest first. */
    public List<Arrangement> list(UUID tid) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY (ends_month IS NULL) DESC, starts_month DESC, id
                """, Map.of("tid", tid.toString()), GymArrangementService::row);
    }

    /** The running arrangement, if any. */
    Optional<Arrangement> running(UUID tid) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NULL
                """, Map.of("tid", tid.toString()), GymArrangementService::row).stream().findFirst();
    }

    public record Created(Arrangement arrangement, boolean created) {}

    @Transactional
    public Created create(UUID tid, Map<String, Object> raw) {
        var b = body(raw, "id", "baseKind", "baseAmount", "startsMonth", "note");
        UUID id = uuid(b.get("id"), "id");
        YearMonth starts = month(b.get("startsMonth"), "startsMonth");
        if (starts == null) throw ApiException.validation("startsMonth: required, as yyyy-MM");
        String kind = kind(b.get("baseKind"));
        BigDecimal base = b.get("baseAmount") == null ? BigDecimal.ZERO : amount(b.get("baseAmount"), "baseAmount", false);
        baseShape(kind, base);
        String note = text(b.get("note"), 500, "note");

        if (id != null) {
            var existing = find(tid, id);
            if (existing.isPresent()) return new Created(existing.get(), false);
        }
        // The gym the trainer is with now: its name as a snapshot, and the directory place when it was picked from the search.
        var current = jdbc.query("SELECT gym_name, gym_place_id::text FROM trainer_business WHERE trainer_id = :tid::uuid",
                Map.of("tid", tid.toString()), (rs, i) -> new String[]{rs.getString(1), rs.getString(2)})
                .stream().filter(r -> r[0] != null).findFirst().orElse(null);
        String gym = current == null ? null : current[0];
        String gymPlaceId = current == null ? null : current[1];
        if (gym == null || gym.isBlank()) {
            throw ApiException.conflict("ARRANGEMENT_NEEDS_GYM", "Set your gym's name in Settings first.");
        }

        // The running row is locked so two taps cannot both close it.
        var run = jdbc.query("""
                SELECT id::text AS id, starts_month FROM gym_arrangement
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NULL FOR UPDATE
                """, Map.of("tid", tid.toString()),
                (rs, i) -> Map.entry(rs.getString("id"), YearMonth.from(rs.getDate("starts_month").toLocalDate())))
                .stream().findFirst();
        if (run.isPresent() && !starts.isAfter(run.get().getValue())) {
            throw ApiException.conflict("ARRANGEMENT_OVERLAP",
                    "New terms must start after the running terms began (" + run.get().getValue() + ").");
        }
        // A closed row that already covers the start month would overlap too.
        Integer clash = jdbc.queryForObject("""
                SELECT count(*) FROM gym_arrangement
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NOT NULL AND ends_month >= :s
                """, Map.of("tid", tid.toString(), "s", Date.valueOf(starts.atDay(1))), Integer.class);
        if (clash != null && clash > 0) {
            throw ApiException.conflict("ARRANGEMENT_OVERLAP", "Those months are already covered by earlier terms.");
        }
        if (run.isPresent()) {
            jdbc.update("UPDATE gym_arrangement SET ends_month = :e WHERE id = :id::uuid",
                    Map.of("e", Date.valueOf(starts.minusMonths(1).atDay(1)), "id", run.get().getKey()));
        }

        UUID newId = id == null ? UUID.randomUUID() : id;
        var p = new HashMap<String, Object>();
        p.put("id", newId.toString());
        p.put("tid", tid.toString());
        p.put("gym", gym);
        p.put("gp", gymPlaceId);
        p.put("kind", kind);
        p.put("base", base);
        p.put("cur", reads.workspaceCurrency());
        p.put("s", Date.valueOf(starts.atDay(1)));
        p.put("note", note);
        int n = jdbc.update("""
                INSERT INTO gym_arrangement (id, trainer_id, gym_name, gym_place_id, base_kind, base_amount, currency, starts_month, note)
                VALUES (:id::uuid, :tid::uuid, :gym, :gp::uuid, :kind, :base, :cur, :s, :note)
                ON CONFLICT (id) DO NOTHING
                """, p);
        if (n == 0) throw ApiException.idConflict();
        return new Created(find(tid, newId).orElseThrow(), true);
    }

    @Transactional
    public Arrangement patch(UUID tid, UUID id, String ifMatch, Map<String, Object> raw) {
        var b = body(raw, "baseKind", "baseAmount", "note");
        var cur = find(tid, id).orElseThrow(() -> ApiException.notFound("Those terms do not exist."));
        IfMatch.check(ifMatch, cur.version(), "These terms changed since you opened them.");
        if (b.isEmpty()) return cur;

        boolean touchesBase = b.containsKey("baseKind") || b.containsKey("baseAmount");
        String kind = b.containsKey("baseKind") ? kind(b.get("baseKind")) : cur.baseKind();
        BigDecimal base = b.containsKey("baseAmount")
                ? (b.get("baseAmount") == null ? BigDecimal.ZERO : amount(b.get("baseAmount"), "baseAmount", false))
                : new BigDecimal(cur.baseAmount());
        if (touchesBase) {
            baseShape(kind, base);
            // After its first month has ended the base is history; make new terms instead.
            YearMonth first = YearMonth.parse(cur.startsMonth());
            if (YearMonth.now(clock.zone()).isAfter(first)) {
                throw ApiException.conflict("ARRANGEMENT_STARTED",
                        "These terms have started — make new terms instead of changing the base.");
            }
        }
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("kind", kind);
        p.put("base", base);
        p.put("note", b.containsKey("note") ? text(b.get("note"), 500, "note") : cur.note());
        jdbc.update("""
                UPDATE gym_arrangement SET base_kind = :kind, base_amount = :base, note = :note
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        return find(tid, id).orElseThrow();
    }

    /** Soft, for terms entered by mistake; idempotent. The months it covered fall back to shares only. */
    @Transactional
    public void delete(UUID tid, UUID id) {
        jdbc.update("""
                UPDATE gym_arrangement SET deleted_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()));
    }

    Optional<Arrangement> find(UUID tid, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()), GymArrangementService::row).stream().findFirst();
    }

    private static String kind(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s) || !Set.of("minimum", "basic").contains(s)) {
            throw ApiException.validation("baseKind: minimum, basic or null");
        }
        return s;
    }

    /** gym_arrangement_base: a base needs a kind and a kind needs a base. */
    private static void baseShape(String kind, BigDecimal base) {
        if ((kind == null) != (base.signum() == 0)) {
            throw ApiException.validation("baseKind and baseAmount: a base needs a kind, and a kind needs an amount above zero");
        }
    }

    private static Arrangement row(ResultSet rs, int i) throws SQLException {
        long updated = rs.getTimestamp("updated_at").getTime();
        var ends = rs.getDate("ends_month");
        return new Arrangement(rs.getString("id"), rs.getString("gym_name"), rs.getString("gym_place_id"), rs.getString("base_kind"),
                PackageReadService.money(rs.getBigDecimal("base_amount")), rs.getString("currency"),
                YearMonth.from(rs.getDate("starts_month").toLocalDate()).toString(),
                ends == null ? null : YearMonth.from(ends.toLocalDate()).toString(),
                rs.getString("note"), rs.getTimestamp("created_at").getTime(), updated, String.valueOf(updated));
    }
}
