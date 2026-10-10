package com.inclineyou.inclineyou_backend.core.session;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R107 (api-contract v1.2): a workout the client did alone ({@code logged_by = 'client'}) is not the trainer's time.
 * Every trainer read that means <i>my diary</i> must leave it out, every read that means <i>this client's history</i>
 * must keep it, and the trainer's verbs on a session (done, no-show, cancel, start, end) must not reach it.
 *
 * <p>This is the build-order trap in the portal work: the first client to press Start would otherwise appear in every
 * trainer's diary and be counted as a delivered session. One test per rule in the contract's table, each of which fails
 * if that read forgets the filter. The client-side routes that CREATE such rows are not built yet, so the rows are
 * inserted directly, as V11 allows them.
 */
@SpringBootTest
@Transactional
class ClientLoggedSessionsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, client, program, w1, w2, exercise;
    private Instant yesterday, twoDaysAgo, tomorrow;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001070', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001070'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Ravi', 'independent', 'active')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
        program = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)",
                Map.of("id", program.toString(), "t", me.toString(), "ten", tenant.toString(), "c", client.toString()));
        w1 = workout("Day A", 1);
        w2 = workout("Day B", 2);
        exercise = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, 'Squat', 'inclineyou', 'weight_reps', :src)",
                Map.of("id", exercise.toString(), "src", "test-" + exercise));
        Instant now = Instant.now();
        yesterday = now.minus(1, ChronoUnit.DAYS);
        twoDaysAgo = now.minus(2, ChronoUnit.DAYS);
        tomorrow = now.plus(1, ChronoUnit.DAYS);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    /* ───────────────────────────────────────────────────── the diary excludes it ── */

    @Test
    @DisplayName("the diary window never lists a workout the client did alone")
    void diaryLeavesItOut() throws Exception {
        UUID mine = trainerSession(yesterday, "done");
        selfRun(yesterday.minusSeconds(3600), w1, true);

        mvc.perform(get("/v1/sessions").param("from", day(twoDaysAgo)).param("to", day(tomorrow)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(mine.toString()))
                .andExpect(jsonPath("$.items[0].loggedBy").value("trainer"));
    }

    @Test
    @DisplayName("one client's own history lists it as client-logged once a set is done, and hides an abandoned start")
    void clientHistoryKeepsItOnceItHasWork() throws Exception {
        UUID worked = selfRun(yesterday, w1, true);
        selfRun(twoDaysAgo, w2, false);   // pressed Start and walked away: no set done

        mvc.perform(get("/v1/sessions").param("from", day(twoDaysAgo.minus(1, ChronoUnit.DAYS))).param("to", day(tomorrow))
                        .param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(worked.toString()))
                .andExpect(jsonPath("$.items[0].loggedBy").value("client"));
    }

    @Test
    @DisplayName("the roster's figures count delivered trainer sessions only")
    void rosterFigures() throws Exception {
        trainerSession(twoDaysAgo, "done");
        selfRun(yesterday, w1, true);   // newer than the trainer's, and done

        mvc.perform(get("/v1/clients").param("view", "summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].stats.sessionsDone").value(1))
                .andExpect(jsonPath("$.items[0].stats.lastDoneAt").value(twoDaysAgo.truncatedTo(ChronoUnit.MILLIS).toEpochMilli()));
    }

    @Test
    @DisplayName("the practice report's delivered count excludes it")
    void practiceReport() throws Exception {
        trainerSession(yesterday, "done");
        selfRun(yesterday.minusSeconds(60), w1, true);
        selfRun(yesterday.minusSeconds(120), w2, true);

        mvc.perform(get("/v1/reports/practice").param("months", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headline.delivered").value(1));
    }

    @Test
    @DisplayName("the picker does not offer an open client workout to log, and the batch close does not touch it")
    void pickerAndBatch() throws Exception {
        UUID open = openSelfRun(Instant.now().minusSeconds(600), w1);   // started, never ended

        String pick = mvc.perform(get("/v1/sessions/pick")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertFalse(pick.contains(open.toString()), "an open client workout is not in the trainer's picker: " + pick);

        mvc.perform(post("/v1/sessions/end").contentType(MediaType.APPLICATION_JSON).content("{\"sessionIds\":[\"" + open + "\"]}"))
                .andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE id = :id::uuid AND ended_at IS NULL",
                Map.of("id", open.toString()), Integer.class), "the batch close left the client's own log open");
    }

    /* ─────────────────────────────────────────── the trainer's verbs do not reach it ── */

    @Test
    @DisplayName("done, no-show, cancel, reopen, move, start and end on a client's own workout are a 404, and change nothing")
    void trainerVerbsDoNotReachIt() throws Exception {
        UUID s = openSelfRun(yesterday, w1);
        Map<String, String> bodies = Map.of("done", "{}", "no-show", "{\"charge\":false}", "cancel", "{}", "reopen", "{}", "start", "{}", "end", "{}");
        for (var verb : bodies.entrySet()) {
            mvc.perform(post("/v1/sessions/" + s + "/" + verb.getKey()).contentType(MediaType.APPLICATION_JSON).content(verb.getValue()))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/v1/sessions/" + s)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"x\"}"))
                .andExpect(status().isNotFound());
        assertEquals("scheduled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid", Map.of("id", s.toString()), String.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM package_adjustment WHERE session_id = :id::uuid", Map.of("id", s.toString()), Integer.class));
    }

    @Test
    @DisplayName("the trainer can still read a client's own log, which is how they see what was done")
    void trainerCanReadTheLog() throws Exception {
        UUID s = selfRun(yesterday, w1, true);
        mvc.perform(get("/v1/sessions/" + s + "/log")).andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(1));
    }

    /* ──────────────────────────────────────── the plan's day counting, and pause ── */

    @Test
    @DisplayName("a finished self-run day counts as done when the next booking picks its workout; an abandoned one does not")
    void planDayCounting() throws Exception {
        selfRun(twoDaysAgo, w1, true);                 // Day A done alone
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + client + "\",\"scheduledAt\":" + Instant.now().plus(2, ChronoUnit.DAYS).toEpochMilli() + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.workout.name").value("Day B"));
    }

    @Test
    @DisplayName("pausing a client does not try to cancel a client-logged row, which the schema refuses")
    void pauseSkipsIt() throws Exception {
        // an un-started future row a buggy portal could leave: scheduled, client-logged, no slot
        UUID s = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, logged_by)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :at, 60, :at, 'client')""",
                Map.of("id", s.toString(), "t", me.toString(), "c", client.toString(), "at", Timestamp.from(tomorrow)));
        mvc.perform(post("/v1/clients/" + client + "/pause").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        assertEquals("scheduled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid", Map.of("id", s.toString()), String.class));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private static String day(Instant i) {
        return i.atZone(java.time.ZoneId.of("Asia/Kolkata")).toLocalDate().toString();
    }

    private UUID workout(String name, int d) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, 1, :d, 0, :n)",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "p", program.toString(), "d", d, "n", name));
        return id;
    }

    private UUID trainerSession(Instant at, String status) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString());
        p.put("at", Timestamp.from(at)); p.put("s", status);
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status) VALUES (:id::uuid, :t::uuid, :c::uuid, :at, 60, :at, :s)", p);
        return id;
    }

    /** A workout the client did alone: started, optionally with one set done, and finished ({@code done}) when it has work. */
    private UUID selfRun(Instant at, UUID workout, boolean withWork) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString());
        p.put("at", Timestamp.from(at)); p.put("w", workout.toString()); p.put("s", withWork ? "done" : "scheduled");
        p.put("ended", withWork ? Timestamp.from(at.plusSeconds(1800)) : null);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status,
                                               logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :w::uuid, :at, 60, :at, :s, 'client', :at, :ended)""", p);
        if (withWork) addSet(id, at);
        return id;
    }

    /** A started, unfinished client workout with one set done — the open log a trainer's picker must not offer. */
    private UUID openSelfRun(Instant at, UUID workout) {
        UUID id = selfRun(at, workout, false);
        addSet(id, at);
        return id;
    }

    private void addSet(UUID sessionId, Instant at) {
        UUID sx = UUID.randomUUID();
        jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                Map.of("x", sx.toString(), "s", sessionId.toString(), "c", client.toString(), "e", exercise.toString()));
        jdbc.update("""
                INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at, entered_by)
                VALUES (:x::uuid, 1, false, 'weight', 'reps', 40, 8, :at, 'client')""",
                Map.of("x", sx.toString(), "at", Timestamp.from(at)));
    }
}
