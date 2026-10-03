package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.NewPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackageWrite;
import com.inclineyou.inclineyou_backend.core.payment.dto.RenewRequest;
import com.inclineyou.inclineyou_backend.core.payment.dto.RenewSource;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/packages/{packageId}/renew} — sell the same pack again, with
 * the terms copied here rather than sent by the browser (api-contract Today A3).
 *
 * <p>Which terms (R5, decided 26 Sep): when the old package came off a price-list
 * pack that is still active, the pack's CURRENT name, service, basis, sessions,
 * price, validity and trainer share; otherwise — a custom package, or a pack
 * since retired — the old package's own terms, its length included. A discount
 * is never copied: it was the reason for one sale, not a term of the pack.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageRenewService {

    private final PackageJdbcRepository packages;
    private final WorkspaceClock clock;

    @Transactional
    public PackageWrite renew(UUID trainerId, UUID packageId, RenewRequest req) {
        RenewRequest r = req == null ? new RenewRequest(null, null) : req;
        // Input first, so a malformed request is a 400 whatever state the pack is in.
        UUID newId = parseId(r.id());
        LocalDate parsedStart = WorkspaceClock.parseDate(r.startDate(), "startDate");

        // Fast path: a retry of a renew that already landed answers with what it
        // made. Checked again under the client lock below, because a retry racing
        // its first attempt sees no row here.
        if (newId != null) {
            var replay = replay(trainerId, newId, packageId);
            if (replay != null) return replay;
        }
        var old = packages.renewSource(trainerId, packageId)
                .orElseThrow(() -> ApiException.notFound("That package is not on your books."));
        UUID clientId = UUID.fromString(old.clientId());

        boolean fromPack = old.packLive();
        String service = fromPack ? old.packService() : old.service();

        /*
         * The double-sell guard. Locking the client row serialises two renews of
         * the same client, and the second then sees the first one's package.
         *
         * It refuses when a running, unpaused pack for the same service exists
         * that is NEWER than the one being renewed — i.e. this one has already
         * been renewed. The contract's literal wording ("an active pack with
         * sessions left") would refuse the ordinary case: the queue offers Renew
         * precisely while the current pack still has a session or two left.
         */
        packages.lockClientRow(clientId);
        // Under the lock a concurrent first attempt with the same id has
        // committed and is visible: that is a replay (200), and must be answered
        // before the guard below reads its package as "already renewed".
        if (newId != null) {
            var replay = replay(trainerId, newId, packageId);
            if (replay != null) return replay;
        }
        if (packages.renewedSince(clientId, service, packageId, old.createdAt())) throw PackageRuleException.alreadyRenewed();

        LocalDate start = parsedStart != null ? parsedStart : WorkspaceClock.today(clock.zone());

        String basis = fromPack ? old.packBasis() : old.basis();
        Integer sessions = fromPack ? old.packSessions() : old.sessionsTotal();
        Integer validityDays = fromPack ? old.packValidity() : lengthInDays(old);

        UUID made = newId == null ? UUID.randomUUID() : newId;
        // tenant_id is stamped by the trigger; due on the day it starts.
        int inserted = packages.insert(new NewPackage(made, trainerId, clientId,
                old.packId() == null ? null : UUID.fromString(old.packId()),
                fromPack ? old.packName() : old.name(), service, basis,
                "sessions".equals(basis) ? sessions : null,
                fromPack ? old.packAmount() : old.amount(), null,
                fromPack ? old.packCurrency() : old.currency(),
                start, validityDays == null ? null : start.plusDays(validityDays), start,
                fromPack ? old.packSharePercent() : old.sharePercent(),
                fromPack ? old.packShareAmount() : old.shareAmount()));
        log.info("package renewed trainer={} from={} to={} fromPack={}", trainerId, packageId, made, fromPack);

        // Nothing inserted: the id is taken by a row this trainer cannot see
        // (another workspace; a visible one was answered as a replay above). A
        // collided id, never reported as a package this call created.
        if (inserted == 0) throw ApiException.idConflict();
        return new PackageWrite(packages.one(trainerId, made).orElseThrow(ApiException::idConflict), true);
    }

    /**
     * The package an earlier attempt with this id made, as a replay (200) —
     * only when it is this trainer's, for the same client as the package being
     * renewed. The same id anywhere else is ID_CONFLICT, and says nothing more.
     * Null when no row has the id yet.
     */
    private PackageWrite replay(UUID trainerId, UUID newId, UUID renewedId) {
        var mine = packages.renewReplayMine(trainerId, newId, renewedId);
        if (mine.isEmpty()) return null;
        if (!mine.get()) throw ApiException.idConflict();
        return new PackageWrite(packages.one(trainerId, newId).orElseThrow(ApiException::idConflict), false);
    }

    /** A custom package repeats its own length: end − start, when it had both. */
    private static Integer lengthInDays(RenewSource old) {
        if (old.startDate() != null && old.endDate() != null) {
            return (int) (old.endDate().toLocalDate().toEpochDay() - old.startDate().toLocalDate().toEpochDay());
        }
        return null;
    }

    private static UUID parseId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("id: not a UUID");
        }
    }
}
