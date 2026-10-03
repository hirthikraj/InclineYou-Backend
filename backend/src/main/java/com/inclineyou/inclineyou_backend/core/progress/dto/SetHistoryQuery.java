package com.inclineyou.inclineyou_backend.core.progress.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A validated set-history read, ready for the repository: the service has already parsed the dates, the exercise
 * id and the cursor, so nothing here can be a malformed string.
 *
 * @param from       inclusive start of the window, or null for all time
 * @param exerciseId the focused lift, or null
 * @param after      the keyset position to continue from, or null for the first page
 * @param fetch      rows to ask for — one more than the page, so the caller can tell whether there is a next page
 */
public record SetHistoryQuery(UUID clientId, Instant from, UUID exerciseId, Keyset after, int fetch) {

    /** (scheduledAt, session, exercise position, set position, set id) — the order the rows come back in. */
    public record Keyset(Instant scheduledAt, UUID sessionId, int exercisePosition, int setPosition, UUID setId) {}
}
