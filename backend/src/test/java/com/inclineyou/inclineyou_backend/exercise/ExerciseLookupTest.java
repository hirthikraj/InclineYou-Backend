package com.inclineyou.inclineyou_backend.exercise;

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

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Resolving exercises by id, and `log_type` on the wire.
 *
 * <p>The phone holds the library in SQLite and joins locally. The online half
 * holds nothing, so every screen that draws a set log, a program row or a plan
 * had to pull the WHOLE library — {@code ?size=2000} — to turn six UUIDs into
 * six names, on load, on each of those screens. It was only affordable at all
 * because the library has been text-only since V22.
 *
 * <p>{@code log_type} is the second half of the same problem: the column has
 * existed since V12 and travels in the sync envelope, but not on this response,
 * so the web INFERRED whether an exercise carries a load from whether past sets
 * had one. That is a decent guess with nothing at all to go on for an exercise
 * nobody has logged yet.
 */
@SpringBootTest
@Transactional
class ExerciseLookupTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private UUID owner;
    private UUID other;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000060");
        other = trainer("9100000061");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ─────────────────────────────────────────────── ?ids= (gap 8) ── */

    @Test
    @DisplayName("ids resolves exactly the rows named, and nothing else")
    void idsReturnsOnlyThose() throws Exception {
        var bench = exercise(owner, "Bench press", null);
        var chinUp = exercise(owner, "Chin-up", "reps");
        exercise(owner, "Leg press", null);

        mvc.perform(get("/v1/exercises").param("ids", bench + "," + chinUp))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(2))
                .andExpect(jsonPath("$.total").value(2));
    }

    /**
     * Paging is ignored when `ids` is present. A `size=20` default silently
     * keeping the first twenty of thirty named ids is the same missing-name bug
     * that this parameter exists to stop, wearing a different costume.
     */
    @Test
    @DisplayName("ids ignores paging — the caller named the rows it wants")
    void idsIgnoresPaging() throws Exception {
        var a = exercise(owner, "A lift", null);
        var b = exercise(owner, "B lift", null);
        var c = exercise(owner, "C lift", null);

        mvc.perform(get("/v1/exercises")
                        .param("ids", a + "," + b + "," + c)
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(3));
    }

    /**
     * The dangerous failure: if an empty id set fell through to "no filter", a
     * caller with an empty basket would get the entire library back — the exact
     * response this parameter exists to avoid.
     */
    @Test
    @DisplayName("ids that resolves to nothing returns nothing, not the whole library")
    void emptyIdsReturnsEmpty() throws Exception {
        exercise(owner, "Bench press", null);

        mvc.perform(get("/v1/exercises").param("ids", " , , "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(0))
                .andExpect(jsonPath("$.total").value(0));
    }

    /**
     * A malformed id must never silently drop out of the filter — that returns a
     * shorter list which looks complete, and draws a set log with a blank where
     * the exercise should be.
     */
    @Test
    @DisplayName("a malformed id is a 400, not a quietly shorter list")
    void malformedIdIsRefused() throws Exception {
        var bench = exercise(owner, "Bench press", null);

        mvc.perform(get("/v1/exercises").param("ids", bench + ",not-a-uuid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("ids cannot reach another trainer's custom exercise")
    void idsRespectsCustomOwnership() throws Exception {
        var theirs = exercise(other, "Their private lift", null);

        mvc.perform(get("/v1/exercises").param("ids", theirs.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(0));
    }

    @Test
    @DisplayName("a trailing comma is a formatting slip, not a missing row")
    void trailingCommaIsTolerated() throws Exception {
        var bench = exercise(owner, "Bench press", null);

        mvc.perform(get("/v1/exercises").param("ids", bench + ","))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(1));
    }

    /* ──────────────────────────────────────────── log_type (gap 5) ── */

    @Test
    @DisplayName("logType reaches the wire")
    void logTypeIsOnTheResponse() throws Exception {
        var chinUp = exercise(owner, "Chin-up", "reps");

        mvc.perform(get("/v1/exercises").param("ids", chinUp.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises[0].logType").value("reps"));
    }

    /**
     * V12 left it NULL on all 873 seeded rows, and null reads as 'weight_reps' —
     * which is what every one of them is. The field comes back as it is stored;
     * the reading is the caller's, and its inference stays as the fallback.
     */
    @Test
    @DisplayName("a row that predates the column comes back null, not guessed at")
    void nullLogTypeSurvives() throws Exception {
        var bench = exercise(owner, "Bench press", null);

        mvc.perform(get("/v1/exercises").param("ids", bench.toString()))
                .andExpect(jsonPath("$.exercises[0].logType").doesNotExist());
    }

    /**
     * Without this on the request, a custom exercise created over REST could only
     * ever be a weight exercise — so the web could not add a chin-up, which the
     * phone has been able to do since V12.
     */
    @Test
    @DisplayName("a custom exercise can be created as reps-only")
    void customCanBeRepsOnly() throws Exception {
        mvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Chin-up\",\"logType\":\"reps\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.logType").value("reps"));
    }

    /** Same default the sync push applies, so the two writers cannot disagree. */
    @Test
    @DisplayName("an unstated logType is weight_reps, matching the sync push")
    void defaultsToWeightReps() throws Exception {
        mvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ananya's shoulder rehab\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.logType").value("weight_reps"));
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID exercise(UUID trainerId, String name, String logType) {
        var id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("name", name);
        p.put("tid", trainerId.toString());
        p.put("logType", logType);
        jdbc.update("""
                INSERT INTO exercise (id, name, origin, trainer_id, log_type)
                VALUES (:id::uuid, :name, 'trainer', :tid::uuid, :logType)
                """, p);
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

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
