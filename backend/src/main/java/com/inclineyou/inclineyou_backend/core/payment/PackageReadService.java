package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.Ledger;
import com.inclineyou.inclineyou_backend.core.payment.dto.LedgerFilter;
import com.inclineyou.inclineyou_backend.core.payment.dto.LedgerQuery;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentRow;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The money book's reads — api-contract Today L5 / Business L2.
 *
 * <p>The packages that matter today, with what has been paid and what is still owed computed on
 * the server: owing is what let the old screen's {@code GET /v1/payments} read every payment ever.
 * With {@code amountDue} on the package, the payments read can be a seven-day activity window.
 *
 * <p>The SQL is {@link PackageJdbcRepository}'s and {@link PaymentJdbcRepository}'s; this class
 * turns a query string into a checked filter, so a bad value is a 400 naming the parameter.
 */
@Service
@RequiredArgsConstructor
public class PackageReadService {

    private final PackageJdbcRepository packages;
    private final PaymentJdbcRepository payments;
    private final WorkspaceClock clock;

    private static final Set<String> PAYMENT_STATUSES = Set.of("pending", "paid", "write_off", "refund");
    private static final Set<String> METHODS = Set.of("upi", "cash", "bank_transfer");
    private static final Set<String> COLLECTORS = Set.of("trainer", "gym");
    private static final Set<String> CLIENT_TYPES = Set.of("independent", "gym");

    /**
     * {@code GET /v1/packages} — api-contract Today L5 and Client file L1.
     *
     * <p>{@code scope=current} is three sets, unioned: every live pack; every pack with money still
     * owed whatever its status (a finished pack can still be owed for); and each client's newest pack
     * even if closed, because the per-session rate and Renew both need the last agreed terms. Without
     * a scope, {@code clientId} gives every package that client bought. The shape is the same either
     * way — {@code scope} picks rows, never the shape.
     *
     * <p>Status is kept current by writes, not by this read: the charge that empties a pack closes it,
     * and the hourly {@code PackageExpirySweeper} (V29, {@code close_lapsed_packages}) closes the ones
     * more than 7 days past their end date. Reads never write.
     *
     * <p>{@code clientId} that is not on this trainer's roster is a 404, as every route answers for an
     * id that is not yours — an empty list would read as "no packs". Bounded, so no cursor; newest
     * first, then id.
     */
    @Transactional(readOnly = true)
    public List<CurrentPackage> list(UUID trainerId, boolean current, UUID clientId) {
        if (clientId != null && !packages.clientIsMine(trainerId, clientId)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        var rows = packages.list(trainerId, current, clientId, WorkspaceClock.today(clock.zone()));
        if (!current) return rows;
        // V32: what is already booked against these packs, so the booking panel can say whether one more is covered.
        var ahead = packages.bookedAhead(trainerId, clientId);
        return rows.stream()
                .map(r -> "sessions".equals(r.basis())
                        ? r.withBookedAhead(ahead.getOrDefault(r.clientId() + "|" + r.service(), 0)) : r)
                .toList();
    }

    /**
     * One client's {@code scope=current} packs and what each owes — the rows alone, for a caller that has already
     * checked the client is this trainer's (a drafted message, {@code NudgeDraftService}). Unlike {@link #list} it
     * does not check the client again and does not count the sessions booked ahead, which only the booking panel
     * reads; {@code sessionsBookedAhead} is left null.
     */
    public List<CurrentPackage> currentOfClient(UUID trainerId, UUID clientId) {
        return packages.list(trainerId, true, clientId, WorkspaceClock.today(clock.zone()));
    }

    /** One package in the L5 shape — what a write that creates one answers with. Empty if not this trainer's. */
    public Optional<CurrentPackage> one(UUID trainerId, UUID packageId) {
        return packages.one(trainerId, packageId);
    }

    /**
     * {@code GET /v1/payments} — api-contract Business L2, which Today L7 is the same endpoint of.
     * {@code from}/{@code to} are dates in the workspace timezone on {@code bookAt}, {@code to}
     * exclusive; Today asks for paid rows in the last seven days, twenty of them.
     *
     * <p>Keyset-paged on (bookAt, id) descending, 50 a page, at most 200. The 1.0 endpoint cut the
     * list at 500 rows without saying so; nothing is cut now — a non-null {@code nextCursor} says
     * there is more. V7's {@code payment.book_at} and {@code idx_payment_ledger} serve every page,
     * filtered or not, in order.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Ledger payments(UUID trainerId, LedgerQuery q) {
        var statuses = inList(q.status(), "status", PAYMENT_STATUSES);
        var methods = inList(q.method(), "method", METHODS);
        var collectors = inList(q.collectedBy(), "collectedBy", COLLECTORS);
        var clientTypes = inList(q.clientType(), "clientType", CLIENT_TYPES);
        UUID clientId = q.clientId() == null || q.clientId().isBlank() ? null : uuid(q.clientId(), "clientId");
        UUID packageId = q.packageId() == null || q.packageId().isBlank() ? null : uuid(q.packageId(), "packageId");
        LocalDate fromDate = WorkspaceClock.parseDate(q.from(), "from");
        LocalDate toDate = WorkspaceClock.parseDate(q.to(), "to");
        Instant from = null, to = null;
        if (fromDate != null || toDate != null) {
            var zone = clock.zone();
            if (fromDate != null) from = WorkspaceClock.startOf(fromDate, zone);
            if (toDate != null) to = WorkspaceClock.startOf(toDate, zone);
        }

        int n = Cursor.limit(q.limit(), 50, 200);
        // The cursor names the filters it came from: sent back with others it is a 400, not a page that
        // starts somewhere arbitrary. Lists are sorted, so the same filter in another order is the same query.
        String query = Cursor.mark(sorted(statuses), sorted(methods), sorted(collectors), sorted(clientTypes),
                clientId, packageId, fromDate, toDate);
        Cursor after = Cursor.within(q.cursor(), query);

        // An id that is not yours is a 404, as every route answers — an empty ledger would read as "no payments".
        if (clientId != null && !packages.clientIsMine(trainerId, clientId)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        if (packageId != null && !packages.packageIsMine(trainerId, packageId)) {
            throw ApiException.notFound("That package is not in your books.");
        }
        var filter = new LedgerFilter(statuses, methods, collectors, clientTypes, clientId, packageId, from, to, after, n);

        var rows = payments.page(trainerId, filter);
        var out = Page.of(rows, n, r -> Cursor.encodeFor(query, r.cursorKey(), r.id()));
        Integer total = q.includeTotal() ? payments.count(trainerId, filter) : null;
        return new Ledger(clock.currency(), out.items(), out.nextCursor(), total);
    }

    /** One payment in the ledger's shape — what every money write answers with. Empty if not this trainer's. */
    public Optional<PaymentRow> payment(UUID trainerId, UUID paymentId) {
        return payments.find(trainerId, paymentId);
    }

    private static String sorted(List<String> values) {
        return values == null ? null : String.join(",", new java.util.TreeSet<>(values));
    }

    /** A comma list checked against the allowed values; null when the parameter was not sent. */
    private static List<String> inList(String raw, String param, Set<String> allowed) {
        if (raw == null || raw.isBlank()) return null;
        var wanted = new ArrayList<String>();
        for (String s : raw.split(",")) {
            String v = s.strip();
            if (!allowed.contains(v)) throw ApiException.validation(param + ": unknown value " + v);
            if (!wanted.contains(v)) wanted.add(v);
        }
        return wanted;
    }

    private static UUID uuid(String raw, String param) {
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(param + ": not an id");
        }
    }
}
