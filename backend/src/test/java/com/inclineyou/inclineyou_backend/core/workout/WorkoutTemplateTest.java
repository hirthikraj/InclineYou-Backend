package com.inclineyou.inclineyou_backend.core.workout;

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
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;

/**
 * V13 · saved workouts. The CRUD is ordinary; what is pinned is the
 * normalisation the builder relies on, the library check, and that PUT
 * replaces whole fields and only the ones it was sent.
 */
@SpringBootTest
@Transactional
class WorkoutTemplateTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;
    private UUID other;
    private UUID bench;
    private UUID row;
    private UUID theirs;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("9100001201");
        other = trainer("9100001202");
        bench = exercise("Bench press", null);
        row = exercise("Barbell row", null);
        theirs = exercise("Their private lift", other);
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("an empty account is [], and a bare POST is a workout called 'New workout'")
    void emptyAndDefaults() throws Exception {
        mvc.perform(get("/v1/workout-templates")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("New workout"))
                .andExpect(jsonPath("$.exerciseCount").value(0))
                .andExpect(jsonPath("$.setCount").value(0));
    }

    @Test
    @DisplayName("normalised on write: order from position, ids kept or minted, unknown kinds defaulted, junk nulled")
    void normalisation() throws Exception {
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"  Upper A  ","notes":"  ",
                 "exercises":[
                   {"id":"keep-me","exerciseId":"%s","orderIndex":9,"groupId":"g1",
                    "sets":[{"loadKind":"percent_1rm","loadValue":70,"effortKind":"reps","effortValue":8,
                             "restSeconds":90.4,"tempo":"","notes":" top set "},
                            {"loadKind":"kettlebell","loadValue":"heavy","effortKind":"forever","effortValue":8}],
                    "alternatives":[{"exerciseId":"%s","sets":[{"effortKind":"reps","effortValue":10}]},
                                    {"exerciseId":"","sets":[{"effortValue":5}]},
                                    {"exerciseId":"%s","sets":[]}]},
                   {"exerciseId":"%s","orderIndex":0,"sets":[{"effortValue":12}]}],
                 "dividers":[{"label":"Main","beforeIndex":0.6},{"label":"","beforeIndex":1},
                             {"label":"Finisher","beforeIndex":40},{"label":"Warm-up","beforeIndex":-3}]}
                """.formatted(bench, row, row, row)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Upper A"))
                .andExpect(jsonPath("$.notes").doesNotExist())
                .andExpect(jsonPath("$.exercises[0].id").value("keep-me"))
                .andExpect(jsonPath("$.exercises[0].orderIndex").value(0))
                .andExpect(jsonPath("$.exercises[1].orderIndex").value(1))
                .andExpect(jsonPath("$.exercises[1].id").isString())
                .andExpect(jsonPath("$.exercises[0].sets[0].restSeconds").value(90))
                .andExpect(jsonPath("$.exercises[0].sets[0].tempo").doesNotExist())
                .andExpect(jsonPath("$.exercises[0].sets[0].notes").value("top set"))
                .andExpect(jsonPath("$.exercises[0].sets[1].loadKind").value("weight"))
                .andExpect(jsonPath("$.exercises[0].sets[1].loadValue").doesNotExist())
                .andExpect(jsonPath("$.exercises[0].sets[1].effortKind").value("reps"))
                // Two of the three alternatives had nothing to do instead, and are gone.
                .andExpect(jsonPath("$.exercises[0].alternatives.length()").value(1))
                // Rounded, clamped to [0, 1] — a divider needs a row to sit in front
                // of, so with 2 exercises the ceiling is the LAST one (index 1), not
                // past it — blank dropped, sorted.
                .andExpect(jsonPath("$.dividers[*].label", contains("Warm-up", "Main", "Finisher")))
                .andExpect(jsonPath("$.dividers[*].beforeIndex", contains(0, 1, 1)))
                .andExpect(jsonPath("$.exerciseCount").value(2))
                .andExpect(jsonPath("$.setCount").value(3));
    }

    @Test
    @DisplayName("a movement outside the caller's library is a 400 naming where it was, and nothing is stored")
    void libraryIsChecked() throws Exception {
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"x","exercises":[{"exerciseId":"%s","sets":[]},
                  {"exerciseId":"%s","alternatives":[{"exerciseId":"%s","sets":[{"effortValue":5}]}]}]}
                """.formatted(bench, row, theirs)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value(containsString("exercises[1].alternatives[0].exerciseId")));
        mvc.perform(get("/v1/workout-templates")).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("PUT replaces the fields it is sent, whole, and leaves the rest; headings clamp to what is stored")
    void putReplacesPresentFields() throws Exception {
        String id = create("""
                {"name":"Upper A","notes":"Keep it snappy",
                 "exercises":[{"exerciseId":"%s","sets":[{"effortValue":8}]},{"exerciseId":"%s","sets":[]}]}
                """.formatted(bench, row));

        mvc.perform(put("/v1/workout-templates/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dividers\":[{\"label\":\"Accessories\",\"beforeIndex\":9}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Upper A"))
                .andExpect(jsonPath("$.notes").value("Keep it snappy"))
                .andExpect(jsonPath("$.exerciseCount").value(2))
                .andExpect(jsonPath("$.dividers[0].beforeIndex").value(1));

        mvc.perform(put("/v1/workout-templates/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exercises\":[{\"exerciseId\":\"" + row + "\",\"sets\":[{},{}]}]}"))
                .andExpect(jsonPath("$.exercises.length()").value(1))
                .andExpect(jsonPath("$.setCount").value(2))
                .andExpect(jsonPath("$.dividers[0].label").value("Accessories"));
    }

    @Test
    @DisplayName("delete is soft and final for the reader; another trainer's workout is a 404")
    void deleteAndOwnership() throws Exception {
        String id = create("{\"name\":\"Legs\"}");
        signedInAs(other);
        mvc.perform(get("/v1/workout-templates/" + id)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORKOUT_NOT_FOUND"));
        mvc.perform(delete("/v1/workout-templates/" + id)).andExpect(status().isNotFound());
        signedInAs(me);

        mvc.perform(delete("/v1/workout-templates/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/workout-templates/" + id)).andExpect(status().isNotFound());
        org.junit.jupiter.api.Assertions.assertNotNull(jdbc.queryForObject(
                "SELECT deleted_at FROM workout WHERE id = :id::uuid", Map.of("id", id), Object.class));
    }

    private String create(String body) throws Exception {
        String json = mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private UUID exercise(String name, UUID owner) {
        var id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("name", name);
        if (owner == null) {
            jdbc.update("INSERT INTO exercise (id, name, origin, source_id) VALUES (:id::uuid, :name, 'inclineyou', :id)", p);
        } else {
            p.put("tid", owner.toString());
            jdbc.update("INSERT INTO exercise (id, name, origin, trainer_id) VALUES (:id::uuid, :name, 'trainer', :tid::uuid)", p);
        }
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
                        trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
