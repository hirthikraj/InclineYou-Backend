package com.inclineyou.inclineyou_backend.sync;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One client's slice of the same database — FR-11.
 *
 * The client role is a lens, not an account: a client's log of Sunday's session
 * and their trainer's log of Sunday's session are not two records that reconcile,
 * they are one record with two readers. So this service reads and writes exactly
 * the same tables {@link SyncService} does. What it adds is a wall.
 *
 * ── The wall ──────────────────────────────────────────────────────────────────
 *
 * A client can never see another client. Not a leaderboard, not a cohort feed,
 * not an aggregate a name could be inferred from — and not, in particular, a
 * row. Every query below is scoped by `client_id`, and the client_id itself is
 * checked against the phone in the token on every single request, because the
 * caller supplies it and the caller is not trusted with it.
 *
 * What a client may NOT read, even though their trainer's pull includes it:
 * the roster, other people's packs, the price list, the diary's working hours
 * and time blocks, the gym settlement, nudge rules, and the nudge log — which is
 * the trainer's outbox and contains other clients' names.
 *
 * ── What a client may write ───────────────────────────────────────────────────
 *
 * Four things, and one column of a fifth. They can log a workout, log a body
 * metric, and confirm a session their trainer moved. They cannot move, cancel or
 * no-show a session: all three change somebody else's working day and two of
 * them move a pack. They cannot record a payment either — "I paid cash" tells
 * the trainer over WhatsApp and the balance does not move until he marks it
 * received, because we cannot read anybody's bank and a wrong guess destroys the
 * book. Anything else in the push is dropped and logged, never half-applied.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientSyncService {

    private final NamedParameterJdbcTemplate jdbc;

    /** Who the caller is, once proved: their client row and the trainer who owns it. */
    public record Scope(UUID clientId, UUID trainerId) {}

    /**
     * Turn "this token owns this number" into "this token owns this client row".
     *
     * The token's subject is the phone, so the client id arriving in the request
     * is untrusted input until this passes. A soft-deleted client is nobody; a
     * paused one is still themselves, and gets their history — pause is not
     * deletion, and sign-in has already told them what pause means.
     */
    @Transactional(readOnly = true)
    public Scope resolve(String phone, UUID clientId) {
        var rows = jdbc.queryForList("""
                SELECT c.id::text AS cid, c.trainer_id::text AS tid
                FROM client c
                JOIN trainer t ON t.id = c.trainer_id
                WHERE c.id = :cid::uuid
                  AND c.phone = :phone
                  AND c.deleted_at IS NULL
                  AND t.deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "phone", phone));

        if (rows.isEmpty()) {
            // Deliberately the same answer whether the row does not exist or
            // belongs to somebody else. Telling them apart would let a signed-in
            // client probe for other people's ids.
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your record.");
        }
        var row = rows.get(0);
        return new Scope(
                UUID.fromString(row.get("cid").toString()),
                UUID.fromString(row.get("tid").toString()));
    }

    // ── Pull ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SyncService.PullResponse pull(Scope scope, Long lastPulledAt) {
        return pull(scope, lastPulledAt, null);
    }

    @Transactional(readOnly = true)
    public SyncService.PullResponse pull(Scope scope, Long lastPulledAt, Long libraryPulledAt) {
        Timestamp cursor = (lastPulledAt != null && lastPulledAt > 0)
                ? Timestamp.from(Instant.ofEpochMilli(lastPulledAt))
                : Timestamp.from(Instant.EPOCH);

        /*
         * The library's own cursor — the same second cursor the trainer pull
         * takes, and the same reasoning behind it. Absent means the main cursor,
         * which is what an older build received before this existed; the
         * referential clause in `exercises` below is what keeps such a device
         * correct, not this fallback.
         */
        Timestamp libraryCursor = (libraryPulledAt != null && libraryPulledAt > 0)
                ? Timestamp.from(Instant.ofEpochMilli(libraryPulledAt))
                : (libraryPulledAt != null ? Timestamp.from(Instant.EPOCH) : cursor);

        String cid = scope.clientId().toString();
        String tid = scope.trainerId().toString();
        var params = Map.of("cid", cid, "tid", tid,
                            "cursor", cursor, "libraryCursor", libraryCursor);

        var changes = new LinkedHashMap<String, SyncService.TableChanges>();

        // Their own client row, and only theirs. The app reads a name and a
        // delivery mode off it; the split percentage and the payment mode are on
        // it too, and both are the trainer's business — but they are this
        // client's own terms, not another client's, so they stay.
        changes.put("clients", scoped("""
                SELECT * FROM client WHERE id = :cid::uuid
                """, params, cursor));

        // The coach, as a single row. Not a Postgres table: it is the trainer
        // record, cut down to the four things a client is allowed to know — name,
        // gym, phone (every message action is a WhatsApp draft), and the UPI VPA,
        // which the deep link carries and no screen ever renders.
        changes.put("coaches", scoped("""
                SELECT id, name, gym_name, phone, upi_vpa, created_at, updated_at, deleted_at
                FROM trainer WHERE id = :tid::uuid
                """, params, cursor));

        /*
         * The exercise library, plus their trainer's own custom exercises —
         * otherwise a plan built around "Ravi's cable press" would arrive with a
         * blank name on the client's phone.
         *
         * That comment described the failure this used to have. One cursor over
         * a collection that is not the caller's data answers the wrong question:
         * the shared library changes only when `ExerciseSeeder` runs, so
         * `updated_at > :cursor` asks "has it been re-imported since you last
         * synced" — almost always no — while the device is asking "do I hold it
         * at all". A client whose cursor is newer than the last import was sent
         * their whole plan and none of the exercises naming it, and every line
         * of it drew blank.
         *
         * So the two halves get two cursors. A CUSTOM exercise is their coach's
         * data and rides `:cursor`, as it always did. The shared library rides
         * `:libraryCursor`, which a device sets to zero to mean "none of it".
         *
         * And the third clause is the safety net for a build that never asks: if
         * this pull carries a plan row, a logged exercise or a set that NAMES an
         * exercise, it carries the exercise too. Bounded by what is already being
         * sent, so a steady-state pull adds nothing. A client has no
         * `exercise_favourite` rows — those are the trainer's — so unlike the
         * trainer-side clause there are three sources here, not five.
         */
        String namedByThisPull = """
                    id IN (
                        SELECT pe.exercise_id
                          FROM program_exercise pe
                          JOIN program p ON p.id = pe.program_id
                         WHERE p.client_id = :cid::uuid
                           AND pe.updated_at > :cursor
                        UNION
                        SELECT we.exercise_id
                          FROM workout_exercise we
                          JOIN workout_session w ON w.id = we.workout_session_id
                         WHERE w.client_id = :cid::uuid
                           AND we.updated_at > :cursor
                        UNION
                        -- A swap names two exercises and the log draws both.
                        SELECT we.swapped_from_exercise_id
                          FROM workout_exercise we
                          JOIN workout_session w ON w.id = we.workout_session_id
                         WHERE w.client_id = :cid::uuid
                           AND we.swapped_from_exercise_id IS NOT NULL
                           AND we.updated_at > :cursor
                        UNION
                        SELECT sl.exercise_id
                          FROM set_log sl
                          JOIN workout_session w ON w.id = sl.workout_session_id
                         WHERE w.client_id = :cid::uuid
                           AND sl.updated_at > :cursor)
                """;

        changes.put("exercises", twoCursor("""
                SELECT * FROM exercise WHERE is_custom = false OR trainer_id = :tid::uuid
                """, params, namedByThisPull));

        // Only the templates their own programs were copied from, for the week
        // count and the day labels. Never the trainer's library.
        changes.put("templates", scoped("""
                SELECT tpl.* FROM template tpl
                WHERE tpl.id IN (SELECT p.template_id FROM program p
                                 WHERE p.client_id = :cid::uuid AND p.template_id IS NOT NULL)
                """, params, cursor));

        changes.put("programs", scoped("""
                SELECT * FROM program WHERE client_id = :cid::uuid
                """, params, cursor));

        changes.put("program_exercises", scoped("""
                SELECT pe.* FROM program_exercise pe
                JOIN program p ON p.id = pe.program_id
                WHERE p.client_id = :cid::uuid
                """, params, cursor));

        changes.put("scheduled_sessions", scoped("""
                SELECT * FROM scheduled_session WHERE client_id = :cid::uuid
                """, params, cursor));

        changes.put("workout_sessions", scoped("""
                SELECT * FROM workout_session WHERE client_id = :cid::uuid
                """, params, cursor));

        changes.put("workout_exercises", scoped("""
                SELECT we.* FROM workout_exercise we
                JOIN workout_session ws ON ws.id = we.workout_session_id
                WHERE ws.client_id = :cid::uuid
                """, params, cursor));

        changes.put("set_logs", scoped("""
                SELECT sl.* FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.client_id = :cid::uuid
                """, params, cursor));

        changes.put("packages", scoped("""
                SELECT * FROM package WHERE client_id = :cid::uuid
                """, params, cursor));

        changes.put("payments", scoped("""
                SELECT * FROM payment WHERE client_id = :cid::uuid
                """, params, cursor));

        // Sunday's report, exactly as it was written. The one thing on a client's
        // phone that was not computed there.
        changes.put("weekly_reports", scoped("""
                SELECT * FROM weekly_report WHERE client_id = :cid::uuid
                """, params, cursor));

        log.debug("client sync pull client={} cursor={} libraryCursor={}", cid, cursor, libraryCursor);
        long now = Instant.now().toEpochMilli();
        return new SyncService.PullResponse(now, now, changes);
    }

    /**
     * Every scope query is "this slice, alive, since the cursor" plus "this
     * slice, dead, since the cursor", so it is written once here. `base` must
     * select from one table with a WHERE that already scopes it, and must not
     * mention `deleted_at` or `updated_at`.
     *
     * Alive rows all go in `updated` and never in `created` — the same contract
     * the trainer's pull uses, paired with `sendCreatedAsUpdated` on the phone.
     * See the long note on `SyncService.splitAlive`.
     */
    /**
     * {@link #scoped} for the one collection that needs two cursors and a
     * referential clause: the exercise library. Tombstones deliberately do NOT
     * use the referential clause — a deleted exercise is not "needed" by
     * anything, and the rows that named it keep their id and resolve against a
     * name the device already holds.
     */
    private SyncService.TableChanges twoCursor(String base, Map<String, ?> params, String alsoIfShared) {
        String changed = """
                (r.is_custom AND r.updated_at > :cursor)
                OR (NOT r.is_custom AND r.updated_at > :libraryCursor)
                OR (NOT r.is_custom AND %s)
                """.formatted(alsoIfShared.replace("id IN (", "r.id IN ("));

        String alive = "SELECT * FROM (%s) r WHERE r.deleted_at IS NULL AND (%s) ORDER BY r.updated_at ASC"
                .formatted(base, changed);
        String dead = """
                SELECT r.id::text AS id FROM (%s) r WHERE r.deleted_at IS NOT NULL
                  AND ((r.is_custom AND r.updated_at > :cursor)
                       OR (NOT r.is_custom AND r.updated_at > :libraryCursor))
                """.formatted(base);

        var rows = jdbc.queryForList(alive, params).stream().map(SyncRows::normalizeRow).toList();
        var deleted = jdbc.queryForList(dead, params).stream()
                .map(r -> r.get("id").toString())
                .toList();
        return new SyncService.TableChanges(List.of(), rows, deleted);
    }

    private SyncService.TableChanges scoped(String base, Map<String, ?> params, Timestamp cursor) {
        String alive = "SELECT * FROM (%s) r WHERE r.deleted_at IS NULL AND r.updated_at > :cursor ORDER BY r.updated_at ASC"
                .formatted(base);
        String dead = "SELECT r.id::text AS id FROM (%s) r WHERE r.deleted_at IS NOT NULL AND r.updated_at > :cursor"
                .formatted(base);

        var rows = jdbc.queryForList(alive, params).stream().map(SyncRows::normalizeRow).toList();
        var deleted = jdbc.queryForList(dead, params).stream()
                .map(r -> r.get("id").toString())
                .toList();
        return new SyncService.TableChanges(List.of(), rows, deleted);
    }

    /** `session_date` is a DATE on the server and an ISO string on the phone. */
    private static java.sql.Date toSqlDate(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        try { return java.sql.Date.valueOf(s); } catch (Exception e) { return null; }
    }

    // ── Push ──────────────────────────────────────────────────────────────────

    /** Everything a client is allowed to write. Anything else is dropped, loudly. */
    private static final Set<String> ACCEPTED = Set.of(
            "workout_sessions", "workout_exercises", "set_logs",
            "scheduled_sessions");

    @Transactional
    public void push(Scope scope, Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        var changes = (Map<String, Object>) body.get("changes");
        if (changes == null) return;

        String cid = scope.clientId().toString();
        String tid = scope.trainerId().toString();

        pushWorkoutSessions(cid, tid, changes);
        pushWorkoutExercises(cid, changes);
        pushSetLogs(cid, changes);
        confirmSessions(cid, changes);
        warnOnRefused(cid, changes);
        log.debug("client sync push client={} tables={}", cid, changes.keySet());
    }

    @SuppressWarnings("unchecked")
    private void warnOnRefused(String cid, Map<String, Object> changes) {
        for (var entry : changes.entrySet()) {
            if (ACCEPTED.contains(entry.getKey())) continue;
            if (!(entry.getValue() instanceof Map<?, ?> table)) continue;
            int count = SyncRows.mergeCreatedUpdated((Map<String, Object>) table).size()
                    + SyncRows.deletedIds((Map<String, Object>) table).size();
            if (count > 0) {
                log.warn("client sync push client={}: REFUSED {} record(s) for '{}' — not a client's to write",
                        cid, count, entry.getKey());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void pushWorkoutSessions(String cid, String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("workout_sessions");
        if (table == null) return;

        for (var record : SyncRows.mergeCreatedUpdated(table)) {
            var p = new java.util.HashMap<String, Object>();
            p.put("id",           SyncRows.str(record.get("id")));
            p.put("cid",          cid);
            p.put("tid",          tid);
            p.put("scheduled_session_id", record.get("scheduled_session_id"));
            p.put("program_id",   record.get("program_id"));
            p.put("session_date", toSqlDate(record.get("session_date")));
            p.put("notes",        record.get("notes"));
            p.put("ended_at",     SyncRows.toTimestamp(record.get("ended_at")));
            p.put("created_at",   SyncRows.toTimestamp(record.get("created_at")));
            p.put("updated_at",   SyncRows.toTimestamp(record.get("updated_at")));

            // client_id and trainer_id come from the resolved scope, never from
            // the record — a client cannot log a workout onto somebody else by
            // sending a different id, because the ids in the row are ignored.
            // `logged_by` is set on insert and never on conflict. A client's log
            // of Sunday's session and their trainer's log of it are one record,
            // and the answer to "who wrote this down" belongs to whoever opened
            // it — a later tick from the other side does not rewrite history.
            jdbc.update("""
                    INSERT INTO workout_session (id, trainer_id, client_id, scheduled_session_id,
                        program_id, logged_by, session_date, notes, ended_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :scheduled_session_id::uuid,
                        :program_id::uuid, 'client', :session_date, :notes, :ended_at,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        scheduled_session_id = EXCLUDED.scheduled_session_id,
                        program_id   = EXCLUDED.program_id,
                        session_date = EXCLUDED.session_date,
                        notes        = EXCLUDED.notes,
                        ended_at     = EXCLUDED.ended_at,
                        updated_at   = EXCLUDED.updated_at
                    WHERE workout_session.client_id = :cid::uuid
                    """, p);
        }

        for (String id : SyncRows.deletedIds(table)) {
            jdbc.update("""
                    UPDATE workout_session SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND client_id = :cid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "cid", cid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushWorkoutExercises(String cid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("workout_exercises");
        if (table == null) return;

        for (var record : SyncRows.mergeCreatedUpdated(table)) {
            var p = new java.util.HashMap<String, Object>();
            p.put("id",   SyncRows.str(record.get("id")));
            p.put("cid",  cid);
            p.put("wsid", record.get("workout_session_id"));
            p.put("eid",  record.get("exercise_id"));
            p.put("order_index", record.get("order_index"));
            p.put("source", record.get("source"));
            p.put("swapped_from_exercise_id", record.get("swapped_from_exercise_id"));
            p.put("target_sets", record.get("target_sets"));
            p.put("target_reps", record.get("target_reps"));
            p.put("rest_seconds", record.get("rest_seconds"));
            p.put("removed_at", SyncRows.toTimestamp(record.get("removed_at")));
            p.put("created_at", SyncRows.toTimestamp(record.get("created_at")));
            p.put("updated_at", SyncRows.toTimestamp(record.get("updated_at")));

            // The parent workout has to be this client's. A row whose workout is
            // not theirs inserts nothing — the SELECT that feeds the INSERT
            // returns no rows, so there is nothing to write.
            jdbc.update("""
                    INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index,
                        source, swapped_from_exercise_id, target_sets, target_reps, rest_seconds,
                        removed_at, created_at, updated_at)
                    SELECT :id::uuid, ws.id, :eid::uuid, :order_index,
                        :source, :swapped_from_exercise_id::uuid, :target_sets, :target_reps,
                        :rest_seconds, :removed_at,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW())
                    FROM workout_session ws
                    WHERE ws.id = :wsid::uuid AND ws.client_id = :cid::uuid AND ws.deleted_at IS NULL
                    ON CONFLICT (id) DO UPDATE SET
                        order_index  = EXCLUDED.order_index,
                        source       = EXCLUDED.source,
                        swapped_from_exercise_id = EXCLUDED.swapped_from_exercise_id,
                        target_sets  = EXCLUDED.target_sets,
                        target_reps  = EXCLUDED.target_reps,
                        rest_seconds = EXCLUDED.rest_seconds,
                        removed_at   = EXCLUDED.removed_at,
                        updated_at   = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : SyncRows.deletedIds(table)) {
            jdbc.update("""
                    UPDATE workout_exercise we SET deleted_at = NOW(), updated_at = NOW()
                    FROM workout_session ws
                    WHERE we.id = :id::uuid AND ws.id = we.workout_session_id
                      AND ws.client_id = :cid::uuid AND we.deleted_at IS NULL
                    """, Map.of("id", id, "cid", cid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushSetLogs(String cid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("set_logs");
        if (table == null) return;

        for (var record : SyncRows.mergeCreatedUpdated(table)) {
            var p = new java.util.HashMap<String, Object>();
            p.put("id",   SyncRows.str(record.get("id")));
            p.put("cid",  cid);
            p.put("wsid", record.get("workout_session_id"));
            p.put("eid",  record.get("exercise_id"));
            p.put("set_number", record.get("set_number"));
            p.put("reps",       record.get("reps"));
            p.put("load_kg",    record.get("load_kg"));
            p.put("rpe",        record.get("rpe"));
            p.put("notes",      record.get("notes"));
            p.put("created_at", SyncRows.toTimestamp(record.get("created_at")));
            p.put("updated_at", SyncRows.toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO set_log (id, workout_session_id, exercise_id, set_number,
                        reps, load_kg, rpe, notes, created_at, updated_at)
                    SELECT :id::uuid, ws.id, :eid::uuid, :set_number,
                        :reps, :load_kg, :rpe, :notes,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW())
                    FROM workout_session ws
                    WHERE ws.id = :wsid::uuid AND ws.client_id = :cid::uuid AND ws.deleted_at IS NULL
                    ON CONFLICT (id) DO UPDATE SET
                        set_number = EXCLUDED.set_number,
                        reps       = EXCLUDED.reps,
                        load_kg    = EXCLUDED.load_kg,
                        rpe        = EXCLUDED.rpe,
                        notes      = EXCLUDED.notes,
                        updated_at = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : SyncRows.deletedIds(table)) {
            jdbc.update("""
                    UPDATE set_log sl SET deleted_at = NOW(), updated_at = NOW()
                    FROM workout_session ws
                    WHERE sl.id = :id::uuid AND ws.id = sl.workout_session_id
                      AND ws.client_id = :cid::uuid AND sl.deleted_at IS NULL
                    """, Map.of("id", id, "cid", cid));
        }
    }

    /**
     * The one column of the one table a client may change on a session: the
     * confirm on a move (4b).
     *
     * WatermelonDB pushes whole records, so the row arriving here carries a time,
     * a status and a pack delta as well. All of it is ignored. That is not
     * defensive coding, it is the rule: a client cannot move, cancel or no-show a
     * session, and the server is where that holds even if a build one day forgets.
     */
    @SuppressWarnings("unchecked")
    private void confirmSessions(String cid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("scheduled_sessions");
        if (table == null) return;

        for (var record : SyncRows.mergeCreatedUpdated(table)) {
            Timestamp confirmed = SyncRows.toTimestamp(record.get("client_confirmed_at"));
            if (confirmed == null) continue;

            jdbc.update("""
                    UPDATE scheduled_session
                    SET client_confirmed_at = :confirmed, updated_at = NOW()
                    WHERE id = :id::uuid AND client_id = :cid::uuid
                      AND deleted_at IS NULL AND client_confirmed_at IS NULL
                    """, Map.of(
                    "id", SyncRows.str(record.get("id")),
                    "cid", cid,
                    "confirmed", confirmed));
        }

        int refused = SyncRows.deletedIds(table).size();
        if (refused > 0) {
            log.warn("client sync push client={}: REFUSED {} session deletion(s) — a client cannot cancel",
                    cid, refused);
        }
    }
}
