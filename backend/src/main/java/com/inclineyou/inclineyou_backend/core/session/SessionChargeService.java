package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.Charged;
import com.inclineyou.inclineyou_backend.core.session.dto.Reversed;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * The pack charge a delivered or no-show session carries — shared by Mark done and a charged no-show, so the two can
 * never pick different packs. Both run inside the caller's transaction, with the session row already locked.
 */
@Service
@RequiredArgsConstructor
public class SessionChargeService {

    private final SessionStateJdbcRepository repo;
    private final WorkspaceClock clock;

    /**
     * Charge one session to the pack that should pay for it: this client's live session pack for the same service
     * (floor, home_visit or remote). If the best candidate is paused or empty the session is still delivered — it just
     * is not charged, and the result says why.
     */
    Charged charge(UUID trainerId, UUID clientId, UUID sessionId, String service) {
        var pack = repo.payingPack(clientId, service);
        if (pack.isEmpty()) return new Charged(false, null, null, "NO_PACKAGE");
        var p = pack.get();
        if (p.paused()) return new Charged(false, p.id(), p.sessionsRemaining(), "PACKAGE_PAUSED");
        if (p.sessionsRemaining() <= 0) return new Charged(false, p.id(), 0, "PACKAGE_EMPTY");

        repo.insertCharge(trainerId, UUID.fromString(p.id()), clientId, sessionId);
        // The charge that uses up the last session closes the pack in the same transaction (1.1, L5): an exhausted pack
        // no longer stays `active` until something else happens to touch it.
        return new Charged(true, p.id(), repo.closeIfEmpty(UUID.fromString(p.id())), null);
    }

    /**
     * Take back this session's live charge: it is reversed, never deleted, so the pack's history shows both facts. If
     * that charge was the one that used the pack up (R67), the pack goes back to active when its term allows.
     */
    Reversed reverse(UUID sessionId) {
        UUID packageId = UUID.fromString(repo.reverseCharge(sessionId));
        boolean reopened = repo.reopenPackIfWithinTerm(packageId, WorkspaceClock.today(clock.zone()));
        return new Reversed(packageId.toString(), repo.sessionsRemaining(packageId), reopened);
    }
}
