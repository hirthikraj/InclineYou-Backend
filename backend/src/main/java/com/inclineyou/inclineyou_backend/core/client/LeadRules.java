package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.UUID;

/**
 * V48 — the two checks on a lead's fields that need the database or the workspace's calendar, shared by the client's own
 * create and PATCH and by a logged contact. Both are 400 {@code VALIDATION} naming the field, like a shape error: neither
 * can ever succeed as sent.
 *
 * <p><b>Not consent-gated, by the owner's call (23 Nov 2026).</b> Where somebody came from, what they asked about, when to
 * ring them back and what they said is the business record a trainer keeps on an enquiry — like the number and the
 * bookings — and a prospect has almost never accepted an invite. {@link ConsentGate} still locks notes, health and profile.
 */
@Component
@RequiredArgsConstructor
public class LeadRules {

    /** How far ahead a follow-up may be set. Further than a year is a typo for a date, not a plan. */
    static final int MAX_DAYS_AHEAD = 366;

    private final ClientJdbcRepository clients;
    private final WorkspaceClock clock;

    /** One of the trainer's own price-list packs, not removed. */
    public void requirePack(UUID trainerId, UUID packId) {
        if (packId != null && !clients.ownsPack(trainerId, packId)) {
            throw ApiException.validation("interestedPackId: not a pack on your price list");
        }
    }

    /**
     * Today or later, in the workspace's calendar, and within a year. Yesterday is refused rather than stored: a follow-up
     * set in the past would land on Today as already late, which is never what the trainer meant.
     */
    public void requireFollowUp(String field, LocalDate on) {
        if (on == null) return;
        LocalDate today = WorkspaceClock.today(clock.zone());
        if (on.isBefore(today)) throw ApiException.validation(field + ": today or later");
        if (on.isAfter(today.plusDays(MAX_DAYS_AHEAD))) throw ApiException.validation(field + ": within a year");
    }
}
