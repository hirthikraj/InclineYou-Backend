package com.inclineyou.inclineyou_backend.core.attention;

import com.inclineyou.inclineyou_backend.core.attention.dto.DismissRequest;
import com.inclineyou.inclineyou_backend.core.attention.dto.DismissalResponse;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Rows in *Needs you today* that the trainer has silenced.
 *
 * The table's own comment (V28) carries the argument for why this is a table and not a browser key. What belongs here
 * is the reading rule, which has one subtlety worth stating before the code:
 *
 * <p><b>A live dismissal is not the same as a hidden row.</b> This service answers "what has been silenced, and at what
 * severity" and nothing more. Whether a given queue row is actually suppressed is decided by the CALLER, because it
 * depends on the band the condition is in <i>now</i> — a pack dismissed at {@code pack-ending} comes back when it
 * reaches {@code pack-empty}. Putting that comparison here would mean this service knowing the band ladder, which lives
 * in {@code lib/today/deck.ts} on the web and {@code app/src/home/deck.ts} on the phone. It is one ordered list, in one
 * place, and this table stores a name from it rather than a rank out of it.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AttentionDismissalService {

    private final AttentionDismissalJdbcRepository repo;

    /** Which bands each kind may be dismissed at — {@code attention_dismissal_band}, word for word. */
    private static final Map<String, Set<String>> BANDS = Map.of(
            "pack", Set.of("pack-empty", "pack-ending", "pack-expiring"),
            "overdue", Set.of("overdue-late", "due-soon"),
            "missed", Set.of("missed"),
            "quiet", Set.of("quiet"),
            "no-program", Set.of("no-program"),
            "unmarked", Set.of("unmarked"),
            "milestone", Set.of("milestone"),
            "log", Set.of("log-open"));

    /**
     * Every silence this trainer has — api-contract Today L8.
     *
     * Lapsed snoozes are returned too, deliberately: the frontend's {@code isSilenced} already ignores them, and
     * filtering here would make the answer depend on this server's clock rather than the one the deck is built against.
     * A GET that deleted them instead would be a read that writes. The rows are tiny and the next dismissal of the same
     * job overwrites its row.
     */
    public List<DismissalResponse> list(UUID trainerId) {
        return repo.list(trainerId);
    }

    /**
     * Snooze or silence one queue row. An upsert on the table's key, so dismissing a row that is already dismissed just
     * replaces its band and snooze.
     *
     * <p>Checked in Java before the write rather than left to the check constraint, so the trainer gets
     * {@code BAND_KIND_MISMATCH} and a sentence instead of a 500.
     */
    @Transactional
    public DismissalResponse dismiss(UUID trainerId, UUID clientId, String kind, DismissRequest req) {
        var bands = BANDS.get(kind);
        if (bands == null || !bands.contains(req.band())) {
            throw AttentionRuleException.bandKindMismatch(kind, req.band());
        }
        // 404, not 403, for a client that is not this trainer's — ownership is a query filter.
        if (!repo.clientOnRoster(trainerId, clientId)) throw ApiException.notFound("That client is not on your roster.");

        var saved = repo.upsert(trainerId, clientId, kind, req.band(), req.snoozedUntil());
        log.info("attention dismissed trainer={} client={} kind={} band={} until={}",
                trainerId, clientId, kind, req.band(), req.snoozedUntil());
        return saved;
    }

    /**
     * Put a row back in the queue. A DELETE rather than a flag: the table has no soft delete, because the key allows one
     * silence per client per kind.
     *
     * <p>Idempotent — nothing there is still success. Another tab, or a snooze that lapsed and was overwritten, may have
     * got there first, and the state the trainer asked for ("not silenced") is true either way.
     */
    @Transactional
    public void restore(UUID trainerId, UUID clientId, String kind) {
        repo.delete(trainerId, clientId, kind);
    }
}
