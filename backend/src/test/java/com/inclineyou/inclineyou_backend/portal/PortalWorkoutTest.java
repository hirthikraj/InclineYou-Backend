package com.inclineyou.inclineyou_backend.portal;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Module 11b · a client logging their own workout. Pinned: resume-before-create;
 * the log is seeded from the plan's row for the session's SLOT; a set is an
 * upsert on (movement, set number) and only against a card in the log; a swap
 * only to the trainer's approved alternative and only before any set; finishing
 * is idempotent, stores the feedback, may mint one milestone — and never marks
 * the session or charges the pack.
 */
@SpringBootTest
@Transactional
class PortalWorkoutTest {

    private static final String PHONE = "9100001601";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID asha;
    private UUID meera;
    private UUID other;      // somebody else's client
    private UUID bench;
    private UUID row;
    private UUID pushup;
    private UUID program;
    private UUID thursday;   // Meera's session on her Day 2
    private UUID pack;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        asha = uuid("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, '9100001611', 'Asha Rao')");
        meera = uuid("INSERT INTO client (id, trainer_id, name, phone, membership_status, accepted_at) VALUES (:id::uuid, '" + asha + "', 'Meera', '" + PHONE + "', 'accepted', now())");
        other = uuid("INSERT INTO client (id, trainer_id, name, phone) VALUES (:id::uuid, '" + asha + "', 'Sanjay', '9100001699')");
        bench = uuid("INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, 'Bench press', false)");
        row = uuid("INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, 'Barbell row', false)");
        pushup = uuid("INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, 'Push-up', false)");
        program = uuid("""
                INSERT INTO program (id, trainer_id, client_id, name, status, schedule, training_days, start_date)
                VALUES (:id::uuid, '%s', '%s', 'Plan', 'active',
                        '[{"day":1,"weekday":1,"time":"07:00"},{"day":2,"weekday":4,"time":"07:00"}]', '1,4', CURRENT_DATE)
                """.formatted(asha, meera));
        planRow(bench, 1, pushup, 10);
        planRow(row, 4, null, 12);
        thursday = uuid("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at, status, template_day, day_label)
                VALUES (:id::uuid, '%s', '%s', '%s', now() + interval '1 hour', 'scheduled', 2, 'Pull')
                """.formatted(asha, meera, program));
        pack = uuid("""
                INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining, amount, status)
                VALUES (:id::uuid, '%s', '%s', 'session_pack', 12, 12, 6000, 'active')
                """.formatted(asha, meera));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(PHONE, null, AuthorityUtils.createAuthorityList("ROLE_CLIENT")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("start seeds the log from the plan row for the session's slot, in the client's workspace; a second start resumes it")
    void startAndResume() throws Exception {
        String id = start("{\"sessionId\":\"" + thursday + "\"}", 201);
        mvc.perform(get("/v1/me/workouts/" + id))
                .andExpect(jsonPath("$.exercises.length()").value(1))
                .andExpect(jsonPath("$.exercises[0].exercise.name").value("Barbell row"))
                .andExpect(jsonPath("$.exercises[0].targetReps").value(12))
                .andExpect(jsonPath("$.dayLabel").value("Pull"));
        var w = jdbc.queryForMap("SELECT logged_by, tenant_id::text AS t, program_id::text AS p FROM workout_session WHERE id = :id::uuid", Map.of("id", id));
        assertThat(w.get("logged_by")).isEqualTo("client");
        assertThat(w.get("p")).isEqualTo(program.toString());
        assertThat(w.get("t")).isEqualTo(tenantOf(meera));
        assertThat(start("{\"sessionId\":\"" + thursday + "\"}", 200)).isEqualTo(id);
    }

    @Test
    @DisplayName("somebody else's session is a 404; a cancelled one is 409 SESSION_CANCELLED")
    void startRefusals() throws Exception {
        UUID theirs = uuid("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, status) VALUES (:id::uuid, '%s', '%s', now(), 'scheduled')".formatted(asha, other));
        mvc.perform(post("/v1/me/workouts").contentType(MediaType.APPLICATION_JSON).content("{\"sessionId\":\"" + theirs + "\"}"))
                .andExpect(status().isNotFound());
        jdbc.update("UPDATE scheduled_session SET status = 'cancelled' WHERE id = :id::uuid", Map.of("id", thursday.toString()));
        mvc.perform(post("/v1/me/workouts").contentType(MediaType.APPLICATION_JSON).content("{\"sessionId\":\"" + thursday + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SESSION_CANCELLED"));
    }

    @Test
    @DisplayName("a set is an upsert on (movement, set number), only against a card, never on a closed log")
    void sets() throws Exception {
        String id = start("{\"sessionId\":\"" + thursday + "\"}", 201);
        postSet(id, row, 1, "40", 12).andExpect(status().isCreated()).andExpect(jsonPath("$.loadKg").value(40));
        postSet(id, row, 1, "42.5", 10).andExpect(status().isOk()).andExpect(jsonPath("$.loadKg").value(42.5));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM set_log WHERE workout_session_id = :id::uuid",
                Map.of("id", id), Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT tenant_id::text FROM set_log WHERE workout_session_id = :id::uuid",
                Map.of("id", id), String.class)).isEqualTo(tenantOf(meera));
        postSet(id, bench, 1, "60", 8).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("exerciseId: not in this workout"));
        postSet(id, row, 0, "40", 8).andExpect(status().isBadRequest());

        mvc.perform(post("/v1/me/workouts/" + id + "/finish")).andExpect(status().isOk());
        postSet(id, row, 2, "40", 8).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WORKOUT_CLOSED"));
    }

    @Test
    @DisplayName("a swap goes only to the approved alternative, and only before a set is logged")
    void swap() throws Exception {
        // A Monday log with no session: seeded from today's weekday is not predictable, so card bench by hand.
        String id = start("{\"sessionId\":\"" + thursday + "\"}", 201);
        jdbc.update("INSERT INTO workout_exercise (workout_session_id, exercise_id, order_index) VALUES (:w::uuid, :e::uuid, 1)",
                Map.of("w", id, "e", bench.toString()));
        swapReq(id, bench, row).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("NOT_APPROVED"));
        swapReq(id, bench, pushup).andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises[1].exercise.name").value("Push-up"))
                .andExpect(jsonPath("$.exercises[1].swappedFromExerciseId").value(bench.toString()))
                .andExpect(jsonPath("$.exercises[1].targetReps").value(8));
        postSet(id, row, 1, "40", 12);
        jdbc.update("UPDATE program_exercise SET alt_exercise_id = :a::uuid WHERE exercise_id = :e::uuid",
                Map.of("a", pushup.toString(), "e", row.toString()));
        swapReq(id, row, bench).andExpect(status().isUnprocessableContent());
        mvc.perform(post("/v1/me/workouts/" + id + "/swap").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + UUID.randomUUID() + "\",\"toExerciseId\":\"" + pushup + "\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("finish is idempotent, stores the feedback, and marks no session and charges no pack")
    void finish() throws Exception {
        String id = start("{\"sessionId\":\"" + thursday + "\"}", 201);
        postSet(id, row, 1, "40", 12);
        mvc.perform(post("/v1/me/workouts/" + id + "/finish").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effort\":\"hard\",\"note\":\"Grip gave out\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").isNumber())
                .andExpect(jsonPath("$.feedback.effort").value("hard"))
                .andExpect(jsonPath("$.feedback.note").value("Grip gave out"));
        Object firstEnd = jdbc.queryForObject("SELECT ended_at FROM workout_session WHERE id = :id::uuid", Map.of("id", id), Object.class);
        mvc.perform(post("/v1/me/workouts/" + id + "/finish").contentType(MediaType.APPLICATION_JSON).content("{\"effort\":\"right\"}"))
                .andExpect(jsonPath("$.feedback.effort").value("right"))
                .andExpect(jsonPath("$.feedback.note").value("Grip gave out"));
        assertThat(jdbc.queryForObject("SELECT ended_at FROM workout_session WHERE id = :id::uuid", Map.of("id", id), Object.class))
                .isEqualTo(firstEnd);

        assertThat(jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid",
                Map.of("id", thursday.toString()), String.class)).isEqualTo("scheduled");
        assertThat(jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :id::uuid",
                Map.of("id", pack.toString()), Integer.class)).isEqualTo(12);
        mvc.perform(get("/v1/me/workouts")).andExpect(jsonPath("$[0].effort").value("right"));
        mvc.perform(post("/v1/me/workouts/" + id + "/finish").contentType(MediaType.APPLICATION_JSON).content("{\"effort\":\"brutal\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the 25th finished workout mints one milestone, named for the trainer by first name")
    void milestone() throws Exception {
        for (int k = 0; k < 24; k++) {
            jdbc.update("INSERT INTO workout_session (trainer_id, client_id, session_date, ended_at) VALUES (:t::uuid, :c::uuid, CURRENT_DATE - :k, now())",
                    Map.of("t", asha.toString(), "c", meera.toString(), "k", k + 1));
        }
        String id = start("{\"sessionId\":\"" + thursday + "\"}", 201);
        mvc.perform(post("/v1/me/workouts/" + id + "/finish")).andExpect(status().isOk());
        mvc.perform(post("/v1/me/workouts/" + id + "/finish")).andExpect(status().isOk());
        mvc.perform(get("/v1/me/milestones"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].label").value("25th session with Asha"))
                .andExpect(jsonPath("$[0].value").value(25));
    }

    @Test
    void ordinals() {
        assertThat(PortalWorkoutService.ordinal(25)).isEqualTo("25th");
        assertThat(PortalWorkoutService.ordinal(101)).isEqualTo("101st");
        assertThat(PortalWorkoutService.ordinal(112)).isEqualTo("112th");
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private String start(String body, int expected) throws Exception {
        String json = mvc.perform(post("/v1/me/workouts").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private org.springframework.test.web.servlet.ResultActions postSet(String id, UUID exercise, int n, String load, int reps) throws Exception {
        return mvc.perform(post("/v1/me/workouts/" + id + "/sets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"exerciseId\":\"%s\",\"setNumber\":%d,\"loadKg\":%s,\"reps\":%d}".formatted(exercise, n, load, reps)));
    }

    private org.springframework.test.web.servlet.ResultActions swapReq(String id, UUID from, UUID to) throws Exception {
        return mvc.perform(post("/v1/me/workouts/" + id + "/swap").contentType(MediaType.APPLICATION_JSON)
                .content("{\"exerciseId\":\"" + from + "\",\"toExerciseId\":\"" + to + "\"}"));
    }

    private void planRow(UUID exercise, int weekday, UUID alt, int reps) {
        var p = new java.util.HashMap<String, Object>();
        p.put("p", program.toString());
        p.put("e", exercise.toString());
        p.put("d", weekday);
        p.put("a", alt == null ? null : alt.toString());
        p.put("r", reps);
        jdbc.update("""
                INSERT INTO program_exercise (program_id, exercise_id, day_of_week, sets, reps, alt_exercise_id, order_index, week)
                VALUES (:p::uuid, :e::uuid, :d, 3, :r, CAST(:a AS uuid), 0, 1)
                """, p);
        // Bench's approved alternative (push-up) prescribes 8.
        if (alt != null) jdbc.update("UPDATE program_exercise SET reps = 8 WHERE exercise_id = :e::uuid AND program_id = :p::uuid",
                Map.of("e", exercise.toString(), "p", program.toString()));
    }

    private String tenantOf(UUID clientId) {
        return jdbc.queryForObject("SELECT tenant_id::text FROM client WHERE id = :id::uuid", Map.of("id", clientId.toString()), String.class);
    }

    private UUID uuid(String insert) {
        UUID id = UUID.randomUUID();
        jdbc.update(insert, Map.of("id", id.toString()));
        return id;
    }
}
