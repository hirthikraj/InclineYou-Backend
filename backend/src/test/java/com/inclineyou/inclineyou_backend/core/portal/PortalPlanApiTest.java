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
 * api-contract 1.2, pp-l1 … pp-l4: the plan (what is coming, and the arc), past plans, progress (strength then consistency) and strength per
 * exercise. Through the security chain; the suite runs as the schema owner, so every query here also names the client id — the second wall.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalPlanApiTest.CapturingSender.class)
@Transactional
class PortalPlanApiTest {

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

    private ResultActions get(String token, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private static Instant ago(int days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    /** A done session of the client with one exercise's sets, the same shape the trainer's console logs. */
    private UUID done(UUID c, UUID workout, Instant at, String by, UUID ex, int load, int reps) {
        UUID s = session(c, workout, at, 60, "done", by, at, at.plusSeconds(3000));
        setDone(s, c, ex, load, reps, at);
        return s;
    }

    @Test
    @DisplayName("the plan: the trainer's sessions of the next fortnight with a WhatsApp draft, the arc with each day done / booked / next / todo — Home's rule — and the current week")
    void plan() throws Exception {
        UUID c = live();
        jdbc.update("UPDATE trainer_business SET gym_name = 'Cult Koramangala', training_modes = '[\"gym_floor\"]'::jsonb WHERE trainer_id = :t::uuid", Map.of("t", arun.toString()));
        UUID prog = program(c);
        jdbc.update("UPDATE program SET start_date = :d::date, weeks = 4 WHERE id = :p::uuid", Map.of("d", java.time.LocalDate.now().minusDays(9).toString(), "p", prog.toString()));
        UUID w1 = workout(prog, 1, 1, "Day one"), w2 = workout(prog, 1, 2, "Day two"), w3 = workout(prog, 1, 3, "Day three"), w4 = workout(prog, 2, 1, "Day four");
        UUID ex = ex("Back squat", "quads", "weight_reps");
        UUID finished = done(c, w1, ago(3), "trainer", ex, 50, 8);
        UUID booked = session(c, w2, Instant.now().plus(2, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);
        session(c, null, Instant.now().plus(20, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);   // beyond the fortnight
        session(c, null, ago(1), 60, "scheduled", "trainer", null, null);                                      // over, so not "coming"
        session(c, w3, Instant.now().plus(1, ChronoUnit.DAYS), 30, "scheduled", "client", Instant.now().plus(1, ChronoUnit.DAYS), null);   // a self-run is not the trainer's
        UUID other = liveOther();
        session(other, null, Instant.now().plus(3, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);
        String token = tokenFor(phone);

        String out = body(get(token, "/v1/portal/plan").andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.upcoming", hasSize(1))).andExpect(jsonPath("$.upcoming[0].id").value(booked.toString())).andExpect(jsonPath("$.upcoming[0].workoutName").value("Day two"))
                .andExpect(jsonPath("$.upcoming[0].place").value("Cult Koramangala")).andExpect(jsonPath("$.upcoming[0].rescheduleUrl").value(org.hamcrest.Matchers.startsWith("https://wa.me/919100002501?text=")))
                .andExpect(jsonPath("$.program.name").value("Plan")).andExpect(jsonPath("$.program.weeks").value(4)).andExpect(jsonPath("$.program.currentWeek").value(2))
                .andExpect(jsonPath("$.program.days", hasSize(4)))
                .andExpect(jsonPath("$.program.days[0].state").value("done")).andExpect(jsonPath("$.program.days[0].sessionId").value(finished.toString()))
                .andExpect(jsonPath("$.program.days[1].state").value("booked")).andExpect(jsonPath("$.program.days[1].sessionId").value(booked.toString()))
                .andExpect(jsonPath("$.program.days[2].state").value("next")).andExpect(jsonPath("$.program.days[2].sessionId").value(nullValue()))
                .andExpect(jsonPath("$.program.days[3].state").value("todo")));
        assertFalse(out.contains("Day four\",\"state\":\"next"));
        // and Home agrees on the day: the same rule picks the self-run
        get(token, "/v1/portal/home").andExpect(jsonPath("$.hero.workout.id").value(w3.toString()));

        // nobody's plan yet: both empty, the program null
        UUID c2 = liveOther2();
        get(tokenFor(phoneOf(c2)), "/v1/portal/plan").andExpect(status().isOk()).andExpect(jsonPath("$.upcoming", hasSize(0))).andExpect(jsonPath("$.program").value(nullValue()));
    }

    @Test
    @DisplayName("past plans: finished ones newest first with the sessions done, paged by cursor; one plan opens read-only with the trainer's cue — and another client's or a template is 404")
    void history() throws Exception {
        UUID c = live();
        UUID old1 = program(c);
        jdbc.update("UPDATE program SET status = 'completed' WHERE id = :p::uuid", Map.of("p", old1.toString()));
        UUID old2 = program(c);
        jdbc.update("UPDATE program SET status = 'completed' WHERE id = :p::uuid", Map.of("p", old2.toString()));
        jdbc.update("UPDATE program SET status = 'completed', start_date = '2026-07-20', end_date = '2026-08-30', created_at = now() - interval '60 days', name = 'Beginner base' WHERE id = :p::uuid", Map.of("p", old1.toString()));
        jdbc.update("UPDATE program SET status = 'completed', start_date = '2026-08-31', end_date = '2026-09-27', created_at = now() - interval '30 days', name = 'Strength block' WHERE id = :p::uuid", Map.of("p", old2.toString()));
        UUID w = workout(old1, 1, 1, "Lower body A");
        UUID squat = ex("Back squat", "quads", "weight_reps");
        UUID row = workoutExercise(w, squat, 0);
        jdbc.update("UPDATE workout_exercise SET notes = 'Chest up.', section = 'Main' WHERE id = :r::uuid", Map.of("r", row.toString()));
        set(row, 1, "weight", "reps", 60, 8, 90);
        UUID alt = UUID.randomUUID();
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position, alternative_of) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, 1, :m::uuid)",
                Map.of("id", alt.toString(), "ten", tenant.toString(), "w", w.toString(), "e", ex("Leg press", "quads", "weight_reps").toString(), "m", row.toString()));
        done(c, w, ago(50), "trainer", squat, 50, 8);
        done(c, w, ago(45), "trainer", squat, 52, 8);
        UUID active = program(c);   // the one being followed is not a past plan
        UUID other = liveOther();
        UUID theirs = program(other);
        UUID template = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, 'Template', 4)", Map.of("id", template.toString(), "t", arun.toString(), "ten", tenant.toString()));
        String token = tokenFor(phone);

        String page = body(get(token, "/v1/portal/plan/history?limit=1").andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].name").value("Strength block")).andExpect(jsonPath("$.items[0].weeks").value(4)).andExpect(jsonPath("$.items[0].sessionsDone").value(0))
                .andExpect(jsonPath("$.items[0].startDate").value("2026-08-31")).andExpect(jsonPath("$.nextCursor").isString()));
        String next = com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor");
        get(token, "/v1/portal/plan/history?limit=1&cursor=" + next).andExpect(jsonPath("$.items[0].name").value("Beginner base")).andExpect(jsonPath("$.items[0].sessionsDone").value(2))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
        get(token, "/v1/portal/plan/history?cursor=nonsense").andExpect(status().isBadRequest());

        get(token, "/v1/portal/programs/" + old1).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Beginner base")).andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.workouts", hasSize(1))).andExpect(jsonPath("$.workouts[0].name").value("Lower body A"))
                .andExpect(jsonPath("$.workouts[0].exercises", hasSize(1))).andExpect(jsonPath("$.workouts[0].exercises[0].name").value("Back squat"))
                .andExpect(jsonPath("$.workouts[0].exercises[0].cue").value("Chest up.")).andExpect(jsonPath("$.workouts[0].exercises[0].target").value("quads"))
                .andExpect(jsonPath("$.workouts[0].exercises[0].sets[0].targetLoad").value(60));
        get(token, "/v1/portal/programs/" + active).andExpect(status().isOk());
        get(token, "/v1/portal/programs/" + theirs).andExpect(status().isNotFound());
        get(token, "/v1/portal/programs/" + template).andExpect(status().isNotFound());
        get(token, "/v1/portal/programs/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("progress: strength measured against the best from before the window, consistency by who ran it with an empty self-run left out, the milestones in the window — and a bad window is 400")
    void progress() throws Exception {
        UUID c = live();
        UUID squat = ex("Back squat", "quads", "weight_reps"), press = ex("Bench press", "chest", "weight_reps");
        done(c, null, ago(60), "trainer", squat, 50, 8);                // before the window: the baseline (e1rm 63.3)
        done(c, null, ago(60), "trainer", press, 40, 8);
        done(c, null, ago(10), "trainer", squat, 62, 8);                // in the window, heavier: improved (78.5)
        done(c, null, ago(8), "trainer", press, 30, 8);                 // in the window, lighter: tracked, not improved
        UUID self = done(c, null, ago(5), "client", squat, 60, 8);
        session(c, null, ago(4), 30, "done", "client", ago(4), ago(4).plusSeconds(60));   // an abandoned start finished with nothing: not a session
        milestone(c, "sessions_10", "10th session", ago(6));
        milestone(c, "sessions_1", "Your first session", ago(90));
        String token = tokenFor(phone);

        get(token, "/v1/portal/progress").andExpect(status().isOk()).andExpect(jsonPath("$.windowDays").value(28))
                .andExpect(jsonPath("$.strength.tracked").value(2)).andExpect(jsonPath("$.strength.improved").value(1))
                .andExpect(jsonPath("$.strength.best.name").value("Back squat")).andExpect(jsonPath("$.strength.best.from.e1rm").value(63.3))
                .andExpect(jsonPath("$.strength.best.to.e1rm").value(78.5)).andExpect(jsonPath("$.strength.best.to.loadValue").value(62))
                .andExpect(jsonPath("$.strength.best.changePct").value(24))
                .andExpect(jsonPath("$.consistency.sessionsDone").value(3)).andExpect(jsonPath("$.consistency.trainerLed").value(2)).andExpect(jsonPath("$.consistency.selfRun").value(1))
                .andExpect(jsonPath("$.consistency.perWeek").value(0.8))
                .andExpect(jsonPath("$.milestones", hasSize(1))).andExpect(jsonPath("$.milestones[0].kind").value("sessions_10"));
        // a longer window reaches back to the first session and its milestone; the earlier sessions then count too
        get(token, "/v1/portal/progress?windowDays=120").andExpect(jsonPath("$.milestones", hasSize(2))).andExpect(jsonPath("$.consistency.sessionsDone").value(5));
        get(token, "/v1/portal/progress?windowDays=3").andExpect(status().isBadRequest());
        get(token, "/v1/portal/progress?windowDays=900").andExpect(status().isBadRequest());
        // nothing logged: zeros and no best, never an error
        UUID c2 = liveOther2();
        get(tokenFor(phoneOf(c2)), "/v1/portal/progress").andExpect(status().isOk()).andExpect(jsonPath("$.strength.tracked").value(0)).andExpect(jsonPath("$.strength.best").value(nullValue()))
                .andExpect(jsonPath("$.consistency.sessionsDone").value(0)).andExpect(jsonPath("$.milestones", hasSize(0)));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE id = :s::uuid", Map.of("s", self.toString()), Integer.class));
    }

    @Test
    @DisplayName("strength per exercise: what the client has trained, most recent first, with sessions and the best set; one exercise's series is one point per session — the top set and the kilograms moved")
    void exercises() throws Exception {
        UUID c = live();
        UUID squat = ex("Back squat", "quads", "weight_reps"), plank = ex("Plank", "core", "time");
        done(c, null, ago(20), "trainer", squat, 50, 8);
        UUID s2 = done(c, null, ago(10), "trainer", squat, 60, 8);
        setDone(s2, c, squat, 40, 10, ago(10));   // a lighter extra set in the same session: volume counts it, the top set does not
        done(c, null, ago(2), "client", plank, 0, 45);
        jdbc.update("UPDATE set_log SET load_kind = 'bodyweight', effort_kind = 'time', load_value = NULL WHERE session_exercise_id IN (SELECT id FROM session_exercise WHERE exercise_id = :e::uuid)", Map.of("e", plank.toString()));
        UUID other = liveOther();
        done(other, null, ago(1), "trainer", squat, 100, 5);
        String token = tokenFor(phone);

        String page = body(get(token, "/v1/portal/progress/exercises?limit=1").andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].name").value("Plank")).andExpect(jsonPath("$.items[0].sessions").value(1)).andExpect(jsonPath("$.items[0].best.e1rm").value(nullValue()))
                .andExpect(jsonPath("$.items[0].best.effortValue").value(45)).andExpect(jsonPath("$.nextCursor").isString()));
        String next = com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor");
        get(token, "/v1/portal/progress/exercises?limit=1&cursor=" + next).andExpect(jsonPath("$.items[0].name").value("Back squat")).andExpect(jsonPath("$.items[0].sessions").value(2))
                .andExpect(jsonPath("$.items[0].target").value("quads")).andExpect(jsonPath("$.items[0].best.loadValue").value(60)).andExpect(jsonPath("$.items[0].best.e1rm").value(76))
                .andExpect(jsonPath("$.items[0].lastOn").isString()).andExpect(jsonPath("$.nextCursor").value(nullValue()));

        get(token, "/v1/portal/progress/exercises/" + squat).andExpect(status().isOk()).andExpect(jsonPath("$.exercise.name").value("Back squat")).andExpect(jsonPath("$.exercise.logType").value("weight_reps"))
                .andExpect(jsonPath("$.series", hasSize(2))).andExpect(jsonPath("$.series[0].loadValue").value(50)).andExpect(jsonPath("$.series[0].volume").value(400))
                .andExpect(jsonPath("$.series[1].loadValue").value(60)).andExpect(jsonPath("$.series[1].e1rm").value(76)).andExpect(jsonPath("$.series[1].volume").value(880))
                .andExpect(jsonPath("$.bests.e1rm.loadValue").value(60)).andExpect(jsonPath("$.bests.load.loadValue").value(60));
        get(token, "/v1/portal/progress/exercises/" + squat + "?from=" + java.time.LocalDate.now().minusDays(15)).andExpect(jsonPath("$.series", hasSize(1)));
        get(token, "/v1/portal/progress/exercises/" + squat + "?from=yesterday").andExpect(status().isBadRequest());
        get(token, "/v1/portal/progress/exercises/" + UUID.randomUUID()).andExpect(status().isNotFound());
        // an exercise the client never did: an empty series and no bests, not an error — and nobody else's sets in it
        get(token, "/v1/portal/progress/exercises/" + ex("Deadlift", "back", "weight_reps")).andExpect(status().isOk()).andExpect(jsonPath("$.series", hasSize(0))).andExpect(jsonPath("$.bests.e1rm").value(nullValue()));
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on every plan and progress route, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        for (String u : new String[]{"/v1/portal/plan", "/v1/portal/plan/history", "/v1/portal/progress", "/v1/portal/progress/exercises", "/v1/portal/programs/" + UUID.randomUUID()}) {
            get(token, u).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/plan")).andExpect(status().isUnauthorized());
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
        CapturingSender portalPlanCapturingSender() {
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
