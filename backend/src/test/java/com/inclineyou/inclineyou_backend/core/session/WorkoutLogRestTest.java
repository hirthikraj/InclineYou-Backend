package com.inclineyou.inclineyou_backend.core.session;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The READ side of the old {@code /v1/workouts} log API — exerciseCount on the list and the
 * single read, and a client's whole set history. The writes (create, update, sets, exercises)
 * were removed on 3 Oct 2026 with the move to the session as the log; their tests went with
 * them, and {@link OldWorkoutWritesGoneTest} pins that they stay gone. These reads still use the
 * pre-v1 {@code workout_session} table, which is why this class fails on a v1 database until the
 * Progress pass moves them.
 */
@SpringBootTest
@Transactional
class WorkoutLogRestTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private UUID owner;
    private UUID other;
    private UUID client;
    private UUID bench;
    private UUID chinUp;

    @BeforeEach
    void setUp() {
        owner = trainer("9100000040");
        other = trainer("9100000041");
        client = client(owner, "Meera");
        bench = exercise(owner, "Bench press");
        chinUp = exercise(owner, "Chin-up");
        signedInAs(owner);

        /* This controller takes `Authentication` as a METHOD ARGUMENT, unlike the
           ones that read `SecurityContextHolder` themselves — Spring MVC resolves
           that from the request's principal, which only the security filter chain
           normally sets. The filters stay out of the chain for the reason
           PhoneAvailabilityTest gives, so the principal is supplied directly
           instead of re-testing the JWT filter here. */
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(token(owner)))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ─────────────────────────────────────────── exerciseCount (23 Sep) ── */

    @Test
    @DisplayName("exerciseCount counts the live cards in a log, not the removed one")
    void exerciseCountCountsLiveCards() throws Exception {
        var log = workout(client, "2026-08-20", null);
        card(log, bench, false);
        card(log, chinUp, true);

        mvc.perform(get("/v1/workouts").param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].exerciseCount").value(1));
    }

    @Test
    @DisplayName("a pre-V13 log — sets but no cards — counts its distinct movements, not 0")
    void exerciseCountFallsBackToSets() throws Exception {
        var log = workout(client, "2026-08-20", null);
        set(log, bench, 1, "60", 8);
        set(log, bench, 2, "60", 8);
        set(log, chinUp, 1, null, 6);

        mvc.perform(get("/v1/workouts/" + log))
                .andExpect(jsonPath("$.exerciseCount").value(2));
    }


    private void card(UUID workoutId, UUID exerciseId, boolean removed) {
        jdbc.update("""
                INSERT INTO workout_exercise (workout_session_id, exercise_id, removed_at)
                VALUES (:w::uuid, :e::uuid, CASE WHEN :removed THEN now() END)
                """, Map.of("w", workoutId.toString(), "e", exerciseId.toString(), "removed", removed));
    }

    /* ──────────────────────────────── a client's whole history (gap 3) ── */

    @Test
    @DisplayName("one request returns every set across every session, oldest first")
    void bulkSetsSpanSessions() throws Exception {
        var march = workout(client, "2026-03-02", null);
        var august = workout(client, "2026-08-20", null);
        set(march, bench, 1, "60.0", 8);
        set(august, bench, 1, "80.0", 8);
        set(august, chinUp, 1, null, 12);

        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // Oldest first, so a caller folding these into a running best or
                // a per-set-number "previous" does it in one pass.
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"))
                .andExpect(jsonPath("$[0].loadKg").value(60.0))
                .andExpect(jsonPath("$[2].sessionDate").value("2026-08-20"));
    }

    /**
     * The date has to be the SESSION's, never the row's `created_at`: a Tuesday
     * session typed up on Thursday is a Tuesday session, and both *Previous* and
     * the record test order by when the training happened.
     */
    @Test
    @DisplayName("each set carries its session's date, not the date it was typed")
    void setsCarrySessionDate() throws Exception {
        var log = workout(client, "2026-03-02", null);
        set(log, bench, 1, "60.0", 8);

        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"));

        // And the per-session read agrees with it.
        mvc.perform(get("/v1/workouts/" + log + "/sets"))
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"));
    }

    @Test
    @DisplayName("exerciseId narrows it to one movement")
    void bulkSetsNarrowByExercise() throws Exception {
        var log = workout(client, "2026-08-20", null);
        set(log, bench, 1, "80.0", 8);
        set(log, chinUp, 1, null, 12);

        mvc.perform(get("/v1/workouts/sets")
                        .param("clientId", client.toString())
                        .param("exerciseId", chinUp.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].exerciseId").value(chinUp.toString()));
    }

    /**
     * Ownership is the join, not a second check — the house rule. Another
     * trainer's client matches no session of ours and therefore no set.
     */
    @Test
    @DisplayName("another trainer's client yields nothing, not somebody else's sets")
    void bulkSetsAreTrainerScoped() throws Exception {
        var theirClient = client(other, "Rajesh");
        var theirLog = workout(other, theirClient, "2026-08-20", null);
        set(theirLog, bench, 1, "80.0", 8);

        mvc.perform(get("/v1/workouts/sets").param("clientId", theirClient.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** `/v1/workouts/sets` is a literal and must not be parsed as `/{id}`. */
    @Test
    @DisplayName("the bulk route wins the match against /{id}")
    void bulkRouteBeatsTheIdTemplate() throws Exception {
        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(status().isOk());
    }


    private UUID workout(UUID clientId, String date, String notes) {
        return workout(owner, clientId, date, notes);
    }

    private UUID workout(UUID trainerId, UUID clientId, String date, String notes) {
        var id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("date", java.sql.Date.valueOf(date));
        p.put("notes", notes);
        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, logged_by, session_date, notes)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'trainer', :date, :notes)
                """, p);
        return id;
    }

    private void set(UUID workoutId, UUID exerciseId, int number, String load, Integer reps) {
        var p = new HashMap<String, Object>();
        p.put("id", UUID.randomUUID().toString());
        p.put("wid", workoutId.toString());
        p.put("exId", exerciseId.toString());
        p.put("n", number);
        p.put("load", load == null ? null : new java.math.BigDecimal(load));
        p.put("reps", reps);
        jdbc.update("""
                INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps)
                VALUES (:id::uuid, :wid::uuid, :exId::uuid, :n, :load, :reps)
                """, p);
    }

    private UUID exercise(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO exercise (id, name, origin, trainer_id)
                VALUES (:id::uuid, :name, 'trainer', :tid::uuid)
                """, Map.of("id", id.toString(), "name", name, "tid", trainerId.toString()));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", e164));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }

    private static UsernamePasswordAuthenticationToken token(UUID trainerId) {
        return new UsernamePasswordAuthenticationToken(
                trainerId.toString(), null,
                AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(token(trainerId));
    }
}
