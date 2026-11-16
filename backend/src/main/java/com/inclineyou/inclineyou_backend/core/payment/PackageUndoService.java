package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * {@code DELETE /v1/packages/{packageId}} — the Undo on a sale or a renew just made (decided 9 Nov 2026).
 *
 * <p>A mis-tapped Renew is a mistake, not a sale, so it is taken back without a trace: the package is soft-deleted
 * (every read filters {@code deleted_at}), not cancelled, and does not stay in the pack's history. That is only honest
 * while nothing else has happened to it, so it is allowed only within {@link #WINDOW_MINUTES} of the sale and only
 * while no payment row exists and no pause, extend, session-count change or later session charge was written. The
 * delivered sessions the sale took (option B, {@code chargeSessionIds}) are given back — their charges are reversed,
 * so they wait for a pack again. Anything older or used is ended with {@code POST /v1/packages/{id}/cancel} instead,
 * which keeps the record.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageUndoService {

    /** Long enough for a receipt's Undo and a second look; short enough that nobody has built on the sale. */
    static final int WINDOW_MINUTES = 10;

    private final PackageJdbcRepository packages;

    @Transactional
    public void undo(UUID trainerId, UUID packageId) {
        var t = packages.lockForUndo(trainerId, packageId, WINDOW_MINUTES)
                .orElseThrow(() -> ApiException.notFound("That package is not on your books."));
        // A retried Undo whose first attempt landed: the state asked for is already true.
        if (t.deleted()) return;
        // A single session's sale is never undone on its own (10 Nov 2026): that would leave the session booked or
        // delivered with nothing owed. Undo the booking itself within ten minutes (DELETE /v1/sessions/{id}), or cancel
        // the session, which asks whether to charge it.
        if (t.singleSale()) {
            throw new ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_SINGLE_SESSION",
                    "This is one session's own sale. Undo or cancel the session instead.");
        }
        if (t.touched()) {
            throw ApiException.conflict("PACKAGE_IN_USE",
                    "Money or sessions have been recorded on this pack since it was sold, so it can't be undone. End it instead.");
        }
        if (!t.fresh()) {
            throw ApiException.conflict("PACKAGE_UNDO_EXPIRED",
                    "It's been more than " + WINDOW_MINUTES + " minutes since this pack was sold. End it instead.");
        }
        int given = packages.reverseSaleCharges(packageId);
        packages.takeBack(packageId);
        log.info("package undone trainer={} package={} sessionsGivenBack={}", trainerId, packageId, given);
    }
}
