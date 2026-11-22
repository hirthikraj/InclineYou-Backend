package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * What a reopen did to money. {@code sale} (17 Nov 2026, additive) says what happened to a single session's own sale,
 * which the four older fields cannot: {@code kept} — its charge was reversed and it stays owed (then {@code packageId}
 * and {@code packageReopened} are about the sale, not a pack); {@code revived} — closed by an uncharged cancel or
 * no-show, owed again; {@code sold} — it had none to revive (refunded, or booked before sales at booking), so it was
 * sold again. Absent when the session has no sale or it did not change.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReopenEffects(boolean chargeReversed, String packageId, Integer sessionsRemaining,
                            boolean packageReopened, String sale) {

    public static final ReopenEffects NONE = new ReopenEffects(false, null, null, false, null);
}
