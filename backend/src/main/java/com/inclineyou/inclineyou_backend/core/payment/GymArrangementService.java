package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Arrangement;
import com.inclineyou.inclineyou_backend.core.payment.dto.ArrangementCreated;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentGym;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.YearMonth;
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

    private final GymArrangementJdbcRepository arrangements;
    private final WorkspaceClock clock;

    /** Every live row, the running one first, then by startsMonth newest first. */
    public List<Arrangement> list(UUID tid) {
        return arrangements.list(tid);
    }

    /** The running arrangement, if any. */
    Optional<Arrangement> running(UUID tid) {
        return arrangements.running(tid);
    }

    /** The gym the trainer is with now, as their profile holds it. */
    Optional<CurrentGym> currentGym(UUID tid) {
        return arrangements.currentGym(tid);
    }

    @Transactional
    public ArrangementCreated create(UUID tid, Map<String, Object> raw) {
        var b = body(raw, "id", "baseKind", "baseAmount", "startsMonth", "note");
        UUID id = uuid(b.get("id"), "id");
        YearMonth starts = month(b.get("startsMonth"), "startsMonth");
        if (starts == null) throw ApiException.validation("startsMonth: required, as yyyy-MM");
        String kind = kind(b.get("baseKind"));
        BigDecimal base = b.get("baseAmount") == null ? BigDecimal.ZERO : amount(b.get("baseAmount"), "baseAmount", false);
        baseShape(kind, base);
        String note = text(b.get("note"), 500, "note");

        if (id != null) {
            var existing = arrangements.find(tid, id);
            if (existing.isPresent()) return new ArrangementCreated(existing.get(), false);
        }
        // The gym the trainer is with now: its name as a snapshot, and the directory place when it was picked from the search.
        var current = arrangements.currentGym(tid).orElse(null);
        if (current == null || current.name().isBlank()) {
            throw ApiException.conflict("ARRANGEMENT_NEEDS_GYM", "Set your gym's name in Settings first.");
        }

        // The running row is locked so two taps cannot both close it.
        var run = arrangements.lockRunning(tid);
        if (run.isPresent() && !starts.isAfter(run.get().startsMonth())) {
            throw ApiException.conflict("ARRANGEMENT_OVERLAP",
                    "New terms must start after the running terms began (" + run.get().startsMonth() + ").");
        }
        // A closed row that already covers the start month would overlap too.
        if (arrangements.closedCovering(tid, starts) > 0) {
            throw ApiException.conflict("ARRANGEMENT_OVERLAP", "Those months are already covered by earlier terms.");
        }
        if (run.isPresent()) arrangements.close(run.get().id(), starts.minusMonths(1));

        UUID newId = id == null ? UUID.randomUUID() : id;
        int n = arrangements.insert(newId, tid, current, kind, base, clock.currency(), starts, note);
        if (n == 0) throw ApiException.idConflict();
        return new ArrangementCreated(arrangements.find(tid, newId).orElseThrow(), true);
    }

    @Transactional
    public Arrangement patch(UUID tid, UUID id, String ifMatch, Map<String, Object> raw) {
        var b = body(raw, "baseKind", "baseAmount", "note");
        var cur = arrangements.find(tid, id).orElseThrow(() -> ApiException.notFound("Those terms do not exist."));
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
        String note = b.containsKey("note") ? text(b.get("note"), 500, "note") : cur.note();
        arrangements.update(id, tid, kind, base, note);
        return arrangements.find(tid, id).orElseThrow();
    }

    /** Soft, for terms entered by mistake; idempotent. The months it covered fall back to shares only. */
    @Transactional
    public void delete(UUID tid, UUID id) {
        arrangements.softDelete(tid, id);
    }

    Optional<Arrangement> find(UUID tid, UUID id) {
        return arrangements.find(tid, id);
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
}
