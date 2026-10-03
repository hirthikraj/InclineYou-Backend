package com.inclineyou.inclineyou_backend.core.progress;

import com.inclineyou.inclineyou_backend.core.progress.dto.History;
import com.inclineyou.inclineyou_backend.core.progress.dto.SessionInfo;
import com.inclineyou.inclineyou_backend.core.progress.dto.SetHistoryQuery;
import com.inclineyou.inclineyou_backend.core.progress.dto.SetRow;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.UUID;

/**
 * {@code GET /v1/clients/{id}/set-history} — every completed set for one client,
 * oldest first, with each exercise's name once per page rather than once per set.
 *
 * <p>It replaces what Progress used to download to draw one client's lifts: every
 * client, the whole library and every workout on the account. Personal bests and
 * weekly volume stay in the frontend's {@code buildProgress}, which now gets
 * exactly the rows it needs.
 *
 * <p>Filtered by the CLIENT being this trainer's, not by who ran each session —
 * the history is the client's. The SQL is {@link SetHistoryJdbcRepository}'s; this
 * class decides what the parameters mean.
 */
@Service
@RequiredArgsConstructor
public class SetHistoryService {

    private final SetHistoryJdbcRepository repo;
    private final WorkspaceClock clock;

    public History list(UUID trainerId, UUID clientId, String from, String exerciseId, Integer limit, String cursor) {
        if (!repo.clientOnRoster(trainerId, clientId)) throw ApiException.notFound("That client is not on your roster.");

        var zone = clock.zone();
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        Instant fromInstant = fromDate == null ? null : WorkspaceClock.startOf(fromDate, zone);
        int n = Cursor.limit(limit, 5000, 10000);
        var query = new SetHistoryQuery(clientId, fromInstant, exerciseId(exerciseId), keyset(cursor), n + 1);

        var page = Page.of(repo.sets(zone.getId(), query), n, r -> Cursor.encode(r.cursorKey(), r.setId()));

        var ids = page.items().stream().map(SetRow::exerciseId).distinct().toList();
        var sessions = new LinkedHashMap<String, SessionInfo>();
        for (var r : page.items()) sessions.putIfAbsent(r.sessionId(), new SessionInfo(r.workoutName()));
        return new History(repo.exercises(ids), page.items(), page.nextCursor(), sessions);
    }

    private static UUID exerciseId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("exerciseId: not an id");
        }
    }

    /** key = scheduledAt~sessionId~exercisePosition~setPosition; id = the set. */
    private static SetHistoryQuery.Keyset keyset(String cursor) {
        Cursor after = Cursor.decode(cursor);
        if (after == null) return null;
        String[] k = after.key().split("~");
        if (k.length != 4) throw ApiException.validation("cursor: not a cursor from this list");
        try {
            return new SetHistoryQuery.Keyset(Instant.parse(k[0]), UUID.fromString(k[1]),
                    Integer.parseInt(k[2]), Integer.parseInt(k[3]), after.id());
        } catch (RuntimeException e) {
            throw ApiException.validation("cursor: not a cursor from this list");
        }
    }
}
