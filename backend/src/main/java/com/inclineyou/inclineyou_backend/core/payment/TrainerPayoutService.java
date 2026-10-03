package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.payment.GymInput.*;

/**
 * {@code /v1/trainer-payouts} — what the gym has actually paid the trainer.
 * The balance is a sum over these rows and nothing stores it, so editing or
 * deleting a payout moves the balance at once.
 */
@Service
@RequiredArgsConstructor
public class TrainerPayoutService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService reads;
    private final GymArrangementService arrangements;

    public record Payout(String id, String gymName, String gymPlaceId, String amount, String currency, String method, String reference,
                         String note, long receivedAt, long createdAt, String version,
                         @com.fasterxml.jackson.annotation.JsonIgnore String cursorKey) {}

    public record PayoutPage(String currency, List<Payout> items, String nextCursor) {}

    public record Created(Payout payout, boolean created) {}

    private static final String COLUMNS = """
            id::text AS id, gym_name, gym_place_id::text AS gym_place_id, amount, currency, method, reference, note, received_at, created_at, updated_at""";

    public PayoutPage list(UUID tid, String gymName, String from, String to, Integer limit, String cursor) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        var where = new ArrayList<String>(List.of("trainer_id = :tid::uuid", "deleted_at IS NULL"));
        // An explicit gymName is a name filter. Otherwise it is the running terms' gym — by place when
        // it was picked from the search (a rename cannot split it), by name when it is free text.
        var running = arrangements.running(tid).orElse(null);
        if (gymName != null && !gymName.isBlank()) {
            p.put("gym", gymName.strip());
            where.add("gym_name = :gym");
        } else if (running != null && running.gymPlaceId() != null) {
            p.put("gp", running.gymPlaceId());
            where.add("gym_place_id = :gp::uuid");
        } else if (running != null) {
            p.put("gym", running.gymName());
            where.add("gym_name = :gym");
        }
        var zone = clock.zone();
        LocalDate f = WorkspaceClock.parseDate(from, "from");
        LocalDate t = WorkspaceClock.parseDate(to, "to");
        if (f != null) { p.put("from", Timestamp.from(WorkspaceClock.startOf(f, zone))); where.add("received_at >= :from"); }
        if (t != null) { p.put("to", Timestamp.from(WorkspaceClock.startOf(t, zone))); where.add("received_at < :to"); }
        int n = Cursor.limit(limit, 50, 200);
        Cursor after = Cursor.decode(cursor);
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            where.add("(received_at, id) < (:afterAt, :afterId::uuid)");
        }
        p.put("limit", n + 1);
        var rows = jdbc.query("SELECT " + COLUMNS + " FROM trainer_payout WHERE " + String.join(" AND ", where)
                + " ORDER BY received_at DESC, id DESC LIMIT :limit", p, TrainerPayoutService::row);
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));
        return new PayoutPage(reads.workspaceCurrency(), page.items(), page.nextCursor());
    }

    @Transactional
    public Created create(UUID tid, Map<String, Object> raw) {
        var b = body(raw, "id", "amount", "method", "reference", "receivedAt", "note");
        UUID id = uuid(b.get("id"), "id");
        BigDecimal amount = amount(b.get("amount"), "amount", true);
        String method = payoutMethod(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        String note = text(b.get("note"), 500, "note");
        Instant at = b.get("receivedAt") == null ? Instant.now() : pastInstant(b.get("receivedAt"), "receivedAt");
        if (id != null) {
            var existing = find(tid, id);
            if (existing.isPresent()) return new Created(existing.get(), false);
        }
        var run = arrangements.running(tid).orElseThrow(() -> ApiException.conflict("ARRANGEMENT_REQUIRED",
                "Record your pay terms with the gym first."));

        UUID newId = id == null ? UUID.randomUUID() : id;
        var p = new HashMap<String, Object>();
        p.put("id", newId.toString());
        p.put("tid", tid.toString());
        p.put("gym", run.gymName());
        p.put("gp", run.gymPlaceId());
        p.put("amount", amount);
        p.put("cur", reads.workspaceCurrency());
        p.put("method", method);
        p.put("ref", reference);
        p.put("note", note);
        p.put("at", Timestamp.from(at));
        int n = jdbc.update("""
                INSERT INTO trainer_payout (id, trainer_id, gym_name, gym_place_id, amount, currency, method, reference, note, received_at)
                VALUES (:id::uuid, :tid::uuid, :gym, :gp::uuid, :amount, :cur, :method, :ref, :note, :at)
                ON CONFLICT (id) DO NOTHING
                """, p);
        if (n == 0) throw ApiException.idConflict();
        return new Created(find(tid, newId).orElseThrow(), true);
    }

    @Transactional
    public Payout patch(UUID tid, UUID id, String ifMatch, Map<String, Object> raw) {
        var b = body(raw, "amount", "method", "reference", "receivedAt", "note");
        var cur = find(tid, id).orElseThrow(() -> ApiException.notFound("That payout does not exist."));
        IfMatch.check(ifMatch, cur.version(), "This payout changed since you opened it.");
        if (b.isEmpty()) return cur;
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("amount", b.containsKey("amount") ? amount(b.get("amount"), "amount", true) : new BigDecimal(cur.amount()));
        p.put("method", b.containsKey("method") ? payoutMethod(b.get("method")) : cur.method());
        p.put("ref", b.containsKey("reference") ? text(b.get("reference"), 64, "reference") : cur.reference());
        p.put("note", b.containsKey("note") ? text(b.get("note"), 500, "note") : cur.note());
        p.put("at", Timestamp.from(b.containsKey("receivedAt") ? pastInstant(b.get("receivedAt"), "receivedAt")
                : Instant.ofEpochMilli(cur.receivedAt())));
        jdbc.update("""
                UPDATE trainer_payout SET amount = :amount, method = :method, reference = :ref, note = :note,
                                          received_at = :at
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        return find(tid, id).orElseThrow();
    }

    /** Soft, for a payout typed wrong; idempotent. */
    @Transactional
    public void delete(UUID tid, UUID id) {
        jdbc.update("""
                UPDATE trainer_payout SET deleted_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()));
    }

    Optional<Payout> find(UUID tid, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM trainer_payout WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", tid.toString()), TrainerPayoutService::row).stream().findFirst();
    }

    private static Payout row(ResultSet rs, int i) throws SQLException {
        Timestamp received = rs.getTimestamp("received_at");
        return new Payout(rs.getString("id"), rs.getString("gym_name"), rs.getString("gym_place_id"),
                PackageReadService.money(rs.getBigDecimal("amount")), rs.getString("currency"),
                rs.getString("method"), rs.getString("reference"), rs.getString("note"),
                received.getTime(), rs.getTimestamp("created_at").getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()), Cursor.key(received));
    }
}
