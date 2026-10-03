package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Arrangement;
import com.inclineyou.inclineyou_backend.core.payment.dto.GymMoney;
import com.inclineyou.inclineyou_backend.core.payment.dto.GymPack;
import com.inclineyou.inclineyou_backend.core.payment.dto.GymShare;
import com.inclineyou.inclineyou_backend.core.payment.dto.GymStats;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackSales;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutRecord;
import com.inclineyou.inclineyou_backend.core.payment.dto.Settlement;
import com.inclineyou.inclineyou_backend.core.payment.dto.SettlementMonth;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
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

    private final GymMoneyJdbcRepository money;
    private final TrainerPayoutJdbcRepository payouts;
    private final WorkspaceClock clock;
    private final GymArrangementService arrangements;

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

        var gym = arrangements.currentGym(tid).orElse(null);
        String gymName = gym == null ? null : gym.name();

        // ── stats: floor vs the trainer's own books ──
        var s = money.saleStats(tid, first, last);
        BigDecimal floorBilled = s.floorBilled(), gymCut = s.gymCut(), remoteBilled = s.remoteBilled();
        double cutPercent = floorBilled.signum() == 0 ? 0
                : gymCut.multiply(BigDecimal.valueOf(100)).divide(floorBilled, 1, RoundingMode.HALF_UP).doubleValue();
        var stats = new GymStats(money(floorBilled), s.floorSessions(), money(gymCut),
                cutPercent, money(remoteBilled), s.remoteSessions(),
                money(floorBilled.add(remoteBilled).subtract(gymCut)));

        return new GymMoney(clock.currency(), gymName, stats, shares(tid, first, last),
                settlement(tid, first, last, gymName == null ? null : key(gym.placeId(), gymName)));
    }

    // ── per-pack ──

    private List<GymShare> shares(UUID tid, YearMonth first, YearMonth last) {
        // Grouped by the pack a package came from; each package's OWN share is what counts, since a sale may override.
        var sold = money.salesByPack(tid, first, last);
        var out = new ArrayList<GymShare>();
        var seen = new java.util.HashSet<String>();
        // The price list's gym packs first, in the trainer's own order, sold or not.
        for (var r : money.activeGymPacks(tid)) {
            seen.add(r.id());
            out.add(share(r.id(), r.name(), r.amount(), r.trainerSharePercent(), r.trainerShareAmount(), sold.get(r.id())));
        }
        // Retired or deleted packs, and custom sales, that still sold in the span.
        for (var e : sold.entrySet()) {
            if (seen.contains(e.getKey())) continue;
            if (e.getKey().isEmpty()) {
                out.add(share(null, "Custom gym sale", null, null, null, e.getValue()));
                continue;
            }
            GymPack r = money.pack(e.getKey());
            out.add(share(e.getKey(), r.name(), r.amount(), r.trainerSharePercent(), r.trainerShareAmount(), e.getValue()));
        }
        return out;
    }

    private static GymShare share(String id, String name, BigDecimal price, BigDecimal pct, BigDecimal amt, PackSales soldObj) {
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
        return new GymShare(id, name, pct, money(amt), gymPct, money(gymAmt), sold, money(billed), money(take),
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

        // Money the gym took for the trainer, by the month it counts in (refunds already negative).
        var share = new HashMap<YearMonth, BigDecimal>();
        var clients = new HashMap<YearMonth, Integer>();
        YearMonth start = first;
        for (var a : arrs) start = min(start, YearMonth.parse(a.startsMonth()));
        for (var ms : money.shareByMonth(tid, zone)) {
            var m = YearMonth.parse(ms.month());
            share.put(m, ms.share());
            clients.put(m, ms.clients());
        }
        for (var m : share.keySet()) start = min(start, m);
        var payoutRows = payouts.all(tid);
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
            for (PayoutRecord po : payoutRows) {
                if (e.getKey().equals(key(po.gymPlaceId(), po.gymName()))) pool = pool.add(po.amount());
            }
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
        return new Settlement(running, new ArrayList<>(rows.values()), money(balanceDue), payouts.recent(tid, fallbackGym));
    }

    private static YearMonth min(YearMonth a, YearMonth b) { return b.isBefore(a) ? b : a; }

    private static String money(BigDecimal v) { return Money.format(v); }
}
