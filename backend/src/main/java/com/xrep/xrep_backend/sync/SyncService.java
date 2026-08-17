package com.xrep.xrep_backend.sync;

import com.xrep.xrep_backend.client.ClientPhoneGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class SyncService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ClientPhoneGuard phoneGuard;

    // ── Response types ────────────────────────────────────────────────────────

    public record PullResponse(long timestamp, Map<String, TableChanges> changes) {}

    public record TableChanges(
            List<Map<String, Object>> created,
            List<Map<String, Object>> updated,
            List<String> deleted
    ) {}

    /**
     * What the push refused, and why.
     *
     * A push used to answer 204 — everything you sent, we took. That is no
     * longer true of a roster row whose number belongs to a trainer or to
     * another trainer's client, and a silent refusal is the worst of the three
     * options: the record sits on the phone looking synced and exists nowhere
     * else. So the push says what it would not take, per record, in words the
     * app can put on screen without inventing them.
     *
     * Empty on every push that had nothing to refuse, which is nearly all of
     * them. WatermelonDB ignores the body, so reading this is the app's choice.
     */
    public record PushResult(List<Rejection> rejected) {}

    /**
     * @param field the column the refusal is about, so an app can highlight it
     * @param code  {@link com.xrep.xrep_backend.client.ClientPhoneGuard} codes
     * @param kept  false when nothing was written at all, true when the rest of
     *              the record landed and only this field was left as it was
     */
    public record Rejection(
            String table, String id, String field, String code, String message, boolean kept) {}

    // ── Pull ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PullResponse pull(UUID trainerId, Long lastPulledAt) {
        Timestamp cursor = (lastPulledAt != null && lastPulledAt > 0)
                ? Timestamp.from(Instant.ofEpochMilli(lastPulledAt))
                : Timestamp.from(Instant.EPOCH);

        String tid = trainerId.toString();
        log.debug("sync pull trainer={} cursor={}", tid, cursor);

        var changes = new LinkedHashMap<String, TableChanges>();
        changes.put("clients",              fetchDirect("client",            "trainer_id", tid, cursor));
        changes.put("body_metrics",         fetchViaClient("body_metric",                  tid, cursor));
        changes.put("exercises",            fetchExercises(                                tid, cursor));
        changes.put("templates",            fetchDirect("template",          "trainer_id", tid, cursor));
        changes.put("programs",             fetchDirect("program",           "trainer_id", tid, cursor));
        changes.put("program_exercises",    fetchViaProgramDirect(                         tid, cursor));
        changes.put("scheduled_sessions",   fetchDirect("scheduled_session", "trainer_id", tid, cursor));
        changes.put("workout_sessions",     fetchDirect("workout_session",   "trainer_id", tid, cursor));
        changes.put("set_logs",             fetchViaWorkout("set_log",                     tid, cursor));
        // Screen 17 · the workout log. What was actually in each session, as
        // opposed to what the program asked for. Hangs off the workout the same
        // way set logs do, so it rides the same join.
        changes.put("workout_exercises",    fetchViaWorkout("workout_exercise",            tid, cursor));
        changes.put("packages",             fetchDirect("package",           "trainer_id", tid, cursor));
        changes.put("payments",             fetchDirect("payment",           "trainer_id", tid, cursor));
        changes.put("nudge_logs",           fetchDirect("nudge_log",         "trainer_id", tid, cursor));
        // Screen 05 · diary. Both hang straight off the trainer, and both are
        // read on every diary open, so they ride the same cursor as everything
        // else rather than a bespoke endpoint.
        changes.put("working_hours",        fetchDirect("working_hours",     "trainer_id", tid, cursor));
        changes.put("time_blocks",          fetchDirect("time_block",        "trainer_id", tid, cursor));
        // Screen 06 · money. `pack` is the price list the trainer defined at
        // setup; `gym_settlement` is the money going the other way. Both hang
        // straight off the trainer and both are tiny — a dozen rows each — so
        // they ride the same cursor rather than earning an endpoint.
        changes.put("packs",                fetchDirect("pack",              "trainer_id", tid, cursor));
        changes.put("gym_settlements",      fetchDirect("gym_settlement",    "trainer_id", tid, cursor));
        // Screens 07–16 · behind the drawer. Both are per-trainer and tiny — five
        // rules and a handful of stars — and both are edited on a gym floor with
        // no signal, which is the whole reason they are synced records rather
        // than preferences.
        changes.put("nudge_rules",          fetchDirect("nudge_rule",        "trainer_id", tid, cursor));
        changes.put("exercise_favourites",  fetchDirect("exercise_favourite","trainer_id", tid, cursor));
        // Diary 3d · batches. One row per group, a handful per trainer, and the
        // agenda cannot draw a batch row without it — so it rides the same
        // cursor rather than being fetched when a batch happens to be on screen.
        changes.put("batches",              fetchDirect("batch",             "trainer_id", tid, cursor));
        /*
         * Drawer 7a–7c · weekly reports.
         *
         * The client has had these since V14; the trainer, who is the person the
         * report is FROM, could not see what went out. Same rows, pulled on the
         * trainer's cursor — which is the whole point: the figures the trainer
         * reads and the figures the client reads are one row, not two
         * calculations that agree today and drift when a set is corrected.
         *
         * Pull only. There is no `pushWeeklyReports` and there must not be: the
         * job writes these, and a phone that could rewrite a sent report would
         * make every one of them arguable. `idx_weekly_report_trainer` already
         * indexes exactly this access path.
         */
        changes.put("weekly_reports",       fetchDirect("weekly_report",     "trainer_id", tid, cursor));

        return new PullResponse(Instant.now().toEpochMilli(), changes);
    }

    // trainer_id FK is directly on this table
    private TableChanges fetchDirect(String table, String fkCol, String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT * FROM %s
                WHERE %s = :tid::uuid
                  AND deleted_at IS NULL
                  AND updated_at > :cursor
                ORDER BY updated_at ASC
                """.formatted(table, fkCol);

        String deadSql = """
                SELECT id::text FROM %s
                WHERE %s = :tid::uuid
                  AND deleted_at IS NOT NULL
                  AND updated_at > :cursor
                """.formatted(table, fkCol);

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // body_metric → client.trainer_id
    private TableChanges fetchViaClient(String table, String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT bm.* FROM %s bm
                JOIN client c ON c.id = bm.client_id
                WHERE c.trainer_id = :tid::uuid
                  AND bm.deleted_at IS NULL
                  AND bm.updated_at > :cursor
                ORDER BY bm.updated_at ASC
                """.formatted(table);

        String deadSql = """
                SELECT bm.id::text FROM %s bm
                JOIN client c ON c.id = bm.client_id
                WHERE c.trainer_id = :tid::uuid
                  AND bm.deleted_at IS NOT NULL
                  AND bm.updated_at > :cursor
                """.formatted(table);

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // exercises: global (is_custom=false) OR trainer's own custom
    private TableChanges fetchExercises(String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT * FROM exercise
                WHERE (is_custom = false OR trainer_id = :tid::uuid)
                  AND deleted_at IS NULL
                  AND updated_at > :cursor
                ORDER BY updated_at ASC
                """;

        String deadSql = """
                SELECT id::text FROM exercise
                WHERE (is_custom = false OR trainer_id = :tid::uuid)
                  AND deleted_at IS NOT NULL
                  AND updated_at > :cursor
                """;

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // program_exercise → program.trainer_id
    private TableChanges fetchViaProgramDirect(String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT pe.* FROM program_exercise pe
                JOIN program p ON p.id = pe.program_id
                WHERE p.trainer_id = :tid::uuid
                  AND pe.deleted_at IS NULL
                  AND pe.updated_at > :cursor
                ORDER BY pe.updated_at ASC
                """;

        String deadSql = """
                SELECT pe.id::text FROM program_exercise pe
                JOIN program p ON p.id = pe.program_id
                WHERE p.trainer_id = :tid::uuid
                  AND pe.deleted_at IS NOT NULL
                  AND pe.updated_at > :cursor
                """;

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // set_log and workout_exercise → workout_session.trainer_id
    private TableChanges fetchViaWorkout(String table, String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT r.* FROM %s r
                JOIN workout_session ws ON ws.id = r.workout_session_id
                WHERE ws.trainer_id = :tid::uuid
                  AND r.deleted_at IS NULL
                  AND r.updated_at > :cursor
                ORDER BY r.updated_at ASC
                """.formatted(table);

        String deadSql = """
                SELECT r.id::text FROM %s r
                JOIN workout_session ws ON ws.id = r.workout_session_id
                WHERE ws.trainer_id = :tid::uuid
                  AND r.deleted_at IS NOT NULL
                  AND r.updated_at > :cursor
                """.formatted(table);

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    /**
     * Every alive row goes in `updated`; `created` is always empty.
     *
     * This used to split the two by comparing each row's `created_at` against
     * the cursor, which is the only signal the server has — and it is the wrong
     * signal, because the question WatermelonDB is really asking is "does this
     * phone already hold this record", which the server cannot know. Two cases
     * broke it routinely: a row written before the cursor but edited after it
     * arrived as an update for something the phone had never seen, and a row
     * re-created server-side arrived as a create for something the phone still
     * had. Both logged "This could be a serious bug" and then quietly did the
     * right thing anyway.
     *
     * So the server stops guessing. The client pairs this with
     * `sendCreatedAsUpdated: true`, which is WatermelonDB's documented contract
     * for exactly this arrangement: send everything alive as an update, and it
     * inserts what is missing and updates what is not. Deletions are unchanged
     * — those the server does know about, from `deleted_at`.
     */
    private static TableChanges splitAlive(
            List<Map<String, Object>> rows, Timestamp cursor, List<String> deleted) {
        return new TableChanges(List.of(), rows, deleted);
    }

    // ── Push ──────────────────────────────────────────────────────────────────

    @Transactional
    public PushResult push(UUID trainerId, Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        var changes = (Map<String, Object>) body.get("changes");
        if (changes == null) return new PushResult(List.of());

        String tid = trainerId.toString();
        var rejected = new ArrayList<Rejection>();
        pushClients(tid, changes, rejected);
        pushBodyMetrics(tid, changes);
        // Before the sessions: `scheduled_session.batch_id` is a foreign key to
        // it, and a phone that created a batch and its four attendees offline
        // pushes all five in one round trip.
        pushBatches(tid, changes);
        pushTemplates(tid, changes);
        pushPrograms(tid, changes);
        pushProgramExercises(tid, changes);
        pushScheduledSessions(tid, changes);
        pushWorkoutSessions(tid, changes);
        // Before the sets: a set log is refused unless its workout is owned, and
        // a workout exercise is refused on the same test. Ordering them after
        // their parent means a phone that created all three offline pushes them
        // in one round trip rather than three.
        pushWorkoutExercises(tid, changes);
        pushSetLogs(tid, changes);
        pushPackages(tid, changes);
        pushPayments(tid, changes);
        pushNudgeLogs(tid, changes);
        pushWorkingHours(tid, changes);
        pushTimeBlocks(tid, changes);
        pushPacks(tid, changes);
        pushGymSettlements(tid, changes);
        pushExercises(tid, changes);
        pushNudgeRules(tid, changes);
        pushExerciseFavourites(tid, changes);
        warnOnUnhandledTables(tid, changes);
        log.debug("sync push trainer={} tables={}", tid, changes.keySet());
        return new PushResult(List.copyOf(rejected));
    }

    private static final Set<String> HANDLED_PUSH_TABLES = Set.of(
            "clients", "body_metrics", "templates", "programs", "program_exercises",
            "scheduled_sessions", "workout_sessions", "workout_exercises", "set_logs",
            "packages", "payments", "nudge_logs",
            "working_hours", "time_blocks",
            "packs", "gym_settlements",
            "exercises", "nudge_rules", "exercise_favourites",
            "batches");

    @SuppressWarnings("unchecked")
    private void warnOnUnhandledTables(String tid, Map<String, Object> changes) {
        for (var entry : changes.entrySet()) {
            if (HANDLED_PUSH_TABLES.contains(entry.getKey())) continue;
            if (!(entry.getValue() instanceof Map<?, ?> table)) continue;

            int count = mergeCreatedUpdated((Map<String, Object>) table).size()
                    + deletedIds((Map<String, Object>) table).size();
            if (count > 0) {
                log.warn("sync push trainer={}: DROPPED {} record(s) for unimplemented table '{}'",
                        tid, count, entry.getKey());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void pushClients(String tid, Map<String, Object> changes, List<Rejection> rejected) {
        var table = (Map<String, Object>) changes.get("clients");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String id = str(record.get("id"));
            if (id == null) {
                log.warn("push client: trainer={} dropping a record with no id", tid);
                continue;
            }
            String phone = str(record.get("phone"));

            /*
             * One number, one person, one place.
             *
             * A trainer's own number cannot sit on somebody else's roster
             * (`app_user.role` is exclusive and sign-in reads it as the whole
             * answer), and neither can a number that is already another
             * trainer's live client. The rule is applied here, at the push,
             * rather than only at add-time, because the roster is written
             * offline: the add screen asks first when it has signal, but a phone
             * on a gym floor with none does not, and this is where every write
             * eventually arrives.
             *
             * ── Refused, not corrected ────────────────────────────────────────
             *
             * This used to save the row with `membership_status = 'unavailable'`
             * — the record stood, only the invite was withheld — on the reasoning
             * that losing a client and their sessions to enforce a rule about app
             * access costs the trainer more than the rule is worth. That is still
             * true of a client who cannot be REACHED. It is not true of a person
             * who is somebody else, and the roster row was the bug: T1 could add
             * T2 and it looked like it worked.
             *
             * So a NEW row with a claimed number is never created. An EXISTING
             * one keeps everything except the number — the trainer's book must
             * not lose a name change because the phone edit beside it was wrong —
             * and both cases come back in the push response with a sentence.
             */
            // Existence and the stored number in one look: an absent row makes
            // this a create, and a number that has not moved is not re-judged —
            // a rule that arrived after a row did must not start failing the
            // re-push of a record it already accepted.
            var owned = jdbc.queryForList("""
                    SELECT phone FROM client WHERE id = :id::uuid AND trainer_id = :tid::uuid
                    """, Map.of("id", id, "tid", tid));
            boolean isNew = owned.isEmpty();
            String stored = isNew ? null : str(owned.get(0).get("phone"));

            var verdict = phone != null && !phone.equals(stored)
                    ? phoneGuard.check(tid, phone)
                    : ClientPhoneGuard.Verdict.ok();

            if (!verdict.available()) {
                rejected.add(new Rejection(
                        "clients", id, "phone", verdict.code(), verdict.message(), !isNew));
                log.info("push client: trainer={} refused phone on {} — {}", tid, id, verdict.code());
                if (isNew) continue;
                // Everything else in the record still lands, on the old number.
                phone = stored;
            }

            // The identity, created the moment a trainer names the number. This
            // is what an invite is FOR — the person does not exist to us until
            // somebody claims they train with them, and they have not agreed to
            // anything yet, which is exactly what `membership_status` carries.
            if (phone != null) {
                jdbc.update("""
                        INSERT INTO app_user (phone, role) VALUES (:phone, 'client')
                        ON CONFLICT (phone) DO NOTHING
                        """, Map.of("phone", phone));
            }

            var p = new HashMap<String, Object>();
            p.put("id",                    id);
            p.put("tid",                   tid);
            p.put("name",                  str(record.get("name")));
            p.put("phone",                 phone);
            p.put("goal",                  record.get("goal"));
            p.put("status",                strOrDefault(record.get("status"), "active"));
            p.put("payment_mode",          strOrDefault(record.get("payment_mode"), "trainer_collects"));
            p.put("trainer_split_percent", record.get("trainer_split_percent"));
            p.put("height_cm",             record.get("height_cm"));
            p.put("activity_level",        record.get("activity_level"));
            p.put("metadata",                 toJsonString(record.get("metadata")));
            p.put("sessions_per_week",        record.get("sessions_per_week"));
            p.put("session_duration_minutes", record.get("session_duration_minutes"));
            p.put("weekly_schedule",          toJsonString(record.get("weekly_schedule")));
            p.put("delivery_mode",            deliveryMode(record.get("delivery_mode")));
            p.put("created_at",               toTimestamp(record.get("created_at")));
            p.put("updated_at",               toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode,
                        trainer_split_percent, height_cm, activity_level, metadata,
                        sessions_per_week, session_duration_minutes, weekly_schedule,
                        delivery_mode, membership_status, invited_at, accepted_at,
                        created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :phone, :goal, :status, :payment_mode,
                        :trainer_split_percent, :height_cm, :activity_level,
                        CAST(:metadata AS jsonb),
                        :sessions_per_week, :session_duration_minutes,
                        CAST(:weekly_schedule AS jsonb),
                        :delivery_mode,
                        -- V18 · a trainer adding a number is a CLAIM, not a
                        -- relationship. It becomes one when the client accepts.
                        -- A client with no phone can never sign in to answer, so
                        -- there is nobody to ask and nothing to hold up: their
                        -- record is the trainer's alone and starts accepted.
                        -- There is no third case any more: a number that belongs
                        -- to somebody else never reaches this statement, it is
                        -- refused above and reported back to the phone.
                        -- CAST on every :phone here, and it is not decoration.
                        -- NamedParameterJdbcTemplate expands each occurrence
                        -- into its own `?`, so a :phone that appears only in an
                        -- `IS NULL` test has no inferable type and Postgres
                        -- refuses the statement with "could not determine data
                        -- type" — but ONLY when the value really is null, which
                        -- is exactly the client-with-no-phone case.
                        CASE WHEN CAST(:phone AS varchar) IS NULL THEN 'accepted'
                             ELSE 'invited' END,
                        CASE WHEN CAST(:phone AS varchar) IS NULL
                             THEN NULL ELSE NOW() END,
                        CASE WHEN CAST(:phone AS varchar) IS NULL
                             THEN NOW() ELSE NULL END,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name                    = EXCLUDED.name,
                        phone                   = EXCLUDED.phone,
                        goal                    = EXCLUDED.goal,
                        status                  = EXCLUDED.status,
                        payment_mode            = EXCLUDED.payment_mode,
                        trainer_split_percent   = EXCLUDED.trainer_split_percent,
                        height_cm               = EXCLUDED.height_cm,
                        activity_level          = EXCLUDED.activity_level,
                        metadata                = EXCLUDED.metadata,
                        sessions_per_week       = EXCLUDED.sessions_per_week,
                        session_duration_minutes= EXCLUDED.session_duration_minutes,
                        weekly_schedule         = EXCLUDED.weekly_schedule,
                        delivery_mode           = EXCLUDED.delivery_mode,
                        -- V14 · when access was paused, derived rather than sent.
                        -- The trainer's app flips `status` and knows nothing about
                        -- this column; sign-in on the CLIENT's phone needs the
                        -- date, because "Ravi paused your account on 22 July" is
                        -- information and "your access is paused" is a wall. Set
                        -- on the transition only, so re-syncing a paused client
                        -- does not keep moving the date forward, and cleared when
                        -- they come back.
                        paused_at               = CASE
                            WHEN EXCLUDED.status = 'paused' AND client.status <> 'paused'
                                THEN NOW()
                            WHEN EXCLUDED.status = 'paused'
                                THEN client.paused_at
                            ELSE NULL
                        END,
                        -- V18 · the trainer's end of the arrangement, mirrored
                        -- onto the client's. Derived here for the same reason
                        -- `paused_at` is: the trainer's app flips `status` and
                        -- knows nothing about this column.
                        --
                        -- An UNANSWERED invite is never overwritten. A trainer
                        -- pausing or archiving somebody who has not accepted does
                        -- not turn the invitation into an answer, and a refusal
                        -- is not theirs to reverse — those two states belong to
                        -- the client and only the client's own endpoints move
                        -- them. `archived` is the removal the notice announces;
                        -- the hard purge deletes the row outright and has no
                        -- membership left to describe.
                        membership_status = CASE
                            -- The trainer corrected a number that was refused
                            -- before this rule hardened. No new row is ever
                            -- written `unavailable` — the push refuses those
                            -- outright now — but rows already carrying it have
                            -- to be able to heal, and fixing the number is a
                            -- plain edit that makes the invite possible.
                            WHEN client.membership_status = 'unavailable'
                                THEN 'invited'
                            WHEN client.membership_status IN ('invited', 'declined')
                                THEN client.membership_status
                            WHEN EXCLUDED.status = 'archived' THEN 'removed'
                            WHEN EXCLUDED.status = 'paused'   THEN 'paused'
                            ELSE 'accepted'
                        END,
                        -- Stamped when a corrected number finally makes an
                        -- invite possible, and cleared while it isn't.
                        --
                        -- The clock therefore restarts on recovery rather than
                        -- running from the first attempt, and that is deliberate:
                        -- the roster ages an invite into "Invited 30 days ago ·
                        -- not set up", which would be a lie about an invite that
                        -- only became sendable today. Nobody was ignoring it —
                        -- it could not be delivered.
                        invited_at = CASE
                            WHEN client.membership_status = 'unavailable' THEN NOW()
                            ELSE client.invited_at
                        END,
                        removed_at = CASE
                            WHEN client.membership_status IN ('invited', 'declined', 'unavailable')
                                THEN client.removed_at
                            WHEN EXCLUDED.status = 'archived' AND client.status <> 'archived'
                                THEN NOW()
                            WHEN EXCLUDED.status = 'archived'
                                THEN client.removed_at
                            ELSE NULL
                        END,
                        -- Cleared when they are taken off archive, so that a
                        -- client who is removed, told, and later brought back is
                        -- told again if it happens a second time.
                        removed_ack_at = CASE
                            WHEN client.membership_status IN ('invited', 'declined', 'unavailable')
                                THEN client.removed_ack_at
                            WHEN EXCLUDED.status = 'archived'
                                THEN client.removed_ack_at
                            ELSE NULL
                        END,
                        updated_at              = EXCLUDED.updated_at
                    WHERE client.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE client SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushBodyMetrics(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("body_metrics");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            // Validate client ownership before upsert
            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("push body_metric: client {} not owned by trainer {}, skipping", clientId, tid);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("client_id",   clientId);
            p.put("metric_type", str(record.get("metric_type")));
            p.put("value",       record.get("value"));
            p.put("unit",        str(record.get("unit")));
            p.put("notes",       record.get("notes"));
            p.put("recorded_at", toTimestamp(record.get("recorded_at")));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO body_metric (id, client_id, metric_type, value, unit, notes, recorded_at, created_at, updated_at)
                    VALUES (:id::uuid, :client_id::uuid, :metric_type, :value, :unit, :notes,
                        :recorded_at, COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        metric_type = EXCLUDED.metric_type,
                        value       = EXCLUDED.value,
                        unit        = EXCLUDED.unit,
                        notes       = EXCLUDED.notes,
                        recorded_at = EXCLUDED.recorded_at,
                        updated_at  = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE body_metric bm SET deleted_at = NOW(), updated_at = NOW()
                    FROM client c
                    WHERE bm.id = :id::uuid AND bm.client_id = c.id
                      AND c.trainer_id = :tid::uuid AND bm.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushTemplates(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("templates");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("tid",         tid);
            p.put("name",        str(record.get("name")));
            p.put("goal",        record.get("goal"));
            p.put("description", record.get("description"));
            p.put("structure",   toJsonString(record.get("structure")));
            p.put("day_labels",  toJsonString(record.get("day_labels")));
            // V12. How long the program runs, which is what the Programs screen
            // draws its weeks × days matrix from.
            p.put("weeks",       record.get("weeks"));
            // V20, ordinal since V24. The day slots the program trains on,
            // "1,2,3" — which weekday each slot lands on is per client, chosen
            // at apply time. Held apart from the blueprint because a day exists
            // as soon as the trainer lays it out, before anything is put on it.
            p.put("training_days", record.get("training_days"));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels, weeks, training_days, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                        CAST(:structure AS jsonb), CAST(:day_labels AS jsonb), :weeks, :training_days,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name          = EXCLUDED.name,
                        goal          = EXCLUDED.goal,
                        description   = EXCLUDED.description,
                        structure     = EXCLUDED.structure,
                        day_labels    = EXCLUDED.day_labels,
                        weeks         = EXCLUDED.weeks,
                        training_days = EXCLUDED.training_days,
                        updated_at    = EXCLUDED.updated_at
                    WHERE template.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE template SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPrograms(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("programs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping program — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",         str(record.get("id")));
            p.put("tid",        tid);
            p.put("cid",        clientId);
            p.put("templateId", record.get("template_id"));
            p.put("name",       str(record.get("name")));
            p.put("goal",       record.get("goal"));
            p.put("startDate",  toSqlDate(record.get("start_date")));
            p.put("endDate",    toSqlDate(record.get("end_date")));
            p.put("status",     strOrDefault(record.get("status"), "active"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO program (id, trainer_id, client_id, template_id, name, goal,
                        start_date, end_date, status, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :templateId::uuid, :name, :goal,
                        :startDate, :endDate, :status,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name       = EXCLUDED.name,
                        goal       = EXCLUDED.goal,
                        start_date = EXCLUDED.start_date,
                        end_date   = EXCLUDED.end_date,
                        status     = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at
                    WHERE program.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE program SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushProgramExercises(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("program_exercises");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String programId = str(record.get("program_id"));
            if (programId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM program WHERE id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("pid", programId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping program_exercise — program {} not owned", tid, programId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("programId",   programId);
            p.put("exerciseId",  str(record.get("exercise_id")));
            p.put("sets",        record.get("sets"));
            p.put("reps",        record.get("reps"));
            p.put("restSeconds", record.get("rest_seconds"));
            // V25. A timed prescription's seconds, carried instead of reps.
            p.put("durationSeconds", record.get("duration_seconds"));
            p.put("targetLoad",  record.get("target_load"));
            p.put("notes",       record.get("notes"));
            p.put("dayOfWeek",   record.get("day_of_week"));
            p.put("orderIndex",  record.getOrDefault("order_index", 0));
            // V20. NULL reads as week 1, which is what every row written before
            // multi-week programs existed meant.
            p.put("week",        record.get("week"));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, duration_seconds, target_load, notes, day_of_week, week, order_index, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :durationSeconds, :targetLoad, :notes, :dayOfWeek, :week, :orderIndex,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        sets             = EXCLUDED.sets,
                        reps             = EXCLUDED.reps,
                        rest_seconds     = EXCLUDED.rest_seconds,
                        duration_seconds = EXCLUDED.duration_seconds,
                        target_load      = EXCLUDED.target_load,
                        notes            = EXCLUDED.notes,
                        day_of_week      = EXCLUDED.day_of_week,
                        week             = EXCLUDED.week,
                        order_index      = EXCLUDED.order_index,
                        updated_at       = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE program_exercise pe SET deleted_at = NOW(), updated_at = NOW()
                    FROM program p
                    WHERE pe.id = :id::uuid AND pe.program_id = p.id
                      AND p.trainer_id = :tid::uuid AND pe.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushScheduledSessions(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("scheduled_sessions");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping scheduled_session — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",              str(record.get("id")));
            p.put("tid",             tid);
            p.put("cid",             clientId);
            p.put("programId",       record.get("program_id"));
            p.put("scheduledAt",     toTimestamp(record.get("scheduled_at")));
            p.put("durationMinutes", record.get("duration_minutes"));
            p.put("status",          strOrDefault(record.get("status"), "scheduled"));
            p.put("notes",           record.get("notes"));
            p.put("dayLabel",        record.get("day_label"));
            p.put("templateDay",     record.get("template_day"));
            p.put("deliveryMode",    deliveryMode(record.get("delivery_mode")));
            // V10 · diary. The pack trio travels with the session because it is
            // what makes the 24-hour undo exact rather than a recomputation.
            p.put("seriesId",        uuidOrNull(record.get("series_id"), "series_id"));
            p.put("cancelledBy",     cancelledBy(record.get("cancelled_by")));
            p.put("packDelta",       record.get("pack_delta"));
            p.put("packPackageId",   uuidOrNull(record.get("pack_package_id"), "pack_package_id"));
            p.put("packAppliedAt",   toTimestamp(record.get("pack_applied_at")));
            // V14 · the move, from the client's side of it. `moved_from_at` is
            // what the client's notice strikes through, and the confirm is theirs
            // to write — it travels here too so a trainer who moves a session
            // twice does not blank an answer the client already gave.
            p.put("movedFromAt",     toTimestamp(record.get("moved_from_at")));
            p.put("clientConfirmedAt", toTimestamp(record.get("client_confirmed_at")));
            // V15 · which batch this attendee belongs to, if any.
            p.put("batchId",         uuidOrNull(record.get("batch_id"), "batch_id"));
            p.put("created_at",      toTimestamp(record.get("created_at")));
            p.put("updated_at",      toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, program_id,
                        scheduled_at, duration_minutes, status, notes, day_label, template_day,
                        delivery_mode, series_id, cancelled_by, pack_delta, pack_package_id,
                        pack_applied_at, moved_from_at, client_confirmed_at, batch_id,
                        created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid,
                        :scheduledAt, :durationMinutes, :status, :notes, :dayLabel, :templateDay,
                        :deliveryMode, :seriesId::uuid, :cancelledBy, :packDelta,
                        :packPackageId::uuid, :packAppliedAt, :movedFromAt, :clientConfirmedAt,
                        :batchId::uuid,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        scheduled_at     = EXCLUDED.scheduled_at,
                        duration_minutes = EXCLUDED.duration_minutes,
                        status           = EXCLUDED.status,
                        notes            = EXCLUDED.notes,
                        day_label        = EXCLUDED.day_label,
                        template_day     = EXCLUDED.template_day,
                        delivery_mode    = EXCLUDED.delivery_mode,
                        series_id        = EXCLUDED.series_id,
                        cancelled_by     = EXCLUDED.cancelled_by,
                        pack_delta       = EXCLUDED.pack_delta,
                        pack_package_id  = EXCLUDED.pack_package_id,
                        pack_applied_at  = EXCLUDED.pack_applied_at,
                        moved_from_at    = EXCLUDED.moved_from_at,
                        -- The client's own answer. A trainer's push may set it —
                        -- their phone pulled it — but must never clear it, so a
                        -- null from the trainer's side keeps whatever is stored.
                        client_confirmed_at = COALESCE(EXCLUDED.client_confirmed_at,
                                                       scheduled_session.client_confirmed_at),
                        batch_id         = EXCLUDED.batch_id,
                        updated_at       = EXCLUDED.updated_at
                    WHERE scheduled_session.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE scheduled_session SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushWorkoutSessions(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("workout_sessions");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping workout_session — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",                 str(record.get("id")));
            p.put("tid",                tid);
            p.put("cid",                clientId);
            p.put("programId",          record.get("program_id"));
            p.put("scheduledSessionId", record.get("scheduled_session_id"));
            p.put("loggedBy",           strOrDefault(record.get("logged_by"), "trainer"));
            p.put("sessionDate",        toSqlDate(record.get("session_date")));
            p.put("notes",              record.get("notes"));
            // V13. When the log was closed, which is not the same fact as
            // whether the session counted — that one lives on scheduled_session.
            p.put("endedAt",            toTimestamp(record.get("ended_at")));
            p.put("created_at",         toTimestamp(record.get("created_at")));
            p.put("updated_at",         toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO workout_session (id, trainer_id, client_id, program_id,
                        scheduled_session_id, logged_by, session_date, notes, ended_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid,
                        :scheduledSessionId::uuid, :loggedBy, :sessionDate, :notes, :endedAt,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        session_date = EXCLUDED.session_date,
                        notes        = EXCLUDED.notes,
                        ended_at     = EXCLUDED.ended_at,
                        updated_at   = EXCLUDED.updated_at
                    WHERE workout_session.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE workout_session SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /**
     * V13 · what was actually in each session.
     *
     * Every column is writable on conflict except `workout_session_id` and
     * `exercise_id`, which are the row's identity — a row that changed either
     * would be a different exercise wearing the same id, and its set logs would
     * quietly re-attribute themselves.
     *
     * A swap is the one case that looks like it wants to move `exercise_id`, and
     * it deliberately does not: the phone deletes the planned row and creates a
     * new one carrying `swapped_from_exercise_id`. Two rows, because two things
     * happened.
     */
    @SuppressWarnings("unchecked")
    private void pushWorkoutExercises(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("workout_exercises");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String workoutId = str(record.get("workout_session_id"));
            if (workoutId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM workout_session WHERE id = :wid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("wid", workoutId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping workout_exercise — workout_session {} not owned", tid, workoutId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("workoutId",   workoutId);
            p.put("exerciseId",  str(record.get("exercise_id")));
            p.put("orderIndex",  record.getOrDefault("order_index", 0));
            p.put("source",      strOrDefault(record.get("source"), "planned"));
            p.put("swappedFrom", uuidOrNull(record.get("swapped_from_exercise_id"), "swapped_from_exercise_id"));
            p.put("targetSets",  record.get("target_sets"));
            p.put("targetReps",  record.get("target_reps"));
            p.put("restSeconds", record.get("rest_seconds"));
            p.put("removedAt",   toTimestamp(record.get("removed_at")));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index,
                        source, swapped_from_exercise_id, target_sets, target_reps, rest_seconds,
                        removed_at, created_at, updated_at)
                    VALUES (:id::uuid, :workoutId::uuid, :exerciseId::uuid, :orderIndex,
                        :source, :swappedFrom::uuid, :targetSets, :targetReps, :restSeconds,
                        :removedAt, COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
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

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE workout_exercise we SET deleted_at = NOW(), updated_at = NOW()
                    FROM workout_session ws
                    WHERE we.id = :id::uuid AND we.workout_session_id = ws.id
                      AND ws.trainer_id = :tid::uuid AND we.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushSetLogs(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("set_logs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String workoutId = str(record.get("workout_session_id"));
            if (workoutId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM workout_session WHERE id = :wid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("wid", workoutId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping set_log — workout_session {} not owned", tid, workoutId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",        str(record.get("id")));
            p.put("workoutId", workoutId);
            p.put("exerciseId", str(record.get("exercise_id")));
            p.put("setNumber", record.get("set_number"));
            p.put("loadKg",    record.get("load_kg"));
            p.put("reps",      record.get("reps"));
            p.put("rpe",       record.get("rpe"));
            p.put("notes",     record.get("notes"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO set_log (id, workout_session_id, exercise_id, set_number,
                        load_kg, reps, rpe, notes, created_at, updated_at)
                    VALUES (:id::uuid, :workoutId::uuid, :exerciseId::uuid, :setNumber,
                        :loadKg, :reps, :rpe, :notes,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        load_kg    = EXCLUDED.load_kg,
                        reps       = EXCLUDED.reps,
                        rpe        = EXCLUDED.rpe,
                        notes      = EXCLUDED.notes,
                        updated_at = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE set_log sl SET deleted_at = NOW(), updated_at = NOW()
                    FROM workout_session ws
                    WHERE sl.id = :id::uuid AND sl.workout_session_id = ws.id
                      AND ws.trainer_id = :tid::uuid AND sl.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPackages(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("packages");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping package — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",                 str(record.get("id")));
            p.put("tid",                tid);
            p.put("cid",                clientId);
            p.put("type",               strOrDefault(record.get("type"), "session_pack"));
            p.put("sessionsTotal",      record.get("sessions_total"));
            p.put("sessionsRemaining",  record.get("sessions_remaining"));
            p.put("amount",             record.get("amount"));
            p.put("currency",           strOrDefault(record.get("currency"), "INR"));
            p.put("startDate",          toSqlDate(record.get("start_date")));
            p.put("endDate",            toSqlDate(record.get("end_date")));
            p.put("status",             strOrDefault(record.get("status"), "active"));
            // Screen 06 · the debt side of the book.
            p.put("packId",             record.get("pack_id"));
            p.put("dueDate",            toSqlDate(record.get("due_date")));
            p.put("writtenOffAt",       toTimestamp(record.get("written_off_at")));
            p.put("writtenOffAmount",   record.get("written_off_amount"));
            // V19 · what was knocked off the list price at the till. `amount` is
            // already net of it; this only records why it is lower.
            p.put("discountAmount",     record.get("discount_amount"));
            p.put("created_at",         toTimestamp(record.get("created_at")));
            p.put("updated_at",         toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                        amount, currency, start_date, end_date, status, pack_id, due_date,
                        written_off_at, written_off_amount, discount_amount, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :type, :sessionsTotal, :sessionsRemaining,
                        :amount, :currency, :startDate, :endDate, :status, :packId::uuid, :dueDate,
                        :writtenOffAt, :writtenOffAmount, :discountAmount,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        type                = EXCLUDED.type,
                        sessions_total      = EXCLUDED.sessions_total,
                        sessions_remaining  = EXCLUDED.sessions_remaining,
                        amount              = EXCLUDED.amount,
                        currency            = EXCLUDED.currency,
                        start_date          = EXCLUDED.start_date,
                        end_date            = EXCLUDED.end_date,
                        status              = EXCLUDED.status,
                        pack_id             = EXCLUDED.pack_id,
                        due_date            = EXCLUDED.due_date,
                        written_off_at      = EXCLUDED.written_off_at,
                        written_off_amount  = EXCLUDED.written_off_amount,
                        -- Same reasoning as pack.owner: a build that doesn't know
                        -- the column sends nothing, and nothing must not erase it.
                        discount_amount     = COALESCE(EXCLUDED.discount_amount, package.discount_amount),
                        updated_at          = EXCLUDED.updated_at
                    WHERE package.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE package SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPayments(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("payments");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping payment — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",           str(record.get("id")));
            p.put("tid",          tid);
            p.put("cid",          clientId);
            p.put("packageId",    record.get("package_id"));
            p.put("amount",       record.get("amount"));
            p.put("currency",     strOrDefault(record.get("currency"), "INR"));
            p.put("method",       strOrDefault(record.get("method"), "upi_intent"));
            p.put("collectedBy",  strOrDefault(record.get("collected_by"), "trainer"));
            p.put("status",       strOrDefault(record.get("status"), "pending"));
            p.put("upiReference", record.get("upi_reference"));
            p.put("paidAt",       toTimestamp(record.get("paid_at")));
            // Screen 06. The cut was worked out on the device at record time and
            // travels with the row — never recomputed here, or a contract change
            // in October would silently rewrite September.
            p.put("gymShare",     record.get("gym_share_amount"));
            p.put("sharePercent", record.get("share_percent"));
            p.put("receiptNo",    record.get("receipt_no"));
            p.put("note",         record.get("note"));
            p.put("created_at",   toTimestamp(record.get("created_at")));
            p.put("updated_at",   toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency,
                        method, collected_by, status, upi_reference, paid_at,
                        gym_share_amount, share_percent, receipt_no, note, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :packageId::uuid, :amount, :currency,
                        :method, :collectedBy, :status, :upiReference, :paidAt,
                        :gymShare, :sharePercent, :receiptNo, :note,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        amount           = EXCLUDED.amount,
                        method           = EXCLUDED.method,
                        collected_by     = EXCLUDED.collected_by,
                        status           = EXCLUDED.status,
                        upi_reference    = EXCLUDED.upi_reference,
                        paid_at          = EXCLUDED.paid_at,
                        gym_share_amount = EXCLUDED.gym_share_amount,
                        share_percent    = EXCLUDED.share_percent,
                        receipt_no       = EXCLUDED.receipt_no,
                        note             = EXCLUDED.note,
                        updated_at       = EXCLUDED.updated_at
                    WHERE payment.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE payment SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushNudgeLogs(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("nudge_logs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            var p = new HashMap<String, Object>();
            p.put("id",           str(record.get("id")));
            p.put("tid",          tid);
            p.put("cid",          clientId);
            p.put("channel",      strOrDefault(record.get("channel"), "whatsapp"));
            p.put("templateName", strOrDefault(record.get("template_name"), "unknown"));
            p.put("status",       strOrDefault(record.get("status"), "sent"));
            p.put("sentAt",       toTimestamp(record.get("sent_at")));
            p.put("created_at",   toTimestamp(record.get("created_at")));
            p.put("updated_at",   toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :channel, :templateName, :status,
                        COALESCE(:sentAt, NOW()), COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        status     = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at
                    WHERE nudge_log.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE nudge_log SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    // ── Push helpers ──────────────────────────────────────────────────────────

    /**
     * Working hours (V10).
     *
     * No ownership hop to make — the trainer is on the row — so this is the
     * simplest handler in the file. Windows are replaced wholesale by the app
     * rather than edited in place: a day's hours are one idea, and diffing two
     * lists of intervals on a phone to save one delete is not worth the bug.
     */
    @SuppressWarnings("unchecked")
    private void pushWorkingHours(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("working_hours");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",         str(record.get("id")));
            p.put("tid",        tid);
            p.put("weekday",    clampWeekday(record.get("weekday")));
            p.put("startMin",   clampMinute(record.get("start_minute")));
            p.put("endMin",     clampMinute(record.get("end_minute")));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            // A window that starts after it ends is a client bug, not data.
            if (p.get("weekday") == null || p.get("startMin") == null || p.get("endMin") == null
                    || (int) p.get("startMin") >= (int) p.get("endMin")) {
                log.warn("sync push trainer={}: skipping working_hours {} — invalid window", tid, p.get("id"));
                continue;
            }

            jdbc.update("""
                    INSERT INTO working_hours (id, trainer_id, weekday, start_minute, end_minute,
                        created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :weekday, :startMin, :endMin,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        weekday      = EXCLUDED.weekday,
                        start_minute = EXCLUDED.start_minute,
                        end_minute   = EXCLUDED.end_minute,
                        updated_at   = EXCLUDED.updated_at
                    WHERE working_hours.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE working_hours SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /**
     * Time blocks (V10).
     *
     * Nothing here touches the sessions inside the block. What happens to them
     * is the trainer's choice in the sheet (5b) and arrives as ordinary session
     * pushes; a block that cancelled bookings as a side effect of syncing would
     * be a diary that empties itself.
     */
    @SuppressWarnings("unchecked")
    private void pushTimeBlocks(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("time_blocks");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var starts = toTimestamp(record.get("starts_at"));
            var ends   = toTimestamp(record.get("ends_at"));
            if (starts == null || ends == null || !ends.after(starts)) {
                log.warn("sync push trainer={}: skipping time_block {} — invalid range",
                        tid, str(record.get("id")));
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",         str(record.get("id")));
            p.put("tid",        tid);
            p.put("startsAt",   starts);
            p.put("endsAt",     ends);
            p.put("allDay",     bool(record.get("all_day")));
            p.put("reason",     record.get("reason"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO time_block (id, trainer_id, starts_at, ends_at, all_day, reason,
                        created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :startsAt, :endsAt, :allDay, :reason,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        starts_at  = EXCLUDED.starts_at,
                        ends_at    = EXCLUDED.ends_at,
                        all_day    = EXCLUDED.all_day,
                        reason     = EXCLUDED.reason,
                        updated_at = EXCLUDED.updated_at
                    WHERE time_block.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE time_block SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /**
     * The price list. Trainer-scoped and tiny — a handful of rows that change
     * once in a while and are read on every Money open.
     */
    @SuppressWarnings("unchecked")
    private void pushPacks(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("packs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",           str(record.get("id")));
            p.put("tid",          tid);
            p.put("name",         strOrDefault(record.get("name"), "Pack"));
            p.put("type",         strOrDefault(record.get("type"), "session_pack"));
            p.put("sessions",     record.get("sessions"));
            p.put("amount",       record.get("amount"));
            p.put("currency",     strOrDefault(record.get("currency"), "INR"));
            p.put("validityDays", record.get("validity_days"));
            p.put("status",       strOrDefault(record.get("status"), "active"));
            // V19 · whose price this is.
            //
            // Absent and 'trainer' are NOT the same thing on an update. A build
            // that predates the gym price list still edits packs, and it sends
            // every column it knows about — which does not include this one. Sent
            // as null, it means "I have nothing to say about the owner", and the
            // statement below keeps whatever is already there rather than
            // quietly moving the gym's package onto the trainer's list.
            p.put("owner",        record.get("owner") == null ? null
                                : ("gym".equals(str(record.get("owner"))) ? "gym" : "trainer"));
            p.put("orderIndex",   record.get("order_index") == null ? 0 : record.get("order_index"));
            p.put("created_at",   toTimestamp(record.get("created_at")));
            p.put("updated_at",   toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO pack (id, trainer_id, name, type, sessions, amount, currency,
                        validity_days, status, owner, order_index, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :type, :sessions, :amount, :currency,
                        :validityDays, :status, COALESCE(CAST(:owner AS VARCHAR), 'trainer'), :orderIndex,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name          = EXCLUDED.name,
                        type          = EXCLUDED.type,
                        sessions      = EXCLUDED.sessions,
                        amount        = EXCLUDED.amount,
                        currency      = EXCLUDED.currency,
                        validity_days = EXCLUDED.validity_days,
                        status        = EXCLUDED.status,
                        owner         = COALESCE(CAST(:owner AS VARCHAR), pack.owner),
                        order_index   = EXCLUDED.order_index,
                        updated_at    = EXCLUDED.updated_at
                    WHERE pack.trainer_id = :tid::uuid
                    """, p);
        }

        // A pack a package points at is never really deleted — the FK would
        // refuse, and rightly: retiring a price must not rewrite what was sold.
        // The app retires by status; this path only fires for one never used.
        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE pack SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM package WHERE pack_id = pack.id AND deleted_at IS NULL)
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /** Money going out to the gym. One row per month, and it settles or it doesn't. */
    @SuppressWarnings("unchecked")
    private void pushGymSettlements(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("gym_settlements");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String period = str(record.get("period"));
            if (period == null || !period.matches("\\d{4}-\\d{2}")) {
                log.warn("sync push trainer={}: skipping gym_settlement {} — bad period '{}'",
                        tid, str(record.get("id")), period);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",              str(record.get("id")));
            p.put("tid",             tid);
            p.put("period",          period);
            p.put("amount",          record.get("amount"));
            p.put("sessionsCounted", record.get("sessions_counted"));
            p.put("gymName",         record.get("gym_name"));
            p.put("status",          strOrDefault(record.get("status"), "due"));
            p.put("dueAt",           toTimestamp(record.get("due_at")));
            p.put("settledAt",       toTimestamp(record.get("settled_at")));
            p.put("created_at",      toTimestamp(record.get("created_at")));
            p.put("updated_at",      toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO gym_settlement (id, trainer_id, period, amount, sessions_counted,
                        gym_name, status, due_at, settled_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :period, :amount, :sessionsCounted,
                        :gymName, :status, :dueAt, :settledAt,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        period           = EXCLUDED.period,
                        amount           = EXCLUDED.amount,
                        sessions_counted = EXCLUDED.sessions_counted,
                        gym_name         = EXCLUDED.gym_name,
                        status           = EXCLUDED.status,
                        due_at           = EXCLUDED.due_at,
                        settled_at       = EXCLUDED.settled_at,
                        updated_at       = EXCLUDED.updated_at
                    WHERE gym_settlement.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE gym_settlement SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /**
     * The trainer's own exercises.
     *
     * Only theirs. 861 of the 873 rows in the library are shared — `is_custom =
     * false`, no trainer_id — and are readable by everyone and writable by
     * nobody, so both the INSERT and the UPDATE guard on ownership. A phone that
     * somehow pushes a global row changes nothing rather than editing the
     * library out from under every other trainer.
     *
     * `log_type` is set on insert and never on update, which is where the
     * immutability rule actually lives: the sheet greys the control out, but a
     * stale device replaying an old record must not be able to move it either.
     * Every set already logged against the exercise would stop making sense.
     */
    @SuppressWarnings("unchecked")
    private void pushExercises(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("exercises");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            // A phone should never be sending one of these, but if it does the
            // right response is to drop it, not to trust it.
            if (Boolean.FALSE.equals(record.get("is_custom"))) {
                log.warn("sync push trainer={}: ignoring non-custom exercise {}",
                        tid, str(record.get("id")));
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("tid",         tid);
            p.put("name",        strOrDefault(record.get("name"), "Exercise"));
            p.put("muscleGroup", record.get("muscle_group"));
            p.put("equipment",   record.get("equipment"));
            p.put("pattern",     record.get("movement_pattern"));
            p.put("description", record.get("description"));
            p.put("logType",     strOrDefault(record.get("log_type"), "weight_reps"));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern,
                        description, is_custom, trainer_id, log_type, created_at, updated_at)
                    VALUES (:id::uuid, :name, :muscleGroup, :equipment, :pattern,
                        :description, TRUE, :tid::uuid, :logType,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name             = EXCLUDED.name,
                        muscle_group     = EXCLUDED.muscle_group,
                        equipment        = EXCLUDED.equipment,
                        movement_pattern = EXCLUDED.movement_pattern,
                        description      = EXCLUDED.description,
                        updated_at       = EXCLUDED.updated_at
                    WHERE exercise.trainer_id = :tid::uuid AND exercise.is_custom
                    """, p);
        }

        // A custom exercise a program still points at stays: deleting it would
        // leave a program day referring to nothing, and the trainer asked to
        // remove it from their library, not to edit somebody's plan.
        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE exercise SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND is_custom
                      AND deleted_at IS NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM program_exercise pe
                          WHERE pe.exercise_id = exercise.id AND pe.deleted_at IS NULL)
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /**
     * If / then rules.
     *
     * `nudge_rule` carries a unique index on (trainer_id, kind), so a second
     * device that seeded its own five before the first pull reached it would
     * collide on that index rather than on the primary key — and an
     * `ON CONFLICT (id)` clause does not catch a conflict on a different one.
     * The reconciliation below is deliberately last-write-wins, the same policy
     * as every other table here: the arriving row is kept and the resident one
     * with the same kind is soft-deleted.
     */
    /**
     * A batch. Thin by design: it carries what is true of the group, and nothing
     * about any one attendee — that all lives on their own scheduled session.
     */
    @SuppressWarnings("unchecked")
    private void pushBatches(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("batches");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",         str(record.get("id")));
            p.put("tid",        tid);
            p.put("name",       strOrDefault(record.get("name"), "Batch"));
            p.put("capacity",   record.get("capacity") == null ? 10 : record.get("capacity"));
            p.put("minSize",    record.get("min_size") == null ? 4 : record.get("min_size"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO batch (id, trainer_id, name, capacity, min_size, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :capacity, :minSize,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name       = EXCLUDED.name,
                        capacity   = EXCLUDED.capacity,
                        min_size   = EXCLUDED.min_size,
                        deleted_at = NULL,
                        updated_at = EXCLUDED.updated_at
                    WHERE batch.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            // The attendees' own rows are pushed separately and are not orphaned
            // by this: a session whose batch is gone reads as a one-to-one, which
            // is what a batch that stopped running actually leaves behind.
            jdbc.update("""
                    UPDATE batch SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushNudgeRules(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("nudge_rules");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String id = str(record.get("id"));
            String kind = str(record.get("kind"));
            if (kind == null || kind.isBlank()) {
                log.warn("sync push trainer={}: skipping nudge_rule {} — no kind", tid, id);
                continue;
            }

            int cleared = jdbc.update("""
                    UPDATE nudge_rule SET deleted_at = NOW(), updated_at = NOW()
                    WHERE trainer_id = :tid::uuid AND kind = :kind
                      AND id <> :id::uuid AND deleted_at IS NULL
                    """, Map.of("tid", tid, "kind", kind, "id", id));
            if (cleared > 0) {
                log.info("sync push trainer={}: reconciled {} duplicate '{}' rule(s)", tid, cleared, kind);
            }

            var p = new HashMap<String, Object>();
            p.put("id",         id);
            p.put("tid",        tid);
            p.put("kind",       kind);
            p.put("threshold",  record.get("threshold"));
            p.put("action",     strOrDefault(record.get("action"), "ask"));
            p.put("message",    record.get("message"));
            p.put("enabled",    !Boolean.FALSE.equals(record.get("enabled")));
            p.put("orderIndex", record.get("order_index") == null ? 0 : record.get("order_index"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO nudge_rule (id, trainer_id, kind, threshold, action, message,
                        enabled, order_index, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :kind, :threshold, :action, :message,
                        :enabled, :orderIndex,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        kind        = EXCLUDED.kind,
                        threshold   = EXCLUDED.threshold,
                        action      = EXCLUDED.action,
                        message     = EXCLUDED.message,
                        enabled     = EXCLUDED.enabled,
                        order_index = EXCLUDED.order_index,
                        deleted_at  = NULL,
                        updated_at  = EXCLUDED.updated_at
                    WHERE nudge_rule.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE nudge_rule SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    /** A star. Same duplicate-index reconciliation as the rules above, for the same reason. */
    @SuppressWarnings("unchecked")
    private void pushExerciseFavourites(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("exercise_favourites");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String id = str(record.get("id"));
            String exerciseId = str(record.get("exercise_id"));
            if (exerciseId == null) {
                log.warn("sync push trainer={}: skipping favourite {} — no exercise", tid, id);
                continue;
            }

            jdbc.update("""
                    UPDATE exercise_favourite SET deleted_at = NOW(), updated_at = NOW()
                    WHERE trainer_id = :tid::uuid AND exercise_id = :ex::uuid
                      AND id <> :id::uuid AND deleted_at IS NULL
                    """, Map.of("tid", tid, "ex", exerciseId, "id", id));

            var p = new HashMap<String, Object>();
            p.put("id",         id);
            p.put("tid",        tid);
            p.put("ex",         exerciseId);
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            // A favourite pointing at an exercise the server has never heard of
            // is dropped by the FK rather than accepted and left dangling.
            try {
                jdbc.update("""
                        INSERT INTO exercise_favourite (id, trainer_id, exercise_id, created_at, updated_at)
                        VALUES (:id::uuid, :tid::uuid, :ex::uuid,
                            COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                        ON CONFLICT (id) DO UPDATE SET
                            deleted_at = NULL,
                            updated_at = EXCLUDED.updated_at
                        WHERE exercise_favourite.trainer_id = :tid::uuid
                        """, p);
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                log.warn("sync push trainer={}: favourite {} references unknown exercise {}",
                        tid, id, exerciseId);
            }
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE exercise_favourite SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    // The row plumbing lives in SyncRows, shared with the client-scoped service
    // (FR-11). Two copies of normalizeValue would drift, and the drift would
    // show up on one half of the product only.
    private List<Map<String, Object>> mergeCreatedUpdated(Map<String, Object> table) {
        return SyncRows.mergeCreatedUpdated(table);
    }

    private List<String> deletedIds(Map<String, Object> table) {
        return SyncRows.deletedIds(table);
    }

    private String str(Object v) {
        return SyncRows.str(v);
    }

    /**
     * A value bound to a `uuid` column, or NULL if it is not one.
     *
     * Postgres rejects a malformed uuid with an error, and {@link #push} is a
     * single transaction — so ONE unparseable id from one row rolls back the
     * entire batch: clients, metrics, templates, sessions, logs and money. The
     * device then retries the same batch forever and stops syncing altogether,
     * with no symptom beyond a pending count that never falls.
     *
     * That is exactly what happened: `bookSeries` wrote `series_<random>` into
     * `series_id`, and every trainer who booked a recurring session silently
     * stopped syncing anything. The app is fixed and repairs itself on launch,
     * but an old build is forever, so the server stops trusting the input.
     *
     * Dropped to NULL rather than refused, because these are all OPTIONAL
     * grouping columns — a series id, a batch id, the pack a session was drawn
     * from. Losing one costs the grouping on that row; refusing the push costs
     * the trainer everything they did offline. Logged, so a client generating
     * bad ids is visible rather than silently tolerated.
     */
    private String uuidOrNull(Object v, String column) {
        String raw = str(v);
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw).toString();
        } catch (IllegalArgumentException e) {
            log.warn("push: dropping malformed uuid in {} — {}", column, raw);
            return null;
        }
    }

    private String strOrDefault(Object v, String defaultVal) {
        String s = str(v);
        return s != null ? s : defaultVal;
    }

    /**
     * 'floor' | 'remote' | null.
     *
     * No default, unlike the status fields above: null here means "nobody has
     * said", which is what lets a session inherit its client's usual mode.
     * Defaulting it to 'floor' would make every session look like a deliberate
     * answer and the fallback would never fire.
     *
     * An unrecognised value degrades to null rather than failing the push — a
     * phone on a newer build sending a mode this server hasn't heard of should
     * lose one optional field, not the whole record.
     */
    private String deliveryMode(Object v) {
        String s = str(v);
        if (s == null) return null;
        String value = s.trim().toLowerCase();
        return value.equals("floor") || value.equals("remote") ? value : null;
    }

    /** 'client' or 'trainer'. Anything else is dropped rather than stored. */
    private String cancelledBy(Object v) {
        String s = str(v);
        if (s == null) return null;
        String value = s.trim().toLowerCase();
        return value.equals("client") || value.equals("trainer") ? value : null;
    }

    /** ISO weekday, 0 = Monday. Out of range is not a Monday, it is a bug. */
    private Integer clampWeekday(Object v) {
        if (!(v instanceof Number n)) return null;
        int day = n.intValue();
        return day >= 0 && day <= 6 ? day : null;
    }

    /** Minutes from midnight. 1440 is allowed so a window can end at midnight. */
    private Integer clampMinute(Object v) {
        if (!(v instanceof Number n)) return null;
        int minute = n.intValue();
        return minute >= 0 && minute <= 1440 ? minute : null;
    }

    private boolean bool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return false;
    }

    private Timestamp toTimestamp(Object v) {
        return SyncRows.toTimestamp(v);
    }

    private java.sql.Date toSqlDate(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        try { return java.sql.Date.valueOf(s); } catch (Exception e) { return null; }
    }

    private String toJsonString(Object v) {
        return SyncRows.toJsonString(v);
    }

    // ── JDBC helpers ──────────────────────────────────────────────────────────

    private List<Map<String, Object>> queryNormalized(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params)
                .stream()
                .map(this::normalizeRow)
                .toList();
    }

    private List<String> queryIds(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params)
                .stream()
                .map(r -> r.get("id").toString())
                .toList();
    }

    private Map<String, Object> normalizeRow(Map<String, Object> raw) {
        return SyncRows.normalizeRow(raw);
    }
}
