package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Log session. The log IS the scheduled session: starting lays the plan down as planned sets with their
 * targets copied, and every write after that fills in or adds to a row that already exists. What is pinned here is the
 * laydown and its idempotency, the one-tap / correct / skip rules the schema forces on a set, the walk-in, the swap and
 * rest scopes (and the 412 they cause in a builder tab), and every coded refusal.
 */
@SpringBootTest
@Transactional
class SessionLogTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant, client, program, workout;
    private UUID squat, bench, pullup, goblet, curl;
    private UUID wSquat, wBench, wPull, wGoblet;
    private UUID session;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100000601");
        other = trainer("+919100000602");
        tenant = tenantOf(me);
        signedIn(me);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        client = client(me, tenant, "Karthik Menon", "active");
        squat = exercise("Back squat", "weight_reps");
        bench = exercise("Bench press", "weight_reps");
        pullup = exercise("Pull-up", "reps");
        goblet = exercise("Goblet squat", "weight_reps");
        curl = exercise("Biceps curl", "weight_reps");

        program = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks)
                VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Fat-loss starter', 8)""",
                Map.of("id", program.toString(), "t", me.toString(), "ten", tenant.toString(), "c", client.toString()));
        workout = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name)
                VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, 1, 1, 0, 'Full Body A')""",
                Map.of("id", workout.toString(), "t", me.toString(), "ten", tenant.toString(), "p", program.toString()));
        wSquat = planRow(workout, squat, 0, null);
        wBench = planRow(workout, bench, 1, null);
        wPull = planRow(workout, pullup, 2, null);
        wGoblet = planRow(workout, goblet, 1, wSquat);       // an alternative: never laid down
        for (int i = 1; i <= 3; i++) planSet(wSquat, i, "weight", 80, "reps", 5, 150, "3-1-1-0");
        for (int i = 1; i <= 2; i++) planSet(wBench, i, "weight", 60, "reps", 8, 90, null);
        planSet(wPull, 1, "bodyweight", null, "max_reps", null, null, null);   // nothing prescribed to copy
        planSet(wGoblet, 1, "weight", 40, "reps", 10, 60, null);
        planSet(wGoblet, 2, "weight", 40, "reps", 10, 60, null);

        session = booked(client, "now() + interval '2 hours'", workout);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    /* ----------------------------------------------------------------- start: the plan is laid down once */

    @Test
    @DisplayName("before it starts, the log is the plan's preview with no ids; start lays the main rows down with targets copied")
    void startLaysThePlanDown() throws Exception {
        doGet("/v1/sessions/" + session + "/log")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(3))
                .andExpect(jsonPath("$.exercises[0].id").doesNotExist())
                .andExpect(jsonPath("$.exercises[0].name").value("Back squat"))
                .andExpect(jsonPath("$.exercises[0].plannedFrom").value(wSquat.toString()))
                .andExpect(jsonPath("$.exercises[0].sets[0].id").doesNotExist())
                .andExpect(jsonPath("$.exercises[0].alternatives[0].name").value("Goblet squat"))
                .andExpect(jsonPath("$.totals.setsPlanned").value(6))
                .andExpect(jsonPath("$.totals.setsDone").value(0))
                .andExpect(jsonPath("$.program.name").value("Fat-loss starter"))
                .andExpect(jsonPath("$.client.name").value("Karthik Menon"));
        assertEquals(0, count("session_exercise", session));

        String body = doPost("/v1/sessions/" + session + "/start", "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.startedAt").isNumber())
                .andExpect(jsonPath("$.exercises.length()").value(3))          // the alternative stays on the plan
                .andExpect(jsonPath("$.exercises[0].id").isString())
                .andExpect(jsonPath("$.exercises[0].source").value("planned"))
                .andExpect(jsonPath("$.exercises[0].sets.length()").value(3))
                .andExpect(jsonPath("$.exercises[0].sets[0].planned").value(true))
                .andExpect(jsonPath("$.exercises[0].sets[0].loadKind").value("weight"))
                .andExpect(jsonPath("$.exercises[0].sets[0].target.load").value(80))            // numbers, never strings
                .andExpect(jsonPath("$.exercises[0].sets[0].target.effort").value(5))
                .andExpect(jsonPath("$.exercises[0].sets[0].target.restSeconds").value(150))
                .andExpect(jsonPath("$.exercises[0].sets[0].target.tempo").value("3-1-1-0"))
                .andExpect(jsonPath("$.exercises[0].sets[0].doneAt").doesNotExist())
                .andExpect(jsonPath("$.totals.setsPlanned").value(6))
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("\"loadValue\":null") || !body.contains("\"loadValue\":\""));
        assertEquals(3, count("session_exercise", session));
        assertEquals(6, jdbc.queryForObject("""
                SELECT count(*) FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id
                WHERE se.session_id = :s::uuid""", Map.of("s", session.toString()), Integer.class));
    }

    @Test
    @DisplayName("start is idempotent: a second call returns the log unchanged and lays nothing down; targets are copies")
    void startIsIdempotent() throws Exception {
        doPost("/v1/sessions/" + session + "/start", "{}").andExpect(status().isOk());
        String first = jdbc.queryForObject("SELECT string_agg(id::text, ',' ORDER BY position) FROM session_exercise WHERE session_id = :s::uuid",
                Map.of("s", session.toString()), String.class);
        doPost("/v1/sessions/" + session + "/start", "{}").andExpect(status().isOk());
        assertEquals(3, count("session_exercise", session));
        assertEquals(first, jdbc.queryForObject("SELECT string_agg(id::text, ',' ORDER BY position) FROM session_exercise WHERE session_id = :s::uuid",
                Map.of("s", session.toString()), String.class));

        // Editing the plan afterwards never rewrites a past target: it was copied, not referenced.
        jdbc.update("UPDATE workout_set SET load_value = 100 WHERE workout_exercise_id = :w::uuid", Map.of("w", wSquat.toString()));
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.exercises[0].sets[0].target.load").value(80));
    }

    @Test
    @DisplayName("a back-dated start is honoured; a start in the future is a 400")
    void startBackdate() throws Exception {
        long tenMinutesAgo = System.currentTimeMillis() - 600_000;
        doPost("/v1/sessions/" + session + "/start", "{\"startedAt\":" + tenMinutesAgo + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.startedAt").value(tenMinutesAgo));
        UUID s2 = booked(client, "now() + interval '5 hours'", workout);
        doPost("/v1/sessions/" + s2 + "/start", "{\"startedAt\":" + (System.currentTimeMillis() + 3_600_000) + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    @DisplayName("a cancelled or no-show session cannot be logged; someone else's is a 404")
    void startRefusals() throws Exception {
        UUID cancelled = booked(client, "now() + interval '6 hours'", workout);
        jdbc.update("UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'trainer' WHERE id = :s::uuid", Map.of("s", cancelled.toString()));
        doPost("/v1/sessions/" + cancelled + "/start", "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_CANCELLED"));
        UUID noShow = booked(client, "now() + interval '7 hours'", workout);
        jdbc.update("UPDATE scheduled_session SET status = 'no_show' WHERE id = :s::uuid", Map.of("s", noShow.toString()));
        doPost("/v1/sessions/" + noShow + "/start", "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_NO_SHOW"));

        signedIn(other);
        doPost("/v1/sessions/" + session + "/start", "{}").andExpect(status().isNotFound());
        doGet("/v1/sessions/" + session + "/log").andExpect(status().isNotFound());
    }

    /* ----------------------------------------------------------------------------------- walk-in */

    @Test
    @DisplayName("a walk-in books and starts in one write with the next workout of the program; a replayed id is a 200 and lays nothing down twice")
    void walkIn() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + client + "\"}";
        doPost("/v1/sessions/walk-in", body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.session.id").value(id.toString()))
                .andExpect(jsonPath("$.session.startedAt").isNumber())
                .andExpect(jsonPath("$.session.workout.name").value("Full Body A"))
                .andExpect(jsonPath("$.exercises.length()").value(3));
        assertEquals(3, count("session_exercise", id));
        doPost("/v1/sessions/walk-in", body).andExpect(status().isOk()).andExpect(jsonPath("$.session.id").value(id.toString()));
        assertEquals(3, count("session_exercise", id));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE id = :s::uuid", Map.of("s", id.toString()), Integer.class));
    }

    @Test
    @DisplayName("a walk-in refuses a paused client, a second one in the same minute, and an id that is somebody else's")
    void walkInRefusals() throws Exception {
        UUID paused = client(me, tenant, "Paused Pat", "paused");
        doPost("/v1/sessions/walk-in", "{\"clientId\":\"" + paused + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_BOOKABLE"));

        UUID theirClient = client(other, tenantOf(other), "Their client", "active");
        UUID theirs = booked(other, tenantOf(other), theirClient, "now() + interval '8 hours'", null);
        doPost("/v1/sessions/walk-in", "{\"id\":\"" + theirs + "\",\"clientId\":\"" + client + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
        doPost("/v1/sessions/walk-in", "{\"clientId\":\"" + theirClient + "\"}").andExpect(status().isNotFound());

        // Last: a unique violation aborts the one transaction a @Transactional test shares.
        doPost("/v1/sessions/walk-in", "{\"clientId\":\"" + client + "\"}").andExpect(status().isCreated());
        doPost("/v1/sessions/walk-in", "{\"clientId\":\"" + client + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_CLIENT_TIME_TAKEN"));
    }

    /* ------------------------------------------------------------------------------ the picker */

    @Test
    @DisplayName("pick: open logs at any age, today's booked sessions, and every active client with their next workout")
    void pick() throws Exception {
        UUID opened = booked(client, "now() - interval '3 days'", workout);
        jdbc.update("UPDATE scheduled_session SET started_at = now() - interval '3 days' WHERE id = :s::uuid", Map.of("s", opened.toString()));
        UUID today = client(me, tenant, "Booked Today", "active");
        UUID todays = booked(today, "date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' + interval '12 hours'", null);
        client(me, tenant, "Paused Pat", "paused");

        doGet("/v1/sessions/pick").andExpect(status().isOk())
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + opened + "')].clientName").value("Karthik Menon"))
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + opened + "')].startedAt").isNotEmpty())
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + opened + "')].setsDone").value(0))          // an open log with nothing logged yet
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + opened + "')].volumeKg").value(0))
                .andExpect(jsonPath("$.booked[?(@.sessionId=='" + todays + "')].clientName").value("Booked Today"))
                .andExpect(jsonPath("$.everybody[?(@.clientName=='Karthik Menon')].nextWorkoutName").isNotEmpty())
                .andExpect(jsonPath("$.everybody[?(@.clientName=='Paused Pat')]").isEmpty());
    }

    @Test
    @DisplayName("pick: each open log carries setsDone and volumeKg — the log read's totals, from one grouped query")
    void pickCarriesProgress() throws Exception {
        start();
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 1), "{\"done\":true}");                   // 80 × 5 as prescribed = 400
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 2), "{\"done\":true,\"loadValue\":82.5,\"effortValue\":4}");   // 330
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(1, 1), "{\"done\":true}");                   // 60 × 8 = 480
        UUID idle = booked(client(me, tenant, "Second Client", "active"), "now() - interval '1 hour'", workout);
        jdbc.update("UPDATE scheduled_session SET started_at = now() - interval '1 hour' WHERE id = :s::uuid", Map.of("s", idle.toString()));

        doGet("/v1/sessions/pick").andExpect(status().isOk())
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + session + "')].setsDone").value(3))
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + session + "')].volumeKg").value(1210))
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + idle + "')].setsDone").value(0))
                .andExpect(jsonPath("$.open[?(@.sessionId=='" + idle + "')].volumeKg").value(0));
        // one definition: the picker's figure is the log's own totals
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.totals.setsDone").value(3)).andExpect(jsonPath("$.totals.volumeKg").value(1210));
    }

    /* ------------------------------------------------------------------------------------ sets */

    @Test
    @DisplayName("set notes: a notes-only PATCH changes neither values nor done; set, correct and clear; over 200 is a 400; the add-set body takes one too")
    void setNotes() throws Exception {
        start();
        UUID planned = setAt(0, 1);
        // On a set that is NOT done: a note is allowed and must not log it (no 400 'send done: true', no copied targets).
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"  left knee clicked  \"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.notes").value("left knee clicked"))
                .andExpect(jsonPath("$.set.doneAt").doesNotExist()).andExpect(jsonPath("$.set.loadValue").doesNotExist())
                .andExpect(jsonPath("$.totals.setsDone").value(0)).andExpect(jsonPath("$.isBest").value(false));
        // Alongside values: one write.
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"done\":true,\"notes\":\"felt easy\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.notes").value("felt easy"))
                .andExpect(jsonPath("$.set.loadValue").value(80)).andExpect(jsonPath("$.set.doneAt").isNumber());
        long doneAt = jdbc.queryForObject("SELECT (extract(epoch FROM done_at) * 1000000)::bigint FROM set_log WHERE id = :s::uuid", Map.of("s", planned.toString()), Long.class);
        // On a DONE set a notes-only PATCH leaves the values and done_at alone.
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"belt on\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.notes").value("belt on")).andExpect(jsonPath("$.set.loadValue").value(80));
        assertEquals(doneAt, jdbc.queryForObject("SELECT (extract(epoch FROM done_at) * 1000000)::bigint FROM set_log WHERE id = :s::uuid", Map.of("s", planned.toString()), Long.class));
        // Empty or null clears.
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"\"}").andExpect(jsonPath("$.set.notes").doesNotExist());
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"again\"}").andExpect(jsonPath("$.set.notes").value("again"));
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":null}").andExpect(jsonPath("$.set.notes").doesNotExist());
        // The limit is the column's: refused, never truncated.
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"" + "x".repeat(201) + "\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":\"" + "y".repeat(200) + "\"}").andExpect(status().isOk());
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"notes\":5}").andExpect(status().isBadRequest());
        // Skipping a planned set clears its actuals and keeps what was written about it.
        doPatch("/v1/sessions/" + session + "/sets/" + planned, "{\"done\":false}").andExpect(jsonPath("$.set.doneAt").doesNotExist()).andExpect(jsonPath("$.set.notes").value("y".repeat(200)));
        // A value on a not-done set is still the old 400, notes or not.
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(1, 1), "{\"loadValue\":60,\"notes\":\"n\"}").andExpect(status().isBadRequest());

        // Add-set takes a note too, trimmed and bounded the same way.
        UUID id = UUID.randomUUID();
        doPost("/v1/sessions/" + session + "/exercises/" + sx(0) + "/sets", "{\"id\":\"" + id + "\",\"loadValue\":85,\"effortValue\":3,\"notes\":\" top single \"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.set.notes").value("top single"));
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.exercises[0].sets[3].notes").value("top single"));
        doPost("/v1/sessions/" + session + "/exercises/" + sx(0) + "/sets", "{\"loadValue\":85,\"effortValue\":3,\"notes\":\"" + "z".repeat(201) + "\"}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("set-history names each session's workout once per page in `sessions`; existing fields are untouched; a session with no workout says null")
    void setHistoryNamesTheWorkout() throws Exception {
        start();
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 1), "{\"done\":true}");
        UUID freestyle = booked(client, "now() - interval '2 days'", null);
        jdbc.update("UPDATE scheduled_session SET started_at = now() - interval '2 days' WHERE id = :s::uuid", Map.of("s", freestyle.toString()));
        UUID sxF = UUID.randomUUID();
        jdbc.update("INSERT INTO session_exercise (id, tenant_id, session_id, client_id, exercise_id, position, source) VALUES (:id::uuid, :ten::uuid, :s::uuid, :c::uuid, :e::uuid, 0, 'added')",
                Map.of("id", sxF.toString(), "ten", tenant.toString(), "s", freestyle.toString(), "c", client.toString(), "e", bench.toString()));
        jdbc.update("INSERT INTO set_log (id, tenant_id, session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at) VALUES (gen_random_uuid(), :ten::uuid, :sx::uuid, 1, false, 'weight', 'reps', 50, 10, now() - interval '2 days')",
                Map.of("ten", tenant.toString(), "sx", sxF.toString()));

        doGet("/v1/clients/" + client + "/set-history").andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].sessionId").value(freestyle.toString()))     // the existing shape, oldest first
                .andExpect(jsonPath("$.items[0].workoutName").doesNotExist())                // per session, not repeated on every set
                .andExpect(jsonPath("$.exercises").isMap())
                .andExpect(jsonPath("$.sessions['" + session + "'].workoutName").value("Full Body A"))
                .andExpect(jsonPath("$.sessions['" + freestyle + "'].workoutName").doesNotExist())
                .andExpect(jsonPath("$.sessions.length()").value(2));
    }

    @Test
    @DisplayName("swappedFromName: the original movement's name rides on the entry — in the log read and in the swap's answer; null when never swapped")
    void swappedFromName() throws Exception {
        start();
        UUID sx = sx(0);
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.exercises[0].swappedFromName").doesNotExist());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"reason\":\"unavailable\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.swappedFrom").value(squat.toString())).andExpect(jsonPath("$.swappedFromName").value("Back squat"));
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.exercises[0].swappedFromName").value("Back squat"))
                .andExpect(jsonPath("$.exercises[1].swappedFromName").doesNotExist());
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"notes\":\"hmm\"}").andExpect(jsonPath("$.swappedFromName").value("Back squat"));
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + squat + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.swappedFromName").doesNotExist());
    }

    @Test
    @DisplayName("one tap logs the set as prescribed; a resend keeps done_at; a correction keeps it too; skip clears and keeps the row")
    void setTapCorrectSkip() throws Exception {
        start();
        UUID set = setAt(0, 1);
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.set.loadValue").value(80))
                .andExpect(jsonPath("$.set.effortValue").value(5))
                .andExpect(jsonPath("$.set.doneAt").isNumber())
                .andExpect(jsonPath("$.totals.setsDone").value(1))
                .andExpect(jsonPath("$.totals.setsPlanned").value(6))
                .andExpect(jsonPath("$.totals.volumeKg").value(400))
                .andExpect(jsonPath("$.isBest").value(false));
        long doneAt = jdbc.queryForObject("SELECT extract(epoch FROM done_at) * 1000 FROM set_log WHERE id = :s::uuid", Map.of("s", set.toString()), Long.class);
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":true}").andExpect(status().isOk());
        assertEquals(doneAt, jdbc.queryForObject("SELECT extract(epoch FROM done_at) * 1000 FROM set_log WHERE id = :s::uuid", Map.of("s", set.toString()), Long.class));

        // What actually happened, and a correction on the done set that leaves done_at alone.
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"loadValue\":82.5,\"effortValue\":4,\"rpe\":9}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.loadValue").value(82.5))
                .andExpect(jsonPath("$.set.effortValue").value(4)).andExpect(jsonPath("$.set.rpe").value(9))
                .andExpect(jsonPath("$.totals.volumeKg").value(330));
        assertEquals(doneAt, jdbc.queryForObject("SELECT extract(epoch FROM done_at) * 1000 FROM set_log WHERE id = :s::uuid", Map.of("s", set.toString()), Long.class));

        // Skip: the actuals clear, the row stays, so "3 of 3 planned" stays honest.
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.doneAt").doesNotExist())
                .andExpect(jsonPath("$.set.loadValue").doesNotExist()).andExpect(jsonPath("$.set.target.load").value(80))
                .andExpect(jsonPath("$.totals.setsDone").value(0)).andExpect(jsonPath("$.totals.setsPlanned").value(6));
        assertEquals(6, jdbc.queryForObject("SELECT count(*) FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id WHERE se.session_id = :s::uuid",
                Map.of("s", session.toString()), Integer.class));
    }

    @Test
    @DisplayName("a set with nothing prescribed is a 422 SET_NEEDS_VALUE until a value is sent; rpe, kinds and unknown keys are 400s")
    void setRules() throws Exception {
        start();
        UUID pull = setAt(2, 1);
        doPatch("/v1/sessions/" + session + "/sets/" + pull, "{\"done\":true}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SET_NEEDS_VALUE"));
        doPatch("/v1/sessions/" + session + "/sets/" + pull, "{\"done\":true,\"effortValue\":9}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.set.effortValue").value(9));

        UUID set = setAt(0, 2);
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":true,\"rpe\":8.3}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":true,\"rpe\":11}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"done\":true,\"rpe\":8.5}").andExpect(status().isOk()).andExpect(jsonPath("$.set.rpe").value(8.5));
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"loadValue\":2500}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"loadValue\":\"80\"}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{\"surprise\":1}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/sets/" + set, "{}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/sets/" + pull, "{\"loadValue\":20}").andExpect(status().isBadRequest());   // bodyweight has no load

        // Values on a set that is not done need done: true — the panel says what it means.
        UUID untouched = setAt(1, 1);
        doPatch("/v1/sessions/" + session + "/sets/" + untouched, "{\"loadValue\":60}").andExpect(status().isBadRequest());
        // Un-logging an extra set is meaningless (it only exists as a logged one): delete it.
        doPost("/v1/sessions/" + session + "/exercises/" + sx(0) + "/sets", "{\"loadValue\":90,\"effortValue\":3}").andExpect(status().isCreated());
        UUID extra = jdbc.queryForObject("SELECT id FROM set_log WHERE session_exercise_id = :x::uuid AND NOT planned", Map.of("x", sx(0).toString()), UUID.class);
        doPatch("/v1/sessions/" + session + "/sets/" + extra, "{\"done\":false}").andExpect(status().isBadRequest());

        // Unknown set → 404; a set of a not-started session is not reachable at all.
        doPatch("/v1/sessions/" + session + "/sets/" + UUID.randomUUID(), "{\"done\":true}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("extra sets: added at the next position with the last set's kinds, replay-safe, refused without a value, deleted only when extra")
    void extraSets() throws Exception {
        start();
        UUID sx = sx(0);
        UUID id = UUID.randomUUID();
        String add = "{\"id\":\"" + id + "\",\"loadValue\":85,\"effortValue\":3,\"rpe\":9,\"done\":true}";
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", add)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.set.id").value(id.toString()))
                .andExpect(jsonPath("$.set.planned").value(false)).andExpect(jsonPath("$.set.position").value(4))
                .andExpect(jsonPath("$.set.loadKind").value("weight")).andExpect(jsonPath("$.set.effortKind").value("reps"))
                .andExpect(jsonPath("$.set.target").doesNotExist()).andExpect(jsonPath("$.totals.setsDone").value(1));
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", add).andExpect(status().isOk()).andExpect(jsonPath("$.set.id").value(id.toString()));
        assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), Integer.class));
        doPost("/v1/sessions/" + session + "/exercises/" + sx(1) + "/sets", add).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));

        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", "{}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SET_NEEDS_VALUE"));
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", "{\"loadValue\":50,\"done\":false}").andExpect(status().isBadRequest());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", "{\"loadValue\":50,\"effortValue\":8,\"loadKind\":\"kettlebell\"}").andExpect(status().isBadRequest());

        // Delete: an extra set goes (and the grid's counts come back); a planned one is a 409; a gone one is a 404.
        doDelete("/v1/sessions/" + session + "/sets/" + id).andExpect(status().isOk()).andExpect(jsonPath("$.totals.setsDone").value(0));
        doDelete("/v1/sessions/" + session + "/sets/" + id).andExpect(status().isNotFound());
        doDelete("/v1/sessions/" + session + "/sets/" + setAt(0, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SET_PLANNED"));
    }

    @Test
    @DisplayName("an exercise holds at most 50 sets: the 51st is a 409 SET_LIMIT")
    void setLimit() throws Exception {
        start();
        String added = doPost("/v1/sessions/" + session + "/exercises", "{\"exerciseId\":\"" + curl + "\",\"sets\":50}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sets.length()").value(50))
                .andReturn().getResponse().getContentAsString();
        String sx = com.jayway.jsonpath.JsonPath.read(added, "$.id");
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/sets", "{\"loadValue\":10,\"effortValue\":10}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SET_LIMIT"));
    }

    /* ---------------------------------------------------------------- last, best and the PR flash */

    @Test
    @DisplayName("last and best are embedded for every exercise; isBest is true only for a set that beats the client's history")
    void lastBestAndIsBest() throws Exception {
        // Two completed sessions of back squat: 80 × 5 (e1RM 93.3) a month ago, 70 × 8 (e1RM 88.7) last week.
        UUID old1 = booked(client, "now() - interval '30 days'", null);
        UUID old2 = booked(client, "now() - interval '7 days'", null);
        history(old1, squat, "weight", 80, "reps", 5);
        history(old2, squat, "weight", 70, "reps", 8);
        history(old2, squat, "weight", 72.5, "reps", 6);

        start();
        doGet("/v1/sessions/" + session + "/log")
                .andExpect(jsonPath("$.exercises[0].last.sets.length()").value(2))             // the newest completed session
                .andExpect(jsonPath("$.exercises[0].last.sets[0].loadValue").value(70))
                .andExpect(jsonPath("$.exercises[0].last.date").isString())
                .andExpect(jsonPath("$.exercises[0].best.loadValue").value(80))
                .andExpect(jsonPath("$.exercises[0].best.effortValue").value(5))
                .andExpect(jsonPath("$.exercises[0].best.e1rm").value(93.3))
                .andExpect(jsonPath("$.exercises[1].last").doesNotExist())                      // no bench history
                .andExpect(jsonPath("$.exercises[1].best").doesNotExist());

        UUID s1 = setAt(0, 1), s2 = setAt(0, 2), s3 = setAt(0, 3);
        doPatch("/v1/sessions/" + session + "/sets/" + s1, "{\"done\":true,\"loadValue\":70,\"effortValue\":5}").andExpect(jsonPath("$.isBest").value(false));
        doPatch("/v1/sessions/" + session + "/sets/" + s2, "{\"done\":true,\"loadValue\":85,\"effortValue\":5}").andExpect(jsonPath("$.isBest").value(true));   // 99.2 beats 93.3
        doPatch("/v1/sessions/" + session + "/sets/" + s3, "{\"done\":true,\"loadValue\":85,\"effortValue\":5}").andExpect(jsonPath("$.isBest").value(false));  // ties the set just logged

        // The first set ever logged for a movement has nothing to beat, so it is not a PR.
        UUID b1 = setAt(1, 1);
        doPatch("/v1/sessions/" + session + "/sets/" + b1, "{\"done\":true}").andExpect(jsonPath("$.isBest").value(false));
        // Within the session a heavier set than the one before it is.
        UUID b2 = setAt(1, 2);
        doPatch("/v1/sessions/" + session + "/sets/" + b2, "{\"done\":true,\"loadValue\":65,\"effortValue\":8}").andExpect(jsonPath("$.isBest").value(true));
    }

    /* ------------------------------------------------------------------------------- exercises */

    @Test
    @DisplayName("add an exercise: appended or inserted (later ones move), empty planned sets from its log type, replay-safe, 404 for a stranger's exercise")
    void addExercise() throws Exception {
        UUID notStarted = booked(client, "now() + interval '9 hours'", workout);
        doPost("/v1/sessions/" + notStarted + "/exercises", "{\"exerciseId\":\"" + curl + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_NOT_STARTED"));

        start();
        UUID id = UUID.randomUUID();
        String req = "{\"id\":\"" + id + "\",\"exerciseId\":\"" + curl + "\",\"position\":3,\"sets\":3}";
        doPost("/v1/sessions/" + session + "/exercises", req)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.source").value("added")).andExpect(jsonPath("$.position").value(3))
                .andExpect(jsonPath("$.sets.length()").value(3)).andExpect(jsonPath("$.sets[0].planned").value(true))
                .andExpect(jsonPath("$.sets[0].loadKind").value("weight"));
        doPost("/v1/sessions/" + session + "/exercises", req).andExpect(status().isOk());
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", id.toString()), Integer.class));
        assertEquals(4, count("session_exercise", session));

        // A reps-only movement lays down bodyweight × reps; inserting at 0 moves everything after it.
        doPost("/v1/sessions/" + session + "/exercises", "{\"exerciseId\":\"" + pullup + "\",\"position\":0,\"sets\":1}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.position").value(0)).andExpect(jsonPath("$.sets[0].loadKind").value("bodyweight"));
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.exercises[0].name").value("Pull-up"))
                .andExpect(jsonPath("$.exercises[1].name").value("Back squat")).andExpect(jsonPath("$.exercises[4].name").value("Biceps curl"));

        UUID theirs = exercise(other, "Their private lift");
        doPost("/v1/sessions/" + session + "/exercises", "{\"exerciseId\":\"" + theirs + "\"}").andExpect(status().isNotFound());
        doPost("/v1/sessions/" + session + "/exercises", "{\"exerciseId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isNotFound());
        // An id that is already another session's exercise is a clash, not a replay.
        UUID elsewhere = booked(client, "now() + interval '11 hours'", workout);
        doPost("/v1/sessions/" + elsewhere + "/start", "{}").andExpect(status().isOk());
        doPost("/v1/sessions/" + elsewhere + "/exercises", "{\"id\":\"" + sx(0) + "\",\"exerciseId\":\"" + curl + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("remove hides an exercise (its sets stay) and drops it from the totals; undo brings it back; notes and rest have limits")
    void patchExercise() throws Exception {
        start();
        UUID sx = sx(1);   // bench, two sets
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(1, 1), "{\"done\":true}").andExpect(status().isOk());

        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"removed\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.removedAt").isNumber()).andExpect(jsonPath("$.sets.length()").value(2));
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.totals.setsPlanned").value(4)).andExpect(jsonPath("$.totals.setsDone").value(0))
                .andExpect(jsonPath("$.exercises.length()").value(3));                       // still there, so Undo can be offered
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(1, 2), "{\"done\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXERCISE_REMOVED"));
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"removed\":false}").andExpect(jsonPath("$.removedAt").doesNotExist());
        doGet("/v1/sessions/" + session + "/log").andExpect(jsonPath("$.totals.setsPlanned").value(6)).andExpect(jsonPath("$.totals.setsDone").value(1));

        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"notes\":\"Felt the left knee\"}").andExpect(jsonPath("$.notes").value("Felt the left knee"));
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"notes\":\"" + "x".repeat(501) + "\"}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"notes\":null}").andExpect(jsonPath("$.notes").doesNotExist());
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"restSeconds\":4000}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"onPlan\":true}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{}").andExpect(status().isBadRequest());
        doPatch("/v1/sessions/" + session + "/exercises/" + UUID.randomUUID(), "{\"removed\":true}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("rest changes the sets still to do; onPlan also rewrites the client's plan and bumps its revised_at")
    void restAndOnPlan() throws Exception {
        start();
        UUID sx = sx(0);
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 1), "{\"done\":true}");
        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"restSeconds\":120,\"onPlan\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.sets[0].target.restSeconds").value(150))     // done: keeps its rest
                .andExpect(jsonPath("$.sets[1].target.restSeconds").value(120)).andExpect(jsonPath("$.sets[2].target.restSeconds").value(120));
        assertEquals(150, planRest(wSquat));
        sleep();
        long before = revisedAt();

        doPatch("/v1/sessions/" + session + "/exercises/" + sx, "{\"restSeconds\":90,\"onPlan\":true}").andExpect(status().isOk());
        assertEquals(90, planRest(wSquat));
        assertTrue(revisedAt() > before, "the plan's version moves, so a builder tab open on it gets 412 PROGRAM_REVISED");

        // An exercise added today is not on the plan.
        String added = doPost("/v1/sessions/" + session + "/exercises", "{\"exerciseId\":\"" + curl + "\",\"sets\":1}").andReturn().getResponse().getContentAsString();
        String addedId = com.jayway.jsonpath.JsonPath.read(added, "$.id");
        doPatch("/v1/sessions/" + session + "/exercises/" + addedId, "{\"restSeconds\":60,\"onPlan\":true}").andExpect(status().isBadRequest());
    }

    /* ----------------------------------------------------------------------------------- swap */

    @Test
    @DisplayName("swap today with a library pick keeps the targets and remembers the original; swapping back forgets the swap")
    void swapToday() throws Exception {
        start();
        UUID sx = sx(0);
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 1), "{\"done\":true}");
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"reason\":\"unavailable\",\"scope\":\"today\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.exerciseId").value(curl.toString()))
                .andExpect(jsonPath("$.swappedFrom").value(squat.toString())).andExpect(jsonPath("$.swapReason").value("unavailable"))
                .andExpect(jsonPath("$.sets.length()").value(3)).andExpect(jsonPath("$.sets[1].target.load").value(80)).andExpect(jsonPath("$.sets[0].doneAt").isNumber());
        assertEquals(squat, jdbc.queryForObject("SELECT exercise_id FROM workout_exercise WHERE id = :w::uuid", Map.of("w", wSquat.toString()), UUID.class), "today never touches the plan");

        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + bench + "\",\"reason\":\"difficulty\"}")
                .andExpect(jsonPath("$.swappedFrom").value(squat.toString()));                  // the original is kept across a second swap
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + squat + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.swappedFrom").doesNotExist()).andExpect(jsonPath("$.swapReason").doesNotExist());

        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + squat + "\"}").andExpect(status().isBadRequest());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"reason\":\"bored\"}").andExpect(status().isBadRequest());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"scope\":\"template\"}").andExpect(status().isBadRequest());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isNotFound());
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"planRowId\":\"" + wBench + "\"}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("swap to a plan alternative replaces the sets still to do with its targets and leaves done sets alone")
    void swapToPlanAlternative() throws Exception {
        start();
        UUID sx = sx(0);
        doPatch("/v1/sessions/" + session + "/sets/" + setAt(0, 1), "{\"done\":true}");
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + goblet + "\",\"planRowId\":\"" + wGoblet + "\",\"reason\":\"unavailable\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.exerciseId").value(goblet.toString()))
                .andExpect(jsonPath("$.plannedFrom").value(wGoblet.toString()))
                .andExpect(jsonPath("$.sets.length()").value(3))                                   // 1 done kept + the alternative's 2
                .andExpect(jsonPath("$.sets[0].doneAt").isNumber()).andExpect(jsonPath("$.sets[0].loadValue").value(80))
                .andExpect(jsonPath("$.sets[1].position").value(2)).andExpect(jsonPath("$.sets[1].target.load").value(40))
                .andExpect(jsonPath("$.sets[1].target.effort").value(10)).andExpect(jsonPath("$.sets[2].target.restSeconds").value(60));
    }

    @Test
    @DisplayName("swap in the client's program changes the plan from the next session on, and bumps its version in the same write")
    void swapProgramScope() throws Exception {
        start();
        UUID sx = sx(0);
        sleep();
        long before = revisedAt();
        doPost("/v1/sessions/" + session + "/exercises/" + sx + "/swap", "{\"toExerciseId\":\"" + goblet + "\",\"planRowId\":\"" + wGoblet + "\",\"scope\":\"program\"}").andExpect(status().isOk());
        assertEquals(goblet, jdbc.queryForObject("SELECT exercise_id FROM workout_exercise WHERE id = :w::uuid", Map.of("w", wSquat.toString()), UUID.class));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", wSquat.toString()), Integer.class));   // the alternative's prescription
        assertEquals(40, jdbc.queryForObject("SELECT load_value FROM workout_set WHERE workout_exercise_id = :w::uuid AND position = 1", Map.of("w", wSquat.toString()), Integer.class));
        assertTrue(revisedAt() > before);

        // A session that is not from the client's own program has no plan to change.
        UUID standalone = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, 'Standalone')",
                Map.of("id", standalone.toString(), "t", me.toString(), "ten", tenant.toString()));
        UUID wRow = planRow(standalone, squat, 0, null);
        planSet(wRow, 1, "weight", 50, "reps", 10, null, null);
        UUID s2 = booked(client, "now() + interval '10 hours'", standalone);
        doPost("/v1/sessions/" + s2 + "/start", "{}").andExpect(status().isOk());
        UUID sx2 = jdbc.queryForObject("SELECT id FROM session_exercise WHERE session_id = :s::uuid", Map.of("s", s2.toString()), UUID.class);
        doPost("/v1/sessions/" + s2 + "/exercises/" + sx2 + "/swap", "{\"toExerciseId\":\"" + curl + "\",\"scope\":\"program\"}").andExpect(status().isBadRequest());
    }

    /* -------------------------------------------------------------------------------------- end */

    @Test
    @DisplayName("end closes the log, is idempotent, and refuses an unopened log, a time before the start, and the future")
    void end() throws Exception {
        doPost("/v1/sessions/" + session + "/end", "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_NOT_STARTED"));
        long startedAt = System.currentTimeMillis() - 1_800_000;
        doPost("/v1/sessions/" + session + "/start", "{\"startedAt\":" + startedAt + "}").andExpect(status().isOk());

        doPost("/v1/sessions/" + session + "/end", "{\"endedAt\":" + (startedAt - 1000) + "}").andExpect(status().isBadRequest());
        doPost("/v1/sessions/" + session + "/end", "{\"endedAt\":" + (System.currentTimeMillis() + 3_600_000) + "}").andExpect(status().isBadRequest());
        long endedAt = startedAt + 1_200_000;
        doPost("/v1/sessions/" + session + "/end", "{\"endedAt\":" + endedAt + "}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.endedAt").value(endedAt)).andExpect(jsonPath("$.status").value("scheduled"));
        doPost("/v1/sessions/" + session + "/end", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.endedAt").value(endedAt));   // an ended log keeps its time
        doGet("/v1/sessions/pick").andExpect(jsonPath("$.open[?(@.sessionId=='" + session + "')]").isEmpty());
    }

    /* ----------------------------------------------------------------------------- fixtures */

    private void start() throws Exception {
        doPost("/v1/sessions/" + session + "/start", "{}").andExpect(status().isOk());
    }

    private ResultActions doGet(String url) throws Exception {
        return mvc.perform(get(url));
    }

    private ResultActions doPost(String url, String body) throws Exception {
        return mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions doPatch(String url, String body) throws Exception {
        return mvc.perform(patch(url).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions doDelete(String url) throws Exception {
        return mvc.perform(delete(url));
    }

    /** The n-th exercise of the started session (0-based, in order). */
    private UUID sx(int n) {
        return jdbc.queryForObject("SELECT id FROM session_exercise WHERE session_id = :s::uuid ORDER BY position OFFSET :n LIMIT 1",
                Map.of("s", session.toString(), "n", n), UUID.class);
    }

    private UUID setAt(int exercise, int position) {
        return jdbc.queryForObject("SELECT id FROM set_log WHERE session_exercise_id = :x::uuid AND position = :p",
                Map.of("x", sx(exercise).toString(), "p", position), UUID.class);
    }

    private int count(String table, UUID sessionId) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE session_id = :s::uuid", Map.of("s", sessionId.toString()), Integer.class);
    }

    private long revisedAt() {
        return jdbc.queryForObject("SELECT (extract(epoch FROM revised_at) * 1000000)::bigint FROM program WHERE id = :p::uuid", Map.of("p", program.toString()), Long.class);
    }

    private Integer planRest(UUID planRow) {
        return jdbc.queryForObject("SELECT rest_seconds FROM workout_set WHERE workout_exercise_id = :w::uuid AND position = 1", Map.of("w", planRow.toString()), Integer.class);
    }

    /** now() is the transaction's start inside a @Transactional test, so a bump needs a statement-time reference. */
    private void sleep() {
        jdbc.update("UPDATE program SET revised_at = revised_at - interval '1 minute' WHERE id = :p::uuid", Map.of("p", program.toString()));
    }

    private UUID tenantOf(UUID trainer) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainer.toString()), String.class));
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("phone", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :phone) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }

    private UUID client(UUID trainer, UUID tenant, String name, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status, paused_at) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent', :s, CASE WHEN :s = 'paused' THEN now() END)",
                Map.of("id", id.toString(), "t", trainer.toString(), "ten", tenant.toString(), "n", name, "s", status));
        return id;
    }

    private UUID exercise(String name, String logType) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', :lt, :src)", Map.of("id", id.toString(), "n", name, "lt", logType, "src", "test-" + id));
        return id;
    }

    private UUID exercise(UUID owner, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, trainer_id, tenant_id) VALUES (:id::uuid, :n, 'trainer', :t::uuid, :ten::uuid)",
                Map.of("id", id.toString(), "n", name, "t", owner.toString(), "ten", tenantOf(owner).toString()));
        return id;
    }

    private UUID planRow(UUID workout, UUID exercise, int position, UUID alternativeOf) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("w", workout.toString());
        p.put("e", exercise.toString());
        p.put("pos", position);
        p.put("alt", alternativeOf == null ? null : alternativeOf.toString());
        jdbc.update("INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of) VALUES (:id::uuid, :w::uuid, :e::uuid, :pos, CAST(:alt AS uuid))", p);
        return id;
    }

    private void planSet(UUID planRow, int position, String loadKind, Integer load, String effortKind, Integer effort, Integer rest, String tempo) {
        var p = new java.util.HashMap<String, Object>();
        p.put("w", planRow.toString());
        p.put("pos", position);
        p.put("lk", loadKind);
        p.put("l", load);
        p.put("ek", effortKind);
        p.put("e", effort);
        p.put("r", rest);
        p.put("t", tempo);
        jdbc.update("INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value, rest_seconds, tempo) "
                + "VALUES (:w::uuid, :pos, :lk, :l, :ek, :e, :r, :t)", p);
    }

    private UUID booked(UUID client, String when, UUID workout) {
        return booked(me, tenant, client, when, workout);
    }

    private UUID booked(UUID trainer, UUID tenant, UUID client, String when, UUID workout) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("t", trainer.toString());
        p.put("ten", tenant.toString());
        p.put("c", client.toString());
        p.put("w", workout == null ? null : workout.toString());
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, tenant_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at) "
                + "VALUES (:id::uuid, :t::uuid, :ten::uuid, :c::uuid, CAST(:w AS uuid), " + when + ", 60, " + when + " + interval '1 hour')", p);
        return id;
    }

    /** A completed session with one done set for an exercise — the history last/best/isBest read. */
    private void history(UUID sessionId, UUID exercise, String loadKind, double load, String effortKind, int effort) {
        jdbc.update("UPDATE scheduled_session SET status = 'done' WHERE id = :s::uuid", Map.of("s", sessionId.toString()));
        var found = jdbc.queryForList("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid",
                Map.of("s", sessionId.toString(), "e", exercise.toString()), String.class);
        UUID sx = found.isEmpty() ? null : UUID.fromString(found.getFirst());
        if (sx == null) {
            sx = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position)
                    SELECT :x::uuid, s.id, s.client_id, :e::uuid, coalesce((SELECT max(position) + 1 FROM session_exercise WHERE session_id = s.id), 0)
                    FROM scheduled_session s WHERE s.id = :s::uuid""", Map.of("x", sx.toString(), "e", exercise.toString(), "s", sessionId.toString()));
        }
        jdbc.update("""
                INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at)
                VALUES (:x::uuid, (SELECT coalesce(max(position), 0) + 1 FROM set_log WHERE session_exercise_id = :x::uuid), false,
                        :lk, :ek, :l, :e, now() - interval '1 day')""",
                Map.of("x", sx.toString(), "lk", loadKind, "ek", effortKind, "l", load, "e", effort));
    }

    private void signedIn(UUID trainerId) {
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", trainerId.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
