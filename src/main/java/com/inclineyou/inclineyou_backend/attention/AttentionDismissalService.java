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

    public record DismissRequest(
            @NotBlank String clientId,
            /** {@code AttentionItem.kind} — which job is being silenced. */
            @NotBlank String kind,
            /** The band it sits in right now, so an escalation can outrank it. */
            @NotBlank String band,
            /**
             * Epoch millis to stay quiet until, or null for "do not raise this
             * again". Absent and null mean the same thing; there is no third
             * state, because {@code snoozed_until} is one nullable column.
             */
            Long snoozeUntil
    ) {}

    public record DismissalResponse(
            String id,
            String clientId,
            String kind,
            String band,
            /** Null for a permanent dismissal. */
            Long snoozedUntil,
            long createdAt,
            long updatedAt
    ) {}

    private static final String COLUMNS =
            "id::text, client_id::text, kind, band, snoozed_until, created_at, updated_at";

    // ── List ──────────────────────────────────────────────────────────────────

    /**
     * Every silence this trainer still has in force.
     *
     * Expired snoozes are filtered in SQL rather than deleted on read. A GET that
     * writes is a GET that cannot be retried, cannot be cached by anything ever,
     * and turns a read timeout into a partial mutation — and the rows are tiny.
     * They are cleaned up by the next dismissal of the same job, which UPDATEs the
     * row it would otherwise duplicate.
     */
    public List<DismissalResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT " + COLUMNS + " FROM attention_dismissal " +
                "WHERE trainer_id = :tid::uuid " +
                "  AND (snoozed_until IS NULL OR snoozed_until > NOW())",
                Map.of("tid", trainerId.toString()));
        return rows.stream().map(this::toResponse).toList();
    }

    // ── Dismiss ───────────────────────────────────────────────────────────────

    /**
     * Silence a job, or change how long it stays silent.
     *
     * Upsert on the natural key, so a snooze extended and a snooze made permanent
     * are the same call. {@code created_at} is deliberately NOT reassigned on
     * conflict: it dates the first time the trainer said "not now" about this job,
     * which is the figure a later "you have been putting this off for three weeks"
     * would need. {@code updated_at} moves.
     */
    @Transactional
    public DismissalResponse dismiss(UUID trainerId, DismissRequest req) {
        // Ownership, not tidiness: the client id comes from the browser, and
        // without this a trainer could silence a row on somebody else's roster —
        // writing a row that the other trainer's queue would then read.
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid " +
                "AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        var p = new HashMap<String, Object>();
        p.put("id",  UUID.randomUUID().toString());
        p.put("tid", trainerId.toString());
        p.put("cid", req.clientId());
        p.put("kind", req.kind());
        p.put("band", req.band());
        p.put("until", req.snoozeUntil() == null
                ? null
                : Timestamp.from(Instant.ofEpochMilli(req.snoozeUntil())));

        jdbc.update("""
                INSERT INTO attention_dismissal
                    (id, trainer_id, client_id, kind, band, snoozed_until, created_at, updated_at)
                VALUES
                    (:id::uuid, :tid::uuid, :cid::uuid, :kind, :band, :until, NOW(), NOW())
                ON CONFLICT (trainer_id, client_id, kind) DO UPDATE SET
                    band          = EXCLUDED.band,
                    snoozed_until = EXCLUDED.snoozed_until,
                    updated_at    = NOW()
                """, p);

        log.info("attention dismissed trainer={} client={} kind={} until={}",
                trainerId, req.clientId(), req.kind(), req.snoozeUntil());

        return jdbc.queryForList(
                "SELECT " + COLUMNS + " FROM attention_dismissal " +
                "WHERE trainer_id = :tid::uuid AND client_id = :cid::uuid AND kind = :kind",
                Map.of("tid", trainerId.toString(), "cid", req.clientId(), "kind", req.kind()))
                .stream().map(this::toResponse).findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Dismissal did not persist"));
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    /**
     * Put the job back in the list.
     *
     * A DELETE rather than a flag, per the table's closing note: the unique
     * constraint counts a tombstone, so a soft delete would make the next
     * dismissal of the same job collide with a silence that is meant to be gone.
     *
     * Scoped by {@code trainer_id} in the WHERE clause and not merely checked
     * first — the id comes from the browser, and a row that is not this trainer's
     * must be a 404 rather than a deletion.
     */
    @Transactional
    public void restore(UUID trainerId, UUID id) {
        int gone = jdbc.update(
                "DELETE FROM attention_dismissal WHERE id = :id::uuid AND trainer_id = :tid::uuid",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (gone == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dismissal not found");
        }
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private DismissalResponse toResponse(Map<String, Object> r) {
        return new DismissalResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("kind")),
                str(r.get("band")),
                maybeEpochMilli(r.get("snoozed_until")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
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
