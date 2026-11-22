package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.Charged;
import com.inclineyou.inclineyou_backend.core.session.dto.Reversed;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionBilling;
import com.inclineyou.inclineyou_backend.core.session.dto.SingleSale;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/**
 * The charge a delivered or no-show session carries — shared by Mark done, a charged no-show, a charged cancel and a
 * billing change on a delivered session, so none of them can pick a different pack. Each runs inside the caller's
 * transaction, with the session row already locked.
 *
 * <p>What pays depends on the session's {@code billing} (V32): a {@code pack} session charges the client's live pack
 * for the service; a {@code trial} or {@code complimentary} one is never charged; a {@code single} one is charged to
 * its own sale.
 *
 * <h2>A single session is sold when it is booked (10 Nov 2026)</h2>
 *
 * Booking it means the client owes for it, due on the session's day ({@link #sell}). The sale then lives with the
 * session: a move moves its day, Undo within ten minutes drops it with the booking, a cancel or a no-show the trainer
 * chooses not to charge closes it ({@link #close} — kept, nothing owed), a reopen revives it ({@link #revive}), and
 * Mark done charges it. A reopen after Mark done takes the charge back but leaves the sale owed: the session was
 * booked, and it will happen again.
 */
@Service
@RequiredArgsConstructor
public class SessionChargeService {

    private final SessionStateJdbcRepository repo;
    private final WorkspaceClock clock;

    /**
     * Charge one session. A {@code pack} session whose best candidate is missing, paused or empty is still delivered —
     * it just is not charged, and the result says why ({@code NO_PACKAGE} · {@code PACKAGE_PAUSED} ·
     * {@code PACKAGE_EMPTY}). A free session answers {@code TRIAL} or {@code COMPLIMENTARY}: not charged, on purpose.
     */
    Charged charge(UUID trainerId, UUID clientId, UUID sessionId, String service) {
        return charge(trainerId, clientId, sessionId, service, repo.billing(sessionId).orElseThrow());
    }

    /** The same, with the session's billing already read under its lock (the batch mark reads it in that statement). */
    Charged charge(UUID trainerId, UUID clientId, UUID sessionId, String service, SessionBilling billing) {
        switch (billing.billing()) {
            case "trial" -> { return new Charged(false, null, null, "TRIAL"); }
            case "complimentary" -> { return new Charged(false, null, null, "COMPLIMENTARY"); }
            case "single" -> { return chargeSingle(trainerId, clientId, sessionId, service, billing); }
            default -> { /* pack */ }
        }
        var pack = repo.payingPack(clientId, service, billing.day());
        if (pack.isEmpty()) return new Charged(false, null, null, "NO_PACKAGE");
        var p = pack.get();
        if (p.paused()) return new Charged(false, p.id(), p.sessionsRemaining(), "PACKAGE_PAUSED");
        if (p.sessionsRemaining() <= 0) return new Charged(false, p.id(), 0, "PACKAGE_EMPTY");
        return take(trainerId, UUID.fromString(p.id()), clientId, sessionId);
    }

    /**
     * A single session is charged to its own sale. One closed by a cancel or an uncharged no-show is owed again first;
     * a session booked before sales were made at booking (or whose sale was refunded) is sold now. A gym client buys
     * only the gym's packs (check_package_client_type), so booking refuses single for one — and a client whose type
     * changed since is delivered uncharged rather than failing the mark.
     */
    private Charged chargeSingle(UUID trainerId, UUID clientId, UUID sessionId, String service, SessionBilling billing) {
        var sale = repo.sale(sessionId);
        if (sale.isPresent() && "cancelled".equals(sale.get().status())) {
            repo.reviveSale(UUID.fromString(sale.get().id()));
            sale = repo.sale(sessionId);
        }
        if (sale.isPresent() && "active".equals(sale.get().status()) && sale.get().sessionsRemaining() > 0
                && !sale.get().paused()) {
            return take(trainerId, UUID.fromString(sale.get().id()), clientId, sessionId);
        }
        if (sale.isPresent()) return new Charged(false, sale.get().id(), sale.get().sessionsRemaining(), "PACKAGE_EMPTY");
        if ("gym".equals(billing.clientType())) return new Charged(false, null, null, "SINGLE_GYM_CLIENT");
        UUID packageId = sell(trainerId, clientId, sessionId, service, billing);
        return take(trainerId, packageId, clientId, sessionId);
    }

