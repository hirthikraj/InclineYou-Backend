package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.payment.GymInput.MAX_MONTHS;

/**
 * {@code GET /v1/money/gym} — api-contract Business: the split on gym clients'
 * money for a span, and what the gym owes the trainer.
 *
 * <p>The split comes from each package's own trainer share (R3, R52), never a
 * trainer-wide percentage, and the gym's part is only ever DERIVED — package
 * price less the trainer's share — so there is nothing to keep in step. "Floor"
 * is a package sold with a share (a gym pack, floor only by the schema);
 * "remote" is everything the trainer sells on their own books.
 *
 * <p>Beyond the contract's {@code shares[]} terms, each pack row carries what it
 * actually did in the span — {@code sold}, {@code billed}, {@code trainerTake},
 * {@code gymCut} — so a trainer can see which gym pack earns what.
 *
 * <p>The per-payment rows are not here: they are the ledger with
 * {@code clientType=gym}, which pages.
 */
@Service
@RequiredArgsConstructor
public class GymMoneyService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService reads;
    private final GymArrangementService arrangements;

    public record Stats(String floorBilled, long floorSessions, String gymCut, double gymCutPercent,
                        String remoteBilled, long remoteSessions, String yours) {}

    public record Share(String packId, String packName, BigDecimal trainerSharePercent, String trainerShareAmount,
                        /** What the gym keeps of one sale at the pack's price — derived, never stored. */
                        BigDecimal gymSharePercent, String gymShareAmount,
                        int sold, String billed, String trainerTake, String gymCut) {}

    public record SettlementMonth(String month, boolean soFar, int clients, String yourShare, String owed,
                                  String received, String balance) {}

    public record Recent(String id, String amount, String method, String reference, long receivedAt, String note) {}

    public record Settlement(GymArrangementService.Arrangement arrangement, List<SettlementMonth> months,
                             String balanceDue, List<Recent> recentPayouts) {}

    public record GymMoney(String currency, String gymName, Stats stats, List<Share> shares, Settlement settlement) {}

    /** Trainer's part of one package, as SQL: a percentage or a flat amount, else all of it. */
    private static final String TAKE = "(k.amount - gym_cut(k.amount, k.trainer_share_percent, k.trainer_share_amount))";
    private static final String HAS_SHARE = "(k.trainer_share_percent IS NOT NULL OR k.trainer_share_amount IS NOT NULL)";

    public GymMoney get(UUID tid, String from, String to) {
        var zone = clock.zone();
        YearMonth first, last;
        if (from == null && to == null) {
            first = last = YearMonth.now(zone);
        } else {
            first = GymInput.month(from, "from");
            last = GymInput.month(to, "to");
            if (first == null || last == null) throw ApiException.validation("from and to: both, as yyyy-MM");
            if (last.isBefore(first)) throw ApiException.validation("to: must not be before from");
        }
        if (first.until(last, ChronoUnit.MONTHS) + 1 > MAX_MONTHS) {
            throw ApiException.rangeTooLarge("at most " + MAX_MONTHS + " months in one request");
        }
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("firstDay", Date.valueOf(first.atDay(1)));
        p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));

        var gymRow = jdbc.query("SELECT gym_name, gym_place_id::text FROM trainer_business WHERE trainer_id = :tid::uuid", p,
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}).stream().filter(r -> r[0] != null).findFirst().orElse(null);
        String gymName = gymRow == null ? null : gymRow[0];

        // ── stats: floor vs the trainer's own books ──
        var s = jdbc.queryForMap("""
                SELECT coalesce(sum(k.amount) FILTER (WHERE %1$s), 0) AS floor_billed,
                       coalesce(sum(k.sessions_total) FILTER (WHERE %1$s), 0) AS floor_sessions,
                       coalesce(sum(k.amount - %2$s) FILTER (WHERE %1$s), 0) AS gym_cut,
                       coalesce(sum(k.amount) FILTER (WHERE NOT %1$s), 0) AS remote_billed,
                       coalesce(sum(k.sessions_total) FILTER (WHERE NOT %1$s), 0) AS remote_sessions
                FROM package k
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                """.formatted(HAS_SHARE, TAKE), p);
        BigDecimal floorBilled = dec(s.get("floor_billed")), gymCut = dec(s.get("gym_cut")),
                remoteBilled = dec(s.get("remote_billed"));
        double cutPercent = floorBilled.signum() == 0 ? 0
                : gymCut.multiply(BigDecimal.valueOf(100)).divide(floorBilled, 1, RoundingMode.HALF_UP).doubleValue();
        var stats = new Stats(money(floorBilled), ((Number) s.get("floor_sessions")).longValue(), money(gymCut),
                cutPercent, money(remoteBilled), ((Number) s.get("remote_sessions")).longValue(),
                money(floorBilled.add(remoteBilled).subtract(gymCut)));

        return new GymMoney(reads.workspaceCurrency(), gymName, stats, shares(p), settlement(tid, first, last, gymName == null ? null : key(gymRow[1], gymName)));
    }

    // ── per-pack ──

    private record Sold(int sold, BigDecimal billed, BigDecimal take) {}

    private List<Share> shares(Map<String, Object> p) {
        var sold = new LinkedHashMap<String, Sold>();
        // Grouped by the pack a package came from; each package's OWN share is what counts, since a sale may override.
        jdbc.query("""
                SELECT coalesce(k.pack_id::text, '') AS pid, count(*) AS sold, sum(k.amount) AS billed,
                       sum(%2$s) AS take, max(pk.name) AS pname, max(pk.amount) AS pamount,
                       max(pk.trainer_share_percent) AS ppct, max(pk.trainer_share_amount) AS pamt,
                       max(pk.order_index) AS ord
                FROM package k LEFT JOIN pack pk ON pk.id = k.pack_id
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %1$s
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                GROUP BY 1
                """.formatted(HAS_SHARE, TAKE), p, rs -> {
            String pid = rs.getString("pid");
            sold.put(pid, new Sold(rs.getInt("sold"), rs.getBigDecimal("billed"), rs.getBigDecimal("take")));
        });
        var out = new ArrayList<Share>();
        var seen = new java.util.HashSet<String>();
        // The price list's gym packs first, in the trainer's own order, sold or not.
        for (var r : jdbc.queryForList("""
                SELECT id::text AS id, name, amount, trainer_share_percent, trainer_share_amount
                FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND owner = 'gym' AND status = 'active'
                ORDER BY order_index, id""", p)) {
            seen.add((String) r.get("id"));
            out.add(share((String) r.get("id"), (String) r.get("name"), dec(r.get("amount")),
                    (BigDecimal) r.get("trainer_share_percent"), (BigDecimal) r.get("trainer_share_amount"),
                    sold.get((String) r.get("id"))));
        }
        // Retired or deleted packs, and custom sales, that still sold in the span.
        for (var e : sold.entrySet()) {
            if (seen.contains(e.getKey())) continue;
            if (e.getKey().isEmpty()) {
                out.add(share(null, "Custom gym sale", null, null, null, e.getValue()));
                continue;
            }
            var r = jdbc.queryForMap("SELECT name, amount, trainer_share_percent, trainer_share_amount FROM pack WHERE id = :id::uuid",
                    Map.of("id", e.getKey()));
            out.add(share(e.getKey(), (String) r.get("name"), dec(r.get("amount")),
                    (BigDecimal) r.get("trainer_share_percent"), (BigDecimal) r.get("trainer_share_amount"), e.getValue()));
        }
        return out;
    }

    private static Share share(String id, String name, BigDecimal price, BigDecimal pct, BigDecimal amt, Sold soldObj) {
        int sold = 0;
        BigDecimal billed = BigDecimal.ZERO, take = BigDecimal.ZERO;
        if (soldObj != null) {
            sold = soldObj.sold();
            billed = soldObj.billed();
            take = soldObj.take();
        }
        // What the gym keeps of one sale at the pack's own price.
        BigDecimal gymPct = null, gymAmt = null;
        if (price != null && price.signum() > 0 && (pct != null || amt != null)) {
            BigDecimal trainerPart = pct != null ? price.multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP) : amt;
            gymAmt = price.subtract(trainerPart);
            gymPct = BigDecimal.valueOf(100).subtract(trainerPart.multiply(BigDecimal.valueOf(100))
                    .divide(price, 2, RoundingMode.HALF_UP));
        } else if (pct != null) {
            gymPct = BigDecimal.valueOf(100).subtract(pct);
        }
        return new Share(id, name, pct, money(amt), gymPct, money(gymAmt), sold, money(billed), money(take),
                money(billed.subtract(take)));
    }

    // ── settlement ──

    /**
     * What makes two rows the same gym: the directory place when there is one, else the typed name
     * (case-insensitive). A place cannot be split by a rename or a typo; free text still can, which
     * is the price of not picking from the search.
     */
    static String key(String gymPlaceId, String gymName) {
        return gymPlaceId != null ? "p:" + gymPlaceId : "n:" + (gymName == null ? "" : gymName.strip().toLowerCase());
    }

    private Settlement settlement(UUID tid, YearMonth first, YearMonth last, String currentGym) {
        var zone = clock.zone();
        var arrs = arrangements.list(tid);
        if (arrs.isEmpty()) return null;
        var running = arrs.stream().filter(a -> a.endsMonth() == null).findFirst().orElse(null);
        YearMonth thisMonth = YearMonth.now(zone);

        var tp = Map.<String, Object>of("tid", tid.toString(), "tz", zone.getId());
        // Money the gym took for the trainer, by the month it counts in (refunds already negative).
        var share = new HashMap<YearMonth, BigDecimal>();
        var clients = new HashMap<YearMonth, Integer>();
        YearMonth start = first;
        for (var a : arrs) start = min(start, YearMonth.parse(a.startsMonth()));
        jdbc.query("""
                SELECT to_char(coalesce(paid_at, refunded_at) AT TIME ZONE :tz, 'YYYY-MM') AS m,
                       sum(share) AS s, count(DISTINCT client_id) AS c
                FROM payment_trainer_share WHERE trainer_id = :tid::uuid GROUP BY 1""", tp, rs -> {
            var m = YearMonth.parse(rs.getString("m"));
            share.put(m, rs.getBigDecimal("s"));
            clients.put(m, rs.getInt("c"));
        });
        for (var m : share.keySet()) start = min(start, m);
        var payouts = jdbc.query("""
                SELECT gym_name, amount, received_at, gym_place_id::text FROM trainer_payout
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL""", tp,
                (rs, i) -> new Object[]{key(rs.getString(4), rs.getString(1)), rs.getBigDecimal(2),
                        YearMonth.from(rs.getTimestamp(3).toInstant().atZone(zone))});
        // Months after the current one owe nothing yet, so the table stops there.
        YearMonth end = thisMonth;
        var fallback = running != null ? running : arrs.get(0);
        String fallbackGym = running != null ? key(running.gymPlaceId(), running.gymName())
                : currentGym != null ? currentGym : key(fallback.gymPlaceId(), fallback.gymName());

        // Per gym: how much owed per month, oldest first, then the payouts poured in oldest-first.
        var rows = new LinkedHashMap<YearMonth, SettlementMonth>();
        var byGym = new LinkedHashMap<String, List<YearMonth>>();
        var owedBy = new HashMap<YearMonth, BigDecimal>();
        var gymOf = new HashMap<YearMonth, String>();
        for (YearMonth mm = start; !mm.isAfter(end); mm = mm.plusMonths(1)) {
            final YearMonth m = mm;
            var covering = arrs.stream().filter(a -> !m.isBefore(YearMonth.parse(a.startsMonth()))
                    && (a.endsMonth() == null || !m.isAfter(YearMonth.parse(a.endsMonth())))).findFirst().orElse(null);
            BigDecimal yourShare = share.getOrDefault(m, BigDecimal.ZERO);
            BigDecimal positive = yourShare.max(BigDecimal.ZERO);
            BigDecimal owed = positive;
            if (covering != null && covering.baseKind() != null) {
                BigDecimal base = new BigDecimal(covering.baseAmount());
                owed = "minimum".equals(covering.baseKind()) ? base.max(positive) : base.add(positive);
            }
            String gym = covering != null ? key(covering.gymPlaceId(), covering.gymName()) : fallbackGym;
            owedBy.put(m, owed);
            gymOf.put(m, gym);
            byGym.computeIfAbsent(gym, g -> new ArrayList<>()).add(m);
        }
        var received = new HashMap<YearMonth, BigDecimal>();
        for (var e : byGym.entrySet()) {
            BigDecimal pool = BigDecimal.ZERO;
            for (var po : payouts) if (e.getKey().equals(po[0])) pool = pool.add((BigDecimal) po[1]);
            for (YearMonth m : e.getValue()) {
                boolean running1 = m.equals(thisMonth);
                // The running month takes whatever is left: it owes nothing yet, but money paid ahead belongs somewhere.
                BigDecimal applied = running1 ? pool : pool.min(owedBy.get(m));
                received.put(m, applied);
                pool = pool.subtract(applied);
            }
        }
        BigDecimal balanceDue = BigDecimal.ZERO;
        for (YearMonth m = start; !m.isAfter(end); m = m.plusMonths(1)) {
            boolean soFar = m.equals(thisMonth);
            BigDecimal bal = owedBy.get(m).subtract(received.get(m));
            if (!soFar) balanceDue = balanceDue.add(bal);
            if (m.isBefore(first) || m.isAfter(last)) continue;
            rows.put(m, new SettlementMonth(m.toString(), soFar, clients.getOrDefault(m, 0),
                    money(share.getOrDefault(m, BigDecimal.ZERO)), money(owedBy.get(m)), money(received.get(m)),
                    soFar ? null : money(bal)));
        }
        var recent = jdbc.query("""
                SELECT id::text, amount, method, reference, received_at, note FROM trainer_payout
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND CASE WHEN gym_place_id IS NOT NULL THEN 'p:' || gym_place_id::text
                           ELSE 'n:' || lower(btrim(gym_name)) END = :gym
                ORDER BY received_at DESC, id DESC LIMIT 5""",
                Map.of("tid", tid.toString(), "gym", fallbackGym),
                (rs, i) -> new Recent(rs.getString(1), money(rs.getBigDecimal(2)), rs.getString(3), rs.getString(4),
                        rs.getTimestamp(5).getTime(), rs.getString(6)));
        return new Settlement(running, new ArrayList<>(rows.values()), money(balanceDue), recent);
    }

    private static YearMonth min(YearMonth a, YearMonth b) { return b.isBefore(a) ? b : a; }

    private static BigDecimal dec(Object o) { return o == null ? BigDecimal.ZERO : (BigDecimal) (o instanceof BigDecimal b ? b : new BigDecimal(o.toString())); }

    private static String money(BigDecimal v) { return PackageReadService.money(v); }
}
