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
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * V9 · the redesigned library: drafts, `?source=`, a wider `q`, one row by id,
 * and the *By categories* counts.
 *
 * <p>Written against whatever catalogue the test database holds — the category
 * checks are DELTAS around rows this test adds, so the suite does not depend on
 * whether the seeder ran.
 */
@SpringBootTest
@Transactional
class ExerciseLibraryTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;
    private UUID other;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000901");
        other = trainer("9100000902");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a draft is hidden from the default library and from `mine`, and found under `draft` and by id")
    void draftsAreTheirOwnShelf() throws Exception {
        String id = create("{\"name\":\"Zqx landmine press\",\"status\":\"draft\"}", "draft");

        mvc.perform(get("/v1/exercises").param("q", "Zqx landmine"))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/v1/exercises").param("q", "Zqx landmine").param("source", "mine"))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/v1/exercises").param("q", "Zqx landmine").param("source", "draft"))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.exercises[0].status").value("draft"));
        // A draft already named in a plan must still resolve.
        mvc.perform(get("/v1/exercises").param("ids", id))
                .andExpect(jsonPath("$.exercises[0].id").value(id));
    }

    @Test
    @DisplayName("anything but the literal 'draft' is published; `incline` never shows custom rows")
    void publishedByDefault() throws Exception {
        create("{\"name\":\"Zqx cable fly\",\"status\":\"Draft \"}", "published");
        mvc.perform(get("/v1/exercises").param("q", "Zqx cable").param("source", "mine"))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/v1/exercises").param("q", "Zqx cable").param("source", "incline"))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    @DisplayName("q matches target, movement pattern and body part, not only the name")
    void qSearchesTheTaxonomy() throws Exception {
        create("{\"name\":\"Ananya's rehab\",\"target\":\"zqxquads\",\"movementPattern\":\"zqxhinge\"}", "published");
        mvc.perform(get("/v1/exercises").param("q", "zqxquads"))
                .andExpect(jsonPath("$.exercises[0].name").value("Ananya's rehab"));
        mvc.perform(get("/v1/exercises").param("q", "ZQXHINGE"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    @DisplayName("GET /{id} returns the whole row — target kept, cue lists present and empty")
    void oneRow() throws Exception {
        String id = create("{\"name\":\"Zqx goblet squat\",\"target\":\"quads\",\"muscleGroup\":\"Legs\"}", "published");
        mvc.perform(get("/v1/exercises/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target").value("quads"))
                .andExpect(jsonPath("$.status").value("published"))
                .andExpect(jsonPath("$.secondaryTargets").isArray())
                .andExpect(jsonPath("$.secondaryTargets.length()").value(0))
                .andExpect(jsonPath("$.formCues.length()").value(0));
    }

    @Test
    @DisplayName("another trainer's private movement is a 404, and so is an unknown id")
    void notVisibleIs404() throws Exception {
        signedInAs(other);
        String theirs = create("{\"name\":\"Their secret lift\"}", "published");
        signedInAs(owner);
        mvc.perform(get("/v1/exercises/" + theirs)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/exercises/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("categories count the caller's library: own rows in, drafts and other trainers' rows out")
    void categoriesCountTheCallersLibrary() throws Exception {
        var before = categories();

        create("{\"name\":\"Zqx one\",\"muscleGroup\":\"Zqxgroup\"}", "published");
        create("{\"name\":\"Zqx two\"}", "published");                                   // no group
        create("{\"name\":\"Zqx draft\",\"muscleGroup\":\"Zqxgroup\",\"status\":\"draft\"}", "draft");
        signedInAs(other);
        create("{\"name\":\"Zqx theirs\",\"muscleGroup\":\"Zqxgroup\"}", "published");
        signedInAs(owner);

        var after = categories();
        assertEquals(before.total() + 2, after.total(), "one grouped and one ungrouped row of mine");
        assertEquals(before.uncategorised() + 1, after.uncategorised());

        mvc.perform(get("/v1/exercises/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[?(@.muscleGroup == 'Zqxgroup')].count").value(hasItem(1)))
                // A group only a custom row uses goes after the catalogue's, so it is last.
                .andExpect(jsonPath("$.categories[-1].muscleGroup").value("Zqxgroup"))
                .andExpect(jsonPath("$.categories[*].muscleGroup").value(not(hasItem((String) null))));
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    private record Counts(int total, int uncategorised) {}

    private Counts categories() throws Exception {
        String body = mvc.perform(get("/v1/exercises/categories"))
                .andReturn().getResponse().getContentAsString();
        return new Counts(com.jayway.jsonpath.JsonPath.read(body, "$.total"),
                          com.jayway.jsonpath.JsonPath.read(body, "$.uncategorised"));
    }

    private String create(String body, String expectedStatus) throws Exception {
        String json = mvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(expectedStatus))
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone",
                Map.of("phone", phone), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
