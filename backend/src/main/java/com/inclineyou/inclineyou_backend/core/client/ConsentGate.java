package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * WHAT A TRAINER MAY DO FOR A CLIENT WHO HAS NOT CONSENTED YET (22 Nov 2026, the owner's call).
 *
 * Consent is the client accepting their invite — the privacy notice, their own date of birth and, from V42, a required
 * "fit to train and I accept the coaching terms" tick on the same page. Until then the trainer works on the business
 * record only (name, number, date of birth, type, packs, money, bookings, the week) and is refused, with one code,
 * {@code 409 CONSENT_REQUIRED}, on:
 *
 * <ul>
 *   <li><b>a third delivered session</b> — {@link #FREE_SESSIONS} may be run first (a demo counts), because the client
 *       is often standing in the gym before they have opened the link. Delivered = marked done, or its log opened;
 *       no-shows, cancellations and bookings never count, and a log already open can always be finished;</li>
 *   <li><b>health and body data</b> — assessments (create, readings, a measuring cycle);</li>
 *   <li><b>the personal profile</b> — goal, height and activity level after the client was added;</li>
 *   <li><b>the trainer's notes</b> — writing or editing one, or sharing it. Unsharing, unpinning, deleting and an
 *       Undo stay open: taking data away never needs consent.</li>
 * </ul>
 *
 * Downloads of a client's data (the progress report card) are painted in the browser from reads every tab needs, so
 * that lock is the web's. A SOFT block in the product's sense: the code says what is missing and the web offers the
 * invite on the spot; nothing already recorded is touched, and reads are never refused.
 *
 * Consented = {@code membership_status} accepted, or paused (a paused portal is still a consent given), or removed by
 * the trainer AFTER accepting (the client's consent was given and never withdrawn; a removed client cannot be booked or
 * logged anyway). Declined, invited, never-invited and a removal before any acceptance are not.
 *
 * {@code FREE_SESSIONS} has a twin in the web's {@code lib/clients/setup.ts}. Change both.
 */
@Component
@RequiredArgsConstructor
public class ConsentGate {

    /** Sessions a trainer may deliver before the client consents (decided 22 Nov 2026). */
    public static final int FREE_SESSIONS = 2;

    public static final String CODE = "CONSENT_REQUIRED";

    private final NamedParameterJdbcTemplate jdbc;

    /** True for a client who has given consent — see the class note. False when the row is not visible. */
    public boolean consented(UUID clientId) {
        return jdbc.query(
                "SELECT membership_status IN ('accepted', 'paused') OR (membership_status = 'removed' AND accepted_at IS NOT NULL) "
                        + "FROM client WHERE id = :c::uuid",
                Map.of("c", clientId.toString()), (rs, i) -> rs.getBoolean(1)).stream().findFirst().orElse(false);
    }

    /** Sessions delivered to this client so far, leaving one out (the one being delivered now). */
    public int delivered(UUID clientId, UUID except) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND id <> :s::uuid AND deleted_at IS NULL "
                        + "AND (status = 'done' OR started_at IS NOT NULL)",
                Map.of("c", clientId.toString(), "s", except.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * True when delivering {@code sessionId} now would go past the free sessions for an unconsented client. A session
     * whose log is already open was counted when it opened, so finishing or marking it is never refused.
     */
    public boolean blocksSession(UUID clientId, UUID sessionId) {
        if (consented(clientId)) return false;
        boolean open = jdbc.query("SELECT started_at IS NOT NULL FROM scheduled_session WHERE id = :s::uuid",
                Map.of("s", sessionId.toString()), (rs, i) -> rs.getBoolean(1)).stream().findFirst().orElse(false);
        if (open) return false;
        return delivered(clientId, sessionId) >= FREE_SESSIONS;
    }

    /** Refuse delivering {@code sessionId} past the free sessions. */
    public void requireForSession(UUID clientId, UUID sessionId) {
        if (blocksSession(clientId, sessionId)) throw sessionRefusal();
    }

    /** Refuse a write that needs consent outright — health data, the profile, notes. {@code what} names it. */
    public void require(UUID clientId, String what) {
        if (!consented(clientId)) throw refusal(what);
    }

    public static ApiException sessionRefusal() {
        return ApiException.conflict(CODE, "This client has had " + FREE_SESSIONS + " sessions without consent. "
                + "Send the invite, or show its QR code, so they can accept it before the next one.");
    }

    public static ApiException refusal(String what) {
        return ApiException.conflict(CODE, "The client hasn't accepted their invite yet, so " + what
                + " can't be recorded. Send the invite so they can consent first.");
    }
}
