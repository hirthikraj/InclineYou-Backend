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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;

/**
 * Standalone workouts (api-contract 1.1, Programs L4 and A7). The CRUD is ordinary; what is pinned is the v1 contract:
 * a list is {@code {items}}, a save is the WHOLE workout (name and an exercise list are required, an empty list clears
 * it), the id is the caller's and a retry is safe, a PUT is conditional (428 without If-Match, 412 when stale), the tree
 * is normalised (ids minted, order from position, dividers stored as the section of the exercise they sit in front of),
 * and a movement outside the caller's library is a 400 that says where.
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
    @DisplayName("an empty account is {items: []}; name and an exercise list are required; a retried id answers 200, not a second row")
    void emptyAndRequired() throws Exception {
        mvc.perform(get("/v1/workout-templates")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
                .andExpect(status().isBadRequest());

        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"name\":\"  Legs  \",\"exercises\":[]}";
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("Legs"))
                .andExpect(jsonPath("$.exerciseCount").value(0))
                .andExpect(jsonPath("$.setCount").value(0));
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(get("/v1/workout-templates")).andExpect(jsonPath("$.items.length()").value(1));

        // The same id under another trainer is somebody else's row, and is told so.
        signedInAs(other);
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("normalised on write: order from position, ids minted, blanks nulled, alternatives kept, dividers clamped onto a row")
    void normalisation() throws Exception {
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"  Upper A  ","notes":"  ",
                 "exercises":[
                   {"id":"%s","exerciseId":"%s","position":9,"groupId":null,
                    "sets":[{"loadKind":"percent_1rm","loadValue":70,"effortKind":"reps","effortValue":8,
                             "restSeconds":90,"tempo":"","notes":" top set "},
                            {"effortValue":6}],
                    "alternatives":[{"exerciseId":"%s","sets":[{"effortValue":10}]}]},
                   {"exerciseId":"%s","position":0,"sets":[{"effortValue":12}]}],
                 "dividers":[{"position":0,"label":"Main"},{"position":40,"label":"Finisher"},{"position":0,"label":"Warm-up"}]}
                """.formatted(UUID.randomUUID(), bench, row, row)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Upper A"))
                .andExpect(jsonPath("$.notes").doesNotExist())
                // position orders the list; the stored positions are then 0, 1.
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(row.toString()))
                .andExpect(jsonPath("$.exercises[0].position").value(0))
                .andExpect(jsonPath("$.exercises[1].exerciseId").value(bench.toString()))
                .andExpect(jsonPath("$.exercises[1].position").value(1))
                .andExpect(jsonPath("$.exercises[1].id").isString())
                .andExpect(jsonPath("$.exercises[1].sets[0].loadKind").value("percent_1rm"))
                .andExpect(jsonPath("$.exercises[1].sets[0].restSeconds").value(90))
                .andExpect(jsonPath("$.exercises[1].sets[0].tempo").doesNotExist())
                .andExpect(jsonPath("$.exercises[1].sets[0].notes").value("top set"))
                // A set with nothing said is a weight x reps set.
                .andExpect(jsonPath("$.exercises[1].sets[1].loadKind").value("weight"))
                .andExpect(jsonPath("$.exercises[1].sets[1].effortKind").value("reps"))
                .andExpect(jsonPath("$.exercises[1].alternatives.length()").value(1))
                // A divider needs a row to sit in front of: past the last clamps to the last; two in front of one share it.
                .andExpect(jsonPath("$.dividers.length()").value(3))
                .andExpect(jsonPath("$.dividers[?(@.label=='Finisher')].position").value(1))
                .andExpect(jsonPath("$.dividers[?(@.label=='Main')].position").value(0))
                .andExpect(jsonPath("$.exerciseCount").value(2))
                .andExpect(jsonPath("$.setCount").value(3));
    }

    @Test
    @DisplayName("an unknown kind or a malformed set is a 400 and nothing is stored")
    void badSets() throws Exception {
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"x","exercises":[{"exerciseId":"%s","sets":[{"loadKind":"kettlebell","effortValue":8}]}]}
                """.formatted(bench))).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"x","exercises":[{"exerciseId":"%s","sets":[{"loadKind":"bodyweight","loadValue":20,"effortValue":8}]}]}
                """.formatted(bench))).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/workout-templates")).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("a movement outside the caller's library is a 400 naming it, and nothing is stored")
    void libraryIsChecked() throws Exception {
        mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"x","exercises":[{"exerciseId":"%s","sets":[]},{"exerciseId":"%s","sets":[]}]}
                """.formatted(bench, theirs)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value(containsString(theirs.toString())));
        mvc.perform(get("/v1/workout-templates")).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("PUT is the whole workout and conditional: 428 without If-Match, 412 when stale, and a wrong version never matches")
    void putIsWholeAndConditional() throws Exception {
        MvcResult made = mvc.perform(post("/v1/workout-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Upper A","notes":"Keep it snappy",
                 "exercises":[{"exerciseId":"%s","sets":[{"effortValue":8}]},{"exerciseId":"%s","sets":[]}]}
                """.formatted(bench, row))).andExpect(status().isCreated()).andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(made.getResponse().getContentAsString(), "$.id");
        String etag = made.getResponse().getHeader("ETag");
        String whole = "{\"name\":\"Upper B\",\"exercises\":[{\"exerciseId\":\"" + row + "\",\"sets\":[{},{}]}],"
                + "\"dividers\":[{\"position\":0,\"label\":\"Accessories\"}]}";

        mvc.perform(put("/v1/workout-templates/" + id).contentType(MediaType.APPLICATION_JSON).content(whole))
                .andExpect(status().isPreconditionRequired());
        mvc.perform(put("/v1/workout-templates/" + id).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON).content(whole))
                .andExpect(status().isPreconditionFailed());
        mvc.perform(put("/v1/workout-templates/" + id).header("If-Match", etag).contentType(MediaType.APPLICATION_JSON).content(whole))
                .andExpect(status().isOk())
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.name").value("Upper B"))
                .andExpect(jsonPath("$.notes").doesNotExist())                       // whole: what was not sent is cleared
                .andExpect(jsonPath("$.exercises.length()").value(1))
                .andExpect(jsonPath("$.setCount").value(2))
                .andExpect(jsonPath("$.dividers[0].label").value("Accessories"));
        // (Whether a save moves the version is not asserted here: the version is updated_at, a trigger sets it to now(),
        // and inside this test's single transaction now() does not move.)
    }

    @Test
    @DisplayName("delete is soft and final for the reader, and again is 204 again; another trainer's workout is a 404")
    void deleteAndOwnership() throws Exception {
        String id = create("{\"name\":\"Legs\",\"exercises\":[]}");
        signedInAs(other);
        mvc.perform(get("/v1/workout-templates/" + id)).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/workout-templates/" + id)).andExpect(status().isNotFound());
        signedInAs(me);

        mvc.perform(delete("/v1/workout-templates/" + id)).andExpect(status().isNoContent());
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
