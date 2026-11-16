package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.core.nudge.dto.NudgeSummary;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code GET /v1/nudges} — what has been sent, newest first: the whole roster, or one client with
 * {@code clientId} (api-contract Today L9 and Client file L3).
 *
 * <p>One trainer-wide read rather than one per client: a dashboard that already holds the roster must never spend
 * one request per client, which is the mistake {@code GET /v1/packages} was added to fix. Today asks for the
 * cooldown window and uses it to RANK its queue — the window is a hint, never a refusal; the client file asks for a
 * year with {@code include=message}.
 *
 * <p>The cooldown is READ here and enforced nowhere: a queue that stops raising a row about somebody contacted
 * yesterday, and a button that says <i>Reminded 2 days ago</i> before it is pressed. Suppressing the prompt is the
 * enforcement; blocking the press is not (see {@link NudgeDraftService}).
 *
 * <p>There is no DELETE, and there will not be one. The log records that a message was drafted and handed to
 * WhatsApp; the product cannot know whether the trainer pressed send, so it cannot honestly offer to un-send, and
 * deleting the row would reopen the cooldown, which is the one thing the record exists to hold shut.
 */
@Service
@RequiredArgsConstructor
public class NudgeReadService {

    private final NudgeLogJdbcRepository logs;
    private final WorkspaceClock clock;

    /**
     * Never twice in this many days to the same person — {@code COOLDOWN_DAYS} in the phone's
     * {@code app/src/nudges/rules.ts} and the web's {@code lib/nudges/cooldown.ts}, the third copy of this number.
     * It is the window {@link #list} answers by default, so a caller that wants "who have I already contacted" gets
     * the right span without naming it.
     */
    public static final int COOLDOWN_DAYS = 7;

    /**
     * Keyset on (sentAt, id) descending. The 1.0 read cut the list at 2,000 rows without saying so; a non-null
     * {@code nextCursor} says there is more.
     *
     * @param from    a date in the workspace's timezone; null means the day {@link #COOLDOWN_DAYS} days ago, from its
     *                midnight — the same window Today asks for by name (it used to be "now minus 7 days" to the
     *                second, which disagreed with a {@code from} by part of a day)
     * @param include only {@code message} is a known value; opt-in on any query rather than switched on by
     *                {@code clientId}, because a field that appears and disappears with a filter is a trap
     *
     * <p>One read-only transaction: the workspace's timezone and the page share one connection.
     */
    @Transactional(readOnly = true)
    public Page<NudgeSummary> list(UUID trainerId, String from, String clientId, String include,
                                   Integer limit, String cursor) {
        boolean withMessage = false;
        if (include != null && !include.isBlank()) {
            for (String one : include.split(",")) {
                if (!"message".equals(one.strip())) throw ApiException.validation("include: only 'message'");
                withMessage = true;
            }
        }
        UUID client = null;
        if (clientId != null && !clientId.isBlank()) {
            try {
                client = UUID.fromString(clientId.strip());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
        }
        var zone = clock.zone();
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        if (fromDate == null) fromDate = WorkspaceClock.today(zone).minusDays(COOLDOWN_DAYS);
        Instant since = WorkspaceClock.startOf(fromDate, zone);
        int n = Cursor.limit(limit, 500, 1000);

        // The cursor names the window and client it came from (include only adds a field, so it is not part of it).
        String query = Cursor.mark(fromDate, client);
        Cursor after = Cursor.within(cursor, query);
        // A client that is not on this trainer's roster is a 404, as every route answers. A client handed over from
        // another coach IS on it, and reads only the messages this trainer drafted — none — which is the right answer.
        if (client != null && !logs.clientIsMine(trainerId, client)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        var rows = logs.page(trainerId, since, client, after, withMessage, n + 1);
        return Page.of(rows, n, r -> Cursor.encodeFor(query, r.cursorKey(), r.id()));
    }
}