    /** Make the sale a single session is paid by, at its price, due on its day. Answers the package id. */
    UUID sell(UUID trainerId, UUID clientId, UUID sessionId, String service, SessionBilling billing) {
        UUID packageId = UUID.randomUUID();
        repo.insertSinglePack(packageId, trainerId, clientId, sessionId, service, billing.price(), clock.currency(),
                billing.day());
        return packageId;
    }

    /**
     * The sale booking a single session makes — or a reopen, which books it again. A no-op for any other billing, when
     * the session already has a sale, and for a gym client (check_package_client_type): booking refuses single for one,
     * but a reopen can meet a client whose type changed since, who is left unsold as {@link #chargeSingle} leaves them
     * uncharged.
     */
    boolean sellAtBooking(UUID trainerId, UUID clientId, UUID sessionId, String service) {
        var billing = repo.billing(sessionId).orElseThrow();
        if (!"single".equals(billing.billing())) return false;
        if ("gym".equals(billing.clientType())) return false;
        if (repo.sale(sessionId).isPresent()) return false;
        sell(trainerId, clientId, sessionId, service, billing);
        return true;
    }

    /**
     * A cancel or a no-show the trainer chose not to charge: the session's sale is closed (status cancelled — kept, so
     * the money book shows it was sold and called off, and nothing is owed). Whatever was paid stays paid; a refund is
     * its own act ({@code POST /v1/packages/{id}/refund}). A no-op when the session has no open sale.
     */
    void close(UUID sessionId) {
        repo.sale(sessionId).filter(s -> "active".equals(s.status()))
                .ifPresent(s -> repo.closeSale(UUID.fromString(s.id())));
    }

    /** The other half of {@link #close}: the session was reopened, so its sale is owed again. True when one was. */
    boolean revive(UUID sessionId) {
        var closed = repo.sale(sessionId).filter(s -> "cancelled".equals(s.status()));
        closed.ifPresent(s -> repo.reviveSale(UUID.fromString(s.id())));
        return closed.isPresent();
    }

    /** The session's live sale, for the verbs that need its state (Undo, a billing change, a move). */
    Optional<SingleSale> sale(UUID sessionId) {
        return repo.sale(sessionId);
    }

    /**
     * A booked session stops being single, or changes price. Before money moved the sale is dropped (or repriced);
     * after, it is refused — the payment belongs to that sale, and moving it is a refund first.
     */
    void resell(UUID trainerId, UUID clientId, UUID sessionId, String service, String newBilling, BigDecimal newPrice) {
        var sale = repo.sale(sessionId);
        boolean single = "single".equals(newBilling);
        if (sale.isEmpty()) {
            if (single) sellAtBooking(trainerId, clientId, sessionId, service);
            return;
        }
        var k = sale.get();
        if (k.hasMoney()) {
            throw ApiException.conflict("SESSION_SALE_PAID",
                    "Money was recorded on this session's sale. Refund it first, then change how it's paid for.");
        }
        UUID id = UUID.fromString(k.id());
        if (!single) {
            repo.dropSale(id);
        } else {
            repo.repriceSale(id, newPrice);
            repo.reviveSale(id);
        }
    }

    private Charged take(UUID trainerId, UUID packageId, UUID clientId, UUID sessionId) {
        repo.insertCharge(trainerId, packageId, clientId, sessionId);
        // The charge that uses up the last session closes the pack in the same transaction (1.1, L5): an exhausted pack
        // no longer stays `active` until something else happens to touch it.
        return new Charged(true, packageId.toString(), repo.closeIfEmpty(packageId), null);
    }

    /**
     * Take back this session's live charge: it is reversed, never deleted, so the pack's history shows both facts. If
     * that charge was the one that used the pack up (R67), the pack goes back to active when its term allows. A single
     * session's sale goes back to active the same way and stays owed (10 Nov 2026): it was sold when it was booked.
     */
    Reversed reverse(UUID sessionId) {
        UUID packageId = UUID.fromString(repo.reverseCharge(sessionId));
        boolean reopened = repo.reopenPackIfWithinTerm(packageId, WorkspaceClock.today(clock.zone()));
        return new Reversed(packageId.toString(), repo.sessionsRemaining(packageId), reopened);
    }
}
