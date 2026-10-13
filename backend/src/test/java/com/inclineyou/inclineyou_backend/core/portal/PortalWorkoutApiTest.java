package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.OtpSender;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, pw-l1 … pw-a6 and pp-l6: the client's workout. Preview a program day, start a self-run, log it set by set, swap a movement,
 * finish it and say how it felt, and list what was done — through the security chain, because the walls for a paused client and the read-only
 * rule for a trainer's session are part of the contract. The suite runs as the schema owner, so the row-level walls themselves are
 * asserted as the request role in {@code TenantIsolationTest}.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalWorkoutApiTest.CapturingSender.class)
@Transactional
class PortalWorkoutApiTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;
    private UUID me, tenant;
    private int seq = 0;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    /** A plan day: Back squat (two sets, 60 kg × 8, 90 s rest, an approved alternative Leg press), then Plank (one timed set). */
    private record Plan(UUID workout, UUID squatRow, UUID plankRow, UUID squat, UUID plank, UUID legPress, UUID goblet) {}

    private Plan plan(UUID client) {
        UUID w = workout(program(client), 1, 2, "Lower body A");
        UUID squat = ex("Back squat", "quads", "weight_reps");
        UUID plank = ex("Plank", "core", "time");
        UUID legPress = ex("Leg press", "quads", "weight_reps");
        UUID goblet = ex("Goblet squat", "quads", "weight_reps");
        UUID r1 = workoutExercise(w, squat, 0), r2 = workoutExercise(w, plank, 1);
        jdbc.update("UPDATE workout_exercise SET notes = 'Chest up. Knees out.', section = 'Main' WHERE id = :r::uuid", Map.of("r", r1.toString()));
        for (int i = 1; i <= 2; i++) set(r1, i, "weight", "reps", 60, 8, 90);
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, 1, 'bodyweight', 'time', 30, 45)",
                Map.of("ten", tenant.toString(), "w", r2.toString()));
        UUID alt = UUID.randomUUID();
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position, alternative_of) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, 1, :m::uuid)",
                Map.of("id", alt.toString(), "ten", tenant.toString(), "w", w.toString(), "e", legPress.toString(), "m", r1.toString()));
        set(alt, 1, "weight", "reps", 100, 12, 120);
        jdbc.update("UPDATE exercise SET description = 'Set the bar on your back.\n\nSit down and stand up.' WHERE id = :e::uuid", Map.of("e", squat.toString()));
        return new Plan(w, r1, r2, squat, plank, legPress, goblet);
    }

    private void set(UUID we, int pos, String lk, String ek, int load, int effort, int rest) {
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, load_value, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, :p, :lk, :ek, :l, :e, :r)",
                Map.of("ten", tenant.toString(), "w", we.toString(), "p", pos, "lk", lk, "ek", ek, "l", load, "e", effort, "r", rest));
    }

    private UUID ex(String name, String muscle, String logType) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, muscle_group, equipment, source_id) VALUES (:id::uuid, :n, 'inclineyou', :lt, :m, 'barbell', :src)",
                Map.of("id", id.toString(), "n", name, "lt", logType, "m", muscle, "src", "t-" + id));
        return id;
    }

    private ResultActions start(String token, UUID id, UUID workout) throws Exception {
        return mvc.perform(post("/v1/portal/sessions").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + id + "\",\"workoutId\":\"" + workout + "\"}"));
    }

    private String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private ResultActions patchSet(String token, String session, String set, String json) throws Exception {
        return mvc.perform(patch("/v1/portal/sessions/" + session + "/sets/" + set).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions finish(String token, String session, String json) throws Exception {
        return mvc.perform(post("/v1/portal/sessions/" + session + "/finish").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions getLog(String token, String session) throws Exception {
        return mvc.perform(get("/v1/portal/sessions/" + session + "/log").header("Authorization", "Bearer " + token));
    }

    @Test
    @DisplayName("preview: the day's exercises with the trainer's cue, steps, sets, approved alternatives and last time; startable until the trainer books the day; only the client's own plan")
    void preview() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        mvc.perform(get("/v1/portal/workouts/" + p.workout).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.workout.name").value("Lower body A")).andExpect(jsonPath("$.workout.week").value(1)).andExpect(jsonPath("$.workout.day").value(2))
                .andExpect(jsonPath("$.workout.estimatedMinutes").value(10)).andExpect(jsonPath("$.program.name").value("Plan")).andExpect(jsonPath("$.program.weeks").value(4))
                .andExpect(jsonPath("$.startable").value(true)).andExpect(jsonPath("$.inProgress").value(nullValue()))
                .andExpect(jsonPath("$.exercises", hasSize(2)))
                .andExpect(jsonPath("$.exercises[0].name").value("Back squat")).andExpect(jsonPath("$.exercises[0].target").value("quads"))
                .andExpect(jsonPath("$.exercises[0].cue").value("Chest up. Knees out.")).andExpect(jsonPath("$.exercises[0].section").value("Main"))
                .andExpect(jsonPath("$.exercises[0].steps", hasSize(2))).andExpect(jsonPath("$.exercises[0].steps[1]").value("Sit down and stand up."))
                .andExpect(jsonPath("$.exercises[0].sets", hasSize(2))).andExpect(jsonPath("$.exercises[0].sets[0].targetLoad").value(60))
                .andExpect(jsonPath("$.exercises[0].sets[0].targetEffort").value(8)).andExpect(jsonPath("$.exercises[0].sets[0].restSeconds").value(90))
                .andExpect(jsonPath("$.exercises[0].alternatives", hasSize(1))).andExpect(jsonPath("$.exercises[0].alternatives[0].name").value("Leg press"))
                .andExpect(jsonPath("$.exercises[0].alternatives[0].source").value("approved"))
                .andExpect(jsonPath("$.exercises[0].last").value(nullValue()))
                .andExpect(jsonPath("$.exercises[1].name").value("Plank")).andExpect(jsonPath("$.exercises[1].sets[0].loadKind").value("bodyweight"))
                .andExpect(jsonPath("$.exercises[1].alternatives", hasSize(0)));

        // the trainer books this day: the client is not to run it alone
        session(c, p.workout, Instant.now().plus(1, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);
        mvc.perform(get("/v1/portal/workouts/" + p.workout).header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.startable").value(false));
        // a workout of somebody else's plan, and one that does not exist: the same 404
        UUID other = liveOther();
        var op = plan(other);
        mvc.perform(get("/v1/portal/workouts/" + op.workout).header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/portal/workouts/" + UUID.randomUUID()).header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("start: 201 lays the plan down as the client's own rows, off the trainer's diary and with no slot; the same id or another id for the day resumes with 200; a booked day, a paused plan and a stranger's id are refused")
    void start() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        UUID sid = UUID.randomUUID();
        String made = body(start(token, sid, p.workout).andExpect(status().isCreated()).andExpect(jsonPath("$.session.loggedBy").value("client"))
                .andExpect(jsonPath("$.session.status").value("scheduled")).andExpect(jsonPath("$.session.startedAt").isNumber()).andExpect(jsonPath("$.readOnly").value(false))
                .andExpect(jsonPath("$.session.workout.name").value("Lower body A")).andExpect(jsonPath("$.exercises", hasSize(2)))
                .andExpect(jsonPath("$.exercises[0].sets", hasSize(2))).andExpect(jsonPath("$.exercises[0].sets[0].enteredBy").value("client"))
                .andExpect(jsonPath("$.exercises[0].sets[0].target.load").value(60)).andExpect(jsonPath("$.exercises[0].cue").value("Chest up. Knees out."))
                .andExpect(jsonPath("$.exercises[0].alternatives[0].name").value("Leg press")).andExpect(jsonPath("$.totals.setsPlanned").value(3))
                .andExpect(jsonPath("$.totals.setsDone").value(0)).andExpect(jsonPath("$.autoRestTimer").value(true)).andExpect(jsonPath("$.feedback").value(nullValue())));
        assertEquals(sid.toString(), JsonPath.read(made, "$.session.id"));
        var row = jdbc.queryForMap("SELECT logged_by, slot_id, delivery_mode, trainer_id::text AS t FROM scheduled_session WHERE id = :s::uuid", Map.of("s", sid.toString()));
        assertEquals("client", row.get("logged_by"));
        assertEquals(null, row.get("slot_id"));
        assertEquals(arun.toString(), row.get("t"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id WHERE se.session_id = :s::uuid AND sl.entered_by <> 'client'",
                Map.of("s", sid.toString()), Integer.class));
        // it is not in the trainer's diary (R107)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE id = :s::uuid AND logged_by = 'trainer'", Map.of("s", sid.toString()), Integer.class));
        mvc.perform(get("/v1/portal/workouts/" + p.workout).header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.inProgress.sessionId").value(sid.toString()));

        // the same id again, and a different id for the same day: one log, 200 each time, the plan laid down once
        start(token, sid, p.workout).andExpect(status().isOk()).andExpect(jsonPath("$.session.id").value(sid.toString()));
        start(token, UUID.randomUUID(), p.workout).andExpect(status().isOk()).andExpect(jsonPath("$.session.id").value(sid.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND logged_by = 'client'", Map.of("c", c.toString()), Integer.class));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM session_exercise WHERE session_id = :s::uuid", Map.of("s", sid.toString()), Integer.class));

        // an id somebody else holds: 409 ID_CONFLICT, and nothing is said about whose it is
        UUID other = liveOther();
        UUID theirs = session(other, null, Instant.now().minusSeconds(3600), 60, "scheduled", "trainer", null, null);
        start(token, theirs, p.workout).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));

        // a booked day and a plan that is not active: 409 WORKOUT_NOT_STARTABLE
        UUID c2 = liveOther2();
        var p2 = plan(c2);
        String t2 = tokenFor(phoneOf(c2));
        session(c2, p2.workout, Instant.now().plus(1, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);
        start(t2, UUID.randomUUID(), p2.workout).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKOUT_NOT_STARTABLE"));
        // a stranger's workout is not in this client's plan
        start(token, UUID.randomUUID(), p2.workout).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKOUT_NOT_STARTABLE"));
        // a malformed body is a 400, an unknown key too
        mvc.perform(post("/v1/portal/sessions").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"x\",\"workoutId\":\"y\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/portal/sessions").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"" + UUID.randomUUID() + "\",\"workoutId\":\"" + p.workout + "\",\"x\":1}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a paused plan cannot be started alone")
    void pausedPlan() throws Exception {
        UUID c = live();
        var p = plan(c);
        jdbc.update("UPDATE program SET status = 'paused' WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        start(token(), UUID.randomUUID(), p.workout).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKOUT_NOT_STARTABLE"));
    }

    @Test
    @DisplayName("logging: one tap copies the target, values adjust it, a skip clears it, a set with nothing prescribed needs a value — and a retry lands once")
    void setsAreLogged() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        UUID sid = UUID.randomUUID();
        String log = body(start(token, sid, p.workout).andExpect(status().isCreated()));
        String s1 = JsonPath.read(log, "$.exercises[0].sets[0].id"), s2 = JsonPath.read(log, "$.exercises[0].sets[1].id");

        patchSet(token, sid.toString(), s1, "{\"done\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.set.loadValue").value(60)).andExpect(jsonPath("$.set.effortValue").value(8))
                .andExpect(jsonPath("$.set.doneAt").isNumber()).andExpect(jsonPath("$.set.enteredBy").value("client")).andExpect(jsonPath("$.totals.setsDone").value(1))
                .andExpect(jsonPath("$.totals.volumeKg").value(480)).andExpect(jsonPath("$.version").isString());
        // the same body again: still one done set, the same time
        long first = ((Number) JsonPath.read(body(getLog(token, sid.toString())), "$.exercises[0].sets[0].doneAt")).longValue();
        patchSet(token, sid.toString(), s1, "{\"done\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.totals.setsDone").value(1)).andExpect(jsonPath("$.set.doneAt").value(first));
        patchSet(token, sid.toString(), s2, "{\"loadValue\":62.5,\"effortValue\":7,\"rpe\":8,\"done\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.set.loadValue").value(62.5)).andExpect(jsonPath("$.set.rpe").value(8)).andExpect(jsonPath("$.totals.setsDone").value(2));
        patchSet(token, sid.toString(), s2, "{\"done\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.set.doneAt").value(nullValue())).andExpect(jsonPath("$.totals.setsDone").value(1));
        // a plank set has a target (30 s); one with nothing to copy is refused with the value to enter
        UUID emptyRow = workoutExercise(p.workout, ex("Farmer walk", "core", "weight_distance"), 2);
        patchSet(token, sid.toString(), s1, "{\"loadValue\":-1,\"done\":true}").andExpect(status().isBadRequest());
        patchSet(token, sid.toString(), s1, "{\"bogus\":1}").andExpect(status().isBadRequest());
        patchSet(token, sid.toString(), UUID.randomUUID().toString(), "{\"done\":true}").andExpect(status().isNotFound());

        // an extra set: 201, planned = false, entered by the client; a replay of the id is 200 and no second row
        String sx = JsonPath.read(log, "$.exercises[0].id");
        UUID extra = UUID.randomUUID();
        String add = "{\"id\":\"" + extra + "\",\"loadValue\":20,\"effortValue\":10}";
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/sets").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(add))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.set.planned").value(false)).andExpect(jsonPath("$.set.enteredBy").value("client")).andExpect(jsonPath("$.totals.setsDone").value(2));
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/sets").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(add))
                .andExpect(status().isOk());
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx), Integer.class));

        // the pause clock
        mvc.perform(patch("/v1/portal/sessions/" + sid).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"pausedSeconds\":140}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pausedSeconds").value(140));
        mvc.perform(patch("/v1/portal/sessions/" + sid).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"pausedSeconds\":-1}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/v1/portal/sessions/" + sid).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"done\"}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a trainer's session is read-only to the client — every write is 422 SESSION_READ_ONLY — and its log is the same read with readOnly true; somebody else's session is 404")
    void trainerSessionIsReadOnly() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        UUID sid = session(c, p.workout, Instant.now().minusSeconds(3600), 60, "scheduled", "trainer", Instant.now().minusSeconds(3500), null);
        jdbc.update("""
                INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position, planned_from) VALUES (gen_random_uuid(), :s::uuid, :c::uuid, :e::uuid, 0, :r::uuid)""",
                Map.of("s", sid.toString(), "c", c.toString(), "e", p.squat.toString(), "r", p.squatRow.toString()));
        UUID sx = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid", Map.of("s", sid.toString()), String.class));
        jdbc.update("INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, target_load_value, target_effort_value) VALUES (:x::uuid, 1, true, 'weight', 'reps', 60, 8)", Map.of("x", sx.toString()));
        String set = jdbc.queryForObject("SELECT id::text FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), String.class);

        getLog(token, sid.toString()).andExpect(status().isOk()).andExpect(jsonPath("$.readOnly").value(true)).andExpect(jsonPath("$.session.loggedBy").value("trainer"))
                .andExpect(jsonPath("$.exercises[0].name").value("Back squat")).andExpect(jsonPath("$.exercises[0].sets[0].enteredBy").value("trainer"));
        patchSet(token, sid.toString(), set, "{\"done\":true}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SESSION_READ_ONLY"));
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/sets").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"loadValue\":20,\"effortValue\":10}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(patch("/v1/portal/sessions/" + sid).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"pausedSeconds\":5}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + p.goblet + "\",\"source\":\"library\"}")).andExpect(status().isUnprocessableEntity());
        finish(token, sid.toString(), "{}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SESSION_READ_ONLY"));
        assertEquals("scheduled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :s::uuid", Map.of("s", sid.toString()), String.class));

        UUID other = liveOther();
        UUID theirs = session(other, null, Instant.now().minusSeconds(3600), 60, "scheduled", "trainer", null, null);
        getLog(token, theirs.toString()).andExpect(status().isNotFound());
        patchSet(token, theirs.toString(), set, "{\"done\":true}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("swap: an approved alternative takes its prescription, a library movement keeps the sets that are left (counted its own way), the original is remembered, swapping back forgets it; and the lists")
    void swap() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        UUID sid = UUID.randomUUID();
        String log = body(start(token, sid, p.workout).andExpect(status().isCreated()));
        String sx = JsonPath.read(log, "$.exercises[0].id"), s1 = JsonPath.read(log, "$.exercises[0].sets[0].id");
        patchSet(token, sid.toString(), s1, "{\"done\":true}").andExpect(status().isOk());

        // the library list for the sheet: the same muscle, never the movement itself nor what is in the session
        mvc.perform(get("/v1/portal/exercises/" + p.squat + "/alternatives?limit=8&sessionId=" + sid).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].name", org.hamcrest.Matchers.hasItems("Leg press", "Goblet squat"))).andExpect(jsonPath("$.items[*].name", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("Back squat"))))
                .andExpect(jsonPath("$.items[0].source").value("library")).andExpect(jsonPath("$.items[0].target").value("quads")).andExpect(jsonPath("$.items[0].equipment").isString());
        mvc.perform(get("/v1/portal/exercises/" + UUID.randomUUID() + "/alternatives").header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());

        // approved: the trainer's own alternative, its prescription replaces what is still to do, what was done stays
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toExerciseId\":\"" + p.legPress + "\",\"source\":\"approved\",\"reason\":\"busy\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.exercise.name").value("Leg press")).andExpect(jsonPath("$.exercise.swappedFrom.name").value("Back squat"))
                .andExpect(jsonPath("$.exercise.swapSource").value("approved")).andExpect(jsonPath("$.exercise.swapReason").value("busy"))
                .andExpect(jsonPath("$.exercise.sets", hasSize(2))).andExpect(jsonPath("$.exercise.sets[0].doneAt").isNumber())
                .andExpect(jsonPath("$.exercise.sets[1].target.load").value(100)).andExpect(jsonPath("$.exercise.sets[1].enteredBy").value("client"));
        // again: idempotent by target state
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + p.legPress + "\",\"source\":\"approved\",\"reason\":\"busy\"}")).andExpect(status().isOk());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx), Integer.class));

        // library: sets that are left are kept, targets carried (same way of counting), the first original is still remembered
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toExerciseId\":\"" + p.goblet + "\",\"source\":\"library\",\"reason\":\"pain\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.exercise.name").value("Goblet squat")).andExpect(jsonPath("$.exercise.swappedFrom.name").value("Back squat"))
                .andExpect(jsonPath("$.exercise.swapSource").value("library")).andExpect(jsonPath("$.exercise.swapReason").value("pain"))
                .andExpect(jsonPath("$.exercise.cue").value(nullValue())).andExpect(jsonPath("$.exercise.sets", hasSize(2))).andExpect(jsonPath("$.exercise.sets[1].target.load").value(100));
        // swapping back to the original forgets the swap
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toExerciseId\":\"" + p.squat + "\",\"source\":\"library\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.exercise.name").value("Back squat")).andExpect(jsonPath("$.exercise.swappedFrom").value(nullValue()))
                .andExpect(jsonPath("$.exercise.swapSource").value(nullValue()));

        // a library movement with a different way of counting: the sets that are left start empty, the rest kept
        String plank = JsonPath.read(log, "$.exercises[1].id");
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + plank + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toExerciseId\":\"" + p.goblet + "\",\"source\":\"library\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.exercise.sets[0].loadKind").value("weight")).andExpect(jsonPath("$.exercise.sets[0].effortKind").value("reps"))
                .andExpect(jsonPath("$.exercise.sets[0].target").value(org.hamcrest.Matchers.hasEntry("restSeconds", 45)));
        // refusals: not one the trainer approved, the same movement elsewhere in the session, an exercise nobody can see, a bad reason
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + p.goblet + "\",\"source\":\"approved\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + p.goblet + "\",\"source\":\"library\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXERCISE_IN_SESSION"));
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + UUID.randomUUID() + "\",\"source\":\"library\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/v1/portal/sessions/" + sid + "/exercises/" + sx + "/swap").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"toExerciseId\":\"" + p.legPress + "\",\"source\":\"library\",\"reason\":\"lazy\"}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("finish: nothing logged is refused; otherwise it closes the day, never charges a pack, reports the best and the milestone once, and a second finish answers the same without firing again")
    void finishing() throws Exception {
        UUID c = live();
        var p = plan(c);
        pack(c, 12, 7);
        String token = token();
        // an earlier finished workout of the same movement, lighter: today's heavier set beats it
        UUID old = session(c, p.workout, Instant.now().minus(5, ChronoUnit.DAYS), 60, "done", "client", Instant.now().minus(5, ChronoUnit.DAYS), Instant.now().minus(5, ChronoUnit.DAYS).plusSeconds(3000));
        setDone(old, c, p.squat, 50, 8, Instant.now().minus(5, ChronoUnit.DAYS));

        UUID sid = UUID.randomUUID();
        String log = body(start(token, sid, p.workout).andExpect(status().isCreated()));
        finish(token, sid.toString(), "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOTHING_LOGGED"));
        String s1 = JsonPath.read(log, "$.exercises[0].sets[0].id");
        patchSet(token, sid.toString(), s1, "{\"loadValue\":62.5,\"effortValue\":8,\"done\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.isBest").value(true));

        String done = body(finish(token, sid.toString(), "{\"effort\":\"right\",\"note\":\" knee a bit stiff \",\"pausedSeconds\":140}").andExpect(status().isOk())
                .andExpect(jsonPath("$.session.status").value("done")).andExpect(jsonPath("$.session.endedAt").isNumber())
                .andExpect(jsonPath("$.summary.setsDone").value(1)).andExpect(jsonPath("$.summary.setsPlanned").value(3))
                .andExpect(jsonPath("$.summary.volumeKg").value(500)).andExpect(jsonPath("$.summary.durationSeconds").isNumber())
                .andExpect(jsonPath("$.summary.newBests", hasSize(1))).andExpect(jsonPath("$.summary.newBests[0].name").value("Back squat"))
                .andExpect(jsonPath("$.summary.newBests[0].loadValue").value(62.5)).andExpect(jsonPath("$.summary.newBests[0].e1rm").value(79.2))
                .andExpect(jsonPath("$.summary.newBests[0].previousE1rm").value(63.3))
                .andExpect(jsonPath("$.summary.milestones", hasSize(0))).andExpect(jsonPath("$.feedback.effort").value("right")).andExpect(jsonPath("$.feedback.note").value("knee a bit stiff")));
        assertEquals("done", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :s::uuid", Map.of("s", sid.toString()), String.class));
        assertEquals(140, jdbc.queryForObject("SELECT paused_seconds FROM scheduled_session WHERE id = :s::uuid", Map.of("s", sid.toString()), Integer.class));
        // the pack is untouched and nothing was charged
        assertEquals(7, jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM package_adjustment WHERE session_id = :s::uuid", Map.of("s", sid.toString()), Integer.class));
        // the best notice, once; the trainer's feedback row, once
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid AND kind = 'best' AND session_id = :s::uuid", Map.of("c", c.toString(), "s", sid.toString()), Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workout_feedback WHERE session_id = :s::uuid", Map.of("s", sid.toString()), Integer.class));

        // a second finish: the same summary, 200, nothing new
        String again = body(finish(token, sid.toString(), "{\"effort\":\"hard\"}").andExpect(status().isOk()).andExpect(jsonPath("$.summary.newBests", hasSize(1))).andExpect(jsonPath("$.feedback.effort").value("right")));
        assertEquals(JsonPath.<Object>read(done, "$.session.endedAt"), JsonPath.<Object>read(again, "$.session.endedAt"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid AND kind = 'best'", Map.of("c", c.toString()), Integer.class));
        // a finished self-run is final
        patchSet(token, sid.toString(), s1, "{\"done\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_DONE"));
        start(token, sid, p.workout).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_DONE"));

        // how it felt, afterwards
        mvc.perform(put("/v1/portal/sessions/" + sid + "/feedback").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"effort\":\"hard\",\"note\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effort").value("hard")).andExpect(jsonPath("$.note").value(nullValue()));
        mvc.perform(put("/v1/portal/sessions/" + sid + "/feedback").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"effort\":\"meh\"}")).andExpect(status().isBadRequest());
        getLog(token, sid.toString()).andExpect(jsonPath("$.feedback.effort").value("hard")).andExpect(jsonPath("$.session.status").value("done"));
    }

    @Test
    @DisplayName("the first finished session is a milestone, once; a best with no earlier history is not a best; the best notice honours the client's own switch")
    void milestoneAndSwitch() throws Exception {
        UUID c = live();
        var p = plan(c);
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, notify_personal_best) SELECT id, tenant_id, false FROM client WHERE id = :c::uuid", Map.of("c", c.toString()));
        String token = token();
        UUID sid = UUID.randomUUID();
        String log = body(start(token, sid, p.workout));
        patchSet(token, sid.toString(), JsonPath.read(log, "$.exercises[0].sets[0].id"), "{\"done\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.isBest").value(false));
        finish(token, sid.toString(), "{}").andExpect(status().isOk()).andExpect(jsonPath("$.summary.newBests", hasSize(0)))
                .andExpect(jsonPath("$.summary.milestones", hasSize(1))).andExpect(jsonPath("$.summary.milestones[0].kind").value("sessions_1"))
                .andExpect(jsonPath("$.summary.milestones[0].label").value("Your first session"));
        finish(token, sid.toString(), "{}").andExpect(jsonPath("$.summary.milestones", hasSize(1)));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM milestone WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid AND kind = 'best'", Map.of("c", c.toString()), Integer.class));
    }

    @Test
    @DisplayName("my sessions: both kinds, newest first, a self-run with nothing done is not listed, paged by cursor, and the figures are this client's")
    void listing() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        UUID a = session(c, p.workout, Instant.now().minus(3, ChronoUnit.DAYS), 60, "done", "trainer", null, null);
        UUID b = session(c, p.workout, Instant.now().minus(2, ChronoUnit.DAYS), 60, "done", "client", Instant.now().minus(2, ChronoUnit.DAYS), Instant.now().minus(2, ChronoUnit.DAYS).plusSeconds(3000));
        setDone(b, c, p.squat, 60, 10, Instant.now().minus(2, ChronoUnit.DAYS));
        session(c, p.workout, Instant.now().minus(1, ChronoUnit.DAYS), 60, "done", "client", Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().minus(1, ChronoUnit.DAYS).plusSeconds(60));   // nothing done: hidden
        session(c, p.workout, Instant.now().plus(1, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);   // not finished: not listed
        UUID other = liveOther();
        UUID theirs = session(other, null, Instant.now().minus(1, ChronoUnit.HOURS), 60, "done", "trainer", null, null);
        message(c, "recap", "Depth was spot on.", a, Instant.now().minus(3, ChronoUnit.DAYS), false);

        String page = body(mvc.perform(get("/v1/portal/sessions?state=done&limit=1").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].id").value(b.toString())).andExpect(jsonPath("$.items[0].loggedBy").value("client"))
                .andExpect(jsonPath("$.items[0].setsDone").value(1)).andExpect(jsonPath("$.items[0].volumeKg").value(600)).andExpect(jsonPath("$.items[0].workoutName").value("Lower body A"))
                .andExpect(jsonPath("$.items[0].recapUnread").value(false)).andExpect(jsonPath("$.nextCursor").isString()));
        String next = JsonPath.read(page, "$.nextCursor");
        mvc.perform(get("/v1/portal/sessions?state=done&limit=1&cursor=" + next).header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(a.toString())).andExpect(jsonPath("$.items[0].loggedBy").value("trainer")).andExpect(jsonPath("$.items[0].recapUnread").value(true))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
        String all = body(mvc.perform(get("/v1/portal/sessions").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.items", hasSize(2))));
        assertFalse(all.contains(theirs.toString()), "nobody else's session");
        mvc.perform(get("/v1/portal/sessions?state=scheduled").header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/portal/sessions?cursor=nonsense").header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on every workout route, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        var p = plan(c);
        String token = token();
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        mvc.perform(get("/v1/portal/workouts/" + p.workout).header("Authorization", "Bearer " + token)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        start(token, UUID.randomUUID(), p.workout).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        mvc.perform(get("/v1/portal/sessions").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        mvc.perform(get("/v1/portal/workouts/" + p.workout)).andExpect(status().isUnauthorized());
    }

    private UUID liveOther2() {
        String p = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", p));
        return liveRow(arun, p);
    }

    private String phoneOf(UUID client) {
        return jdbc.queryForObject("SELECT phone FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class);
    }

    private String tokenFor(String p) throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + p + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(p) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private UUID live() {
        trainerOnce();
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", phone));
        return liveRow(arun, phone);
    }

    private UUID liveOther() {
        return liveRow(arun, "+91980000" + String.format("%04d", 1000 + (++seq)));
    }

    private UUID liveRow(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair' WHERE id = :c::uuid", Map.of("c", id.toString()));
        return id;
    }

    private void trainerOnce() {
        me = arun;
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", arun.toString()), String.class));
    }

    private String token() throws Exception {
        return signInToken();
    }

    private UUID program(UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "c", clientId.toString()));
        return id;
    }

    private UUID workout(UUID prog, int week, int day, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, :d, 0, :n)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "p", prog.toString(), "w", week, "d", day, "n", name));
        return id;
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)", Map.of("id", id.toString(), "n", name, "src", "t-" + id));
        return id;
    }

    private UUID workoutExercise(UUID workout, UUID ex, int pos) {
        UUID id = UUID.randomUUID();
        // one exercise row per call would make four exercises; the test wants one exercise with four sets, so reuse the row after the first
        var found = jdbc.queryForList("SELECT id::text FROM workout_exercise WHERE workout_id = :w::uuid AND exercise_id = :e::uuid", Map.of("w", workout.toString(), "e", ex.toString()), String.class);
        if (!found.isEmpty()) return UUID.fromString(found.getFirst());
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, :p)",
                Map.of("id", id.toString(), "ten", tenant.toString(), "w", workout.toString(), "e", ex.toString(), "p", pos));
        return id;
    }

    private void workoutSet(UUID we, int rest) {
        int pos = jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", we.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, load_value, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, :p, 'weight', 'reps', 20, 10, :r)",
                Map.of("ten", tenant.toString(), "w", we.toString(), "p", pos, "r", rest));
    }

    private UUID session(UUID clientId, UUID workoutId, Instant at, int minutes, String status, String loggedBy, Instant started, Instant ended) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("w", workoutId == null ? null : workoutId.toString());
        m.put("at", java.sql.Timestamp.from(at)); m.put("m", minutes); m.put("e", java.sql.Timestamp.from(at.plusSeconds(minutes * 60L))); m.put("s", status); m.put("lb", loggedBy);
        m.put("st", started == null ? null : java.sql.Timestamp.from(started)); m.put("en", ended == null ? null : java.sql.Timestamp.from(ended));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, CAST(:w AS uuid), :at, :m, :e, :s, :lb, :st, :en)""", m);
        return id;
    }

    private void setDone(UUID sessionId, UUID clientId, UUID ex, int load, int reps, Instant at) {
        UUID sx = UUID.fromString(jdbc.queryForList("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid",
                Map.of("s", sessionId.toString(), "e", ex.toString()), String.class).stream().findFirst().orElseGet(() -> {
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                    Map.of("x", id.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", ex.toString()));
            return id.toString();
        }));
        int pos = jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at) VALUES (:x::uuid, :p, false, 'weight', 'reps', :l, :r, :at)",
                Map.of("x", sx.toString(), "p", pos, "l", load, "r", reps, "at", java.sql.Timestamp.from(at)));
    }

    private UUID message(UUID clientId, String kind, String body, UUID sessionId, Instant at, boolean deleted) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("k", kind); m.put("b", body);
        m.put("s", sessionId == null ? null : sessionId.toString()); m.put("at", java.sql.Timestamp.from(at)); m.put("d", deleted);
        jdbc.update("""
                INSERT INTO client_message (id, tenant_id, client_id, trainer_id, session_id, body, kind, at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, CAST(:s AS uuid), :b, :k, :at, CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    private void pack(UUID clientId, int total, int left) {
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', :tot, :left, 12000, 'INR', current_date, current_date + 60)""",
                Map.of("t", arun.toString(), "c", clientId.toString(), "tot", total, "left", left));
    }

    private void milestone(UUID clientId, String kind, String label, Instant at) {
        jdbc.update("INSERT INTO milestone (tenant_id, client_id, kind, label, at) SELECT tenant_id, id, :k, :l, :at FROM client WHERE id = :c::uuid",
                Map.of("k", kind, "l", label, "at", java.sql.Timestamp.from(at), "c", clientId.toString()));
    }

    private void assessment(UUID clientId, boolean sent, java.time.LocalDate due) {
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
                SELECT gen_random_uuid(), c.tenant_id, c.trainer_id, c.id, t.id, 'Weekly check-in', '{"measurements":[],"questions":[]}'::jsonb, :d::date, now()
                  FROM client c JOIN assessment_template t ON t.trainer_id = c.trainer_id WHERE c.id = :c::uuid LIMIT 1""",
                Map.of("d", due.toString(), "c", clientId.toString()));
    }

    /** The credential verify answers for this number. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private UUID client(UUID trainerId, String p, String membership) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("p", p);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', :p, 'independent')", m);
        if ("invited".equals(membership)) jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
        return id;
    }

    private UUID trainer(String p, String name, String headline) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", p));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", p), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au, "n", name));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (gen_random_uuid(), :t::uuid, 'Weekly')", Map.of("t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender portalWorkoutCapturingSender() {
            return this;
        }

        @Override
        public void send(String phone, String code) {
            sent.put(phone, code);
        }

        String codeFor(String phone) {
            String code = sent.get(phone);
            if (code == null) throw new AssertionError("no code was sent to " + phone);
            return code;
        }
    }
}
