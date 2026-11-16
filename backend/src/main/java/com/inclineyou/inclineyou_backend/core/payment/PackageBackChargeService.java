package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * A new pack taking sessions that were delivered before it existed (V32, "option B", decided 9 Nov 2026).
 *
 * <p>A client who trained on an empty pack and renews on Wednesday owes for Monday — but whether Monday is taken from
 * the new pack is the trainer's call (they may have given it free), so the sale and the renew take exactly the
 * sessions they are sent and nothing else; there is no automatic back-charge. Each must still be waiting: this
 * client's, delivered, billed to a pack, uncharged, and for the pack's service. Runs inside the sale's transaction,
 * after the package is inserted, so the pack and its charges land together or not at all.
 */
@Service
@RequiredArgsConstructor
public class PackageBackChargeService {

    private final PackageJdbcRepository packages;

    /** The wire list, read before anything is locked: distinct ids, at most 500 (a pack's ceiling). */
    static List<UUID> read(Object raw) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw ApiException.validation("chargeSessionIds: a list of session ids");
        if (list.size() > 500) throw ApiException.validation("chargeSessionIds: at most 500");
        var ids = new LinkedHashSet<UUID>();
        for (Object one : list) {
            if (!(one instanceof String s)) throw ApiException.validation("chargeSessionIds: a list of session ids");
            try {
                if (!ids.add(UUID.fromString(s.strip()))) {
                    throw ApiException.validation("chargeSessionIds: " + s.strip() + " is listed twice");
                }
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("chargeSessionIds: " + s + " is not a session id");
            }
        }
        return new ArrayList<>(ids);
    }

    /**
     * Charge each named session to the package just sold. Refused whole (and the sale with it) when the pack is not a
     * session pack, has fewer sessions than were named, or any session is no longer waiting — charged in another tab,
     * reopened, made free, or not this client's: {@code 409 SESSION_NOT_UNCHARGED}, so the sheet refreshes its list
     * rather than selling a pack that quietly took fewer.
     */
    void take(UUID trainerId, UUID clientId, UUID packageId, String service, String basis, Integer sessions,
              List<UUID> ids) {
        if (ids.isEmpty()) return;
        if (!"sessions".equals(basis)) {
            throw ApiException.validation("chargeSessionIds: only a session pack can take delivered sessions");
        }
        if (sessions == null || ids.size() > sessions) {
            throw ApiException.validation("chargeSessionIds: more sessions than the pack has");
        }
        var waiting = packages.lockUncharged(trainerId, clientId, service, ids);
        if (waiting.size() != ids.size()) throw notWaiting();
        try {
            for (UUID sid : waiting) packages.insertSessionCharge(trainerId, packageId, clientId, sid);
        } catch (DuplicateKeyException e) {
            // uq_package_adjustment_live_charge: another pack took one between the check and the insert.
            throw notWaiting();
        }
        packages.closeIfUsedUp(packageId);
    }

    private static ApiException notWaiting() {
        return ApiException.conflict("SESSION_NOT_UNCHARGED",
                "One of those sessions was charged or changed since this opened. Refresh and pick again.");
    }
}
