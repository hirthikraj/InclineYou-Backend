package com.inclineyou.inclineyou_backend.attention;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Rows in *Needs you today* that the trainer has silenced.
 *
 * The table's own comment (V28) carries the argument for why this is a table and
 * not a browser key. What belongs here is the reading rule, which has one
 * subtlety worth stating before the code:
 *
 * <p><b>A live dismissal is not the same as a hidden row.</b> This service answers
 * "what has been silenced, and at what severity" and nothing more. Whether a given
 * queue row is actually suppressed is decided by the CALLER, because it depends on
 * the band the condition is in <i>now</i> — a pack dismissed at {@code pack-ending}
 * comes back when it reaches {@code pack-empty}. Putting that comparison here would
 * mean this service knowing the band ladder, which lives in
 * {@code lib/today/deck.ts} on the web and {@code app/src/home/deck.ts} on the
 * phone. It is one ordered list, in one place, and this table stores a name from
 * it rather than a rank out of it.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AttentionDismissalService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    /**
     * {@code PUT /v1/attention/dismissals/{clientId}/{kind}} — the body of a
     * snooze ("Not now") or a silence ("Not again").
     *
     * @param band         the band the row sits in right now, so an escalation
     *                     can outrank the dismissal (see the class comment)
     * @param snoozedUntil epoch ms to stay quiet until; null means "do not raise
     *                     this again". Absent and null are the same thing.
     */
    public record DismissRequest(@NotBlank String band, Long snoozedUntil) {}

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
     * No id: the table's key is (trainer_id, client_id, kind), so a row is
     * addressed by clientId + kind (api-contract R1). One silence per client per
     * kind is the correct shape, and the wire says so.
     */
    public record DismissalResponse(
            String clientId,
            String kind,
            String band,
            /** Null for a permanent dismissal. */
            Long snoozedUntil,
            long createdAt
    ) {}

    private static final String COLUMNS =
            "client_id::text, kind, band, snoozed_until, created_at";

    // ── List ──────────────────────────────────────────────────────────────────

    /**
     * Every silence this trainer has — api-contract Today L8.
     *
     * Lapsed snoozes are returned too, deliberately: the frontend's
     * {@code isSilenced} already ignores them, and filtering here would make the
     * answer depend on this server's clock rather than the one the deck is built
     * against. A GET that deleted them instead would be a read that writes. The
     * rows are tiny and the next dismissal of the same job overwrites its row.
     */
    public List<DismissalResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT " + COLUMNS + " FROM attention_dismissal " +
                "WHERE trainer_id = :tid::uuid ORDER BY created_at, client_id, kind",
                Map.of("tid", trainerId.toString()));
        return rows.stream().map(this::toResponse).toList();
    }

    // ── Dismiss ───────────────────────────────────────────────────────────────

    /**
     * Snooze or silence one queue row. An upsert on the table's key
     * (trainer_id, client_id, kind), so dismissing a row that is already
     * dismissed just replaces its band and snooze. {@code created_at} is not
     * reassigned on conflict: it dates the first "not now".
     *
     * <p>Checked in Java before the write rather than left to the check
     * constraint, so the trainer gets {@code BAND_KIND_MISMATCH} and a sentence
     * instead of a 500.
     */
    @Transactional
    public DismissalResponse dismiss(UUID trainerId, UUID clientId, String kind, DismissRequest req) {
        var bands = BANDS.get(kind);
        if (bands == null || !bands.contains(req.band())) {
            throw AttentionRuleException.bandKindMismatch(kind, req.band());
        }
        requireOwnedClient(trainerId, clientId);

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("kind", kind);
        p.put("band", req.band());
        p.put("until", req.snoozedUntil() == null
                ? null
                : Timestamp.from(Instant.ofEpochMilli(req.snoozedUntil())));

        // tenant_id is stamped by trg_attention_dismissal_stamp_tenant.
        jdbc.update("""
                INSERT INTO attention_dismissal (trainer_id, client_id, kind, band, snoozed_until)
                VALUES (:tid::uuid, :cid::uuid, :kind, :band, :until)
                ON CONFLICT (trainer_id, client_id, kind) DO UPDATE SET
                    band          = EXCLUDED.band,
                    snoozed_until = EXCLUDED.snoozed_until,
                    updated_at    = now()
                """, p);

        log.info("attention dismissed trainer={} client={} kind={} band={} until={}",
                trainerId, clientId, kind, req.band(), req.snoozedUntil());

        return jdbc.queryForList(
                "SELECT " + COLUMNS + " FROM attention_dismissal " +
                "WHERE trainer_id = :tid::uuid AND client_id = :cid::uuid AND kind = :kind", p)
                .stream().map(this::toResponse).findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Dismissal did not persist"));
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    /**
     * Put a row back in the queue. A DELETE rather than a flag: the table has no
     * soft delete, because the key allows one silence per client per kind.
     *
     * <p>Idempotent — nothing there is still success. Another tab, or a snooze
     * that lapsed and was overwritten, may have got there first, and the state
     * the trainer asked for ("not silenced") is true either way. Scoped by
     * {@code trainer_id} in the WHERE clause, so another trainer's row is simply
     * never matched.
     */
    @Transactional
    public void restore(UUID trainerId, UUID clientId, String kind) {
        jdbc.update("""
                DELETE FROM attention_dismissal
                WHERE trainer_id = :tid::uuid AND client_id = :cid::uuid AND kind = :kind
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString(), "kind", kind));
    }

    /** 404, not 403, for a client that is not this trainer's — ownership is a query filter. */
    private void requireOwnedClient(UUID trainerId, UUID clientId) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid " +
                "AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private DismissalResponse toResponse(Map<String, Object> r) {
        return new DismissalResponse(
                str(r.get("client_id")),
                str(r.get("kind")),
                str(r.get("band")),
                maybeEpochMilli(r.get("snoozed_until")),
                toEpochMilli(r.get("created_at")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private Long maybeEpochMilli(Object v) {
        return v == null ? null : toEpochMilli(v);
    }

    private long toEpochMilli(Object v) {
        if (v instanceof Timestamp t) return t.toInstant().toEpochMilli();
        if (v instanceof Instant i) return i.toEpochMilli();
        if (v instanceof java.time.OffsetDateTime o) return o.toInstant().toEpochMilli();
        return 0L;
    }
}
