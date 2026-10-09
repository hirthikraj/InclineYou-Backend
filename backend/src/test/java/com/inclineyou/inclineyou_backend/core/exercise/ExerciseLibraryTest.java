package com.inclineyou.inclineyou_backend.core.exercise;

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
import static org.hamcrest.Matchers.hasItem;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The exercise library on the v1 wire (api-contract 1.1, Programs L6 and A9–A10): the global, text-only catalogue plus
 * the trainer's own custom exercises. What is pinned is who can see and write what (a custom is the owner's alone, a
 * global is never writable), the safe-retry create, the name rule, the sparse PATCH, the soft delete that frees the
 * name, the typeahead page and the facets, and {@code logType} on the wire.
 *
 * <p>Written against whatever catalogue the test database holds: every name carries a {@code Zqx} marker so the search
 * checks cannot be fooled by seeded rows, and the facet checks are DELTAS around rows this test adds.
 *
 * <p>Gone since the pre-v1 library, deliberately: {@code ?ids=} (a plan, a session and a set history now carry the names
 * they need), {@code ?source=}, {@code /categories} (the facets are {@code /meta}), and a draft shelf — a draft is a
 * custom whose {@code status} says so, and it is found like any other of the owner's.
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
    @DisplayName("create: 201 with the whole row, a retried id is 200, another trainer's id is a 409, a taken name is a 409")
    void createRules() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"name\":\"  Zqx landmine press  \",\"bodyPart\":\"shoulders\",\"target\":\"delts\","
                + "\"description\":\"Press it.\",\"formCues\":[\"Brace\",\"Drive\"]}";
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("Zqx landmine press"))
                .andExpect(jsonPath("$.isCustom").value(true))
                .andExpect(jsonPath("$.status").value("published"))
                .andExpect(jsonPath("$.logType").value("weight_reps"))          // unstated is weight_reps, like the sync push
                .andExpect(jsonPath("$.formCues.length()").value(2))
                .andExpect(jsonPath("$.secondaryTargets").isArray());
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        // A different id, same name: the name is the trainer's own and is taken.
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"zqx LANDMINE press\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXERCISE_NAME_TAKEN"));
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Zqx x\",\"logType\":\"minutes\"}"))
                .andExpect(status().isBadRequest());   // V9 widened the set to six; anything else is still refused

        // Another trainer may use the same NAME (names are per trainer) but not the same id.
        signedInAs(other);
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body.replace(id.toString(), UUID.randomUUID().toString())))
                .andExpect(status().isCreated());
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("all six log types are accepted on create and patch, and a seventh is refused")
    void sixLogTypes() throws Exception {
        for (String lt : new String[] {"weight_reps", "reps", "time", "distance", "weight_time", "weight_distance"}) {
            String id = create("{\"name\":\"Zqx " + lt + "\",\"logType\":\"" + lt + "\"}");
            mvc.perform(get("/v1/exercises/" + id)).andExpect(jsonPath("$.logType").value(lt));
        }
        String id = create("{\"name\":\"Zqx patched\"}");
        mvc.perform(patch("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"logType\":\"weight_distance\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/v1/exercises/" + id)).andExpect(jsonPath("$.logType").value("weight_distance"));
        mvc.perform(patch("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"logType\":\"seconds\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a custom can be reps-only, and a seeded row with no logType comes back null, not guessed at")
    void logType() throws Exception {
        String chin = create("{\"name\":\"Zqx chin-up\",\"logType\":\"reps\"}");
        mvc.perform(get("/v1/exercises/" + chin)).andExpect(jsonPath("$.logType").value("reps"));
        mvc.perform(get("/v1/exercises").param("q", "Zqx chin")).andExpect(jsonPath("$.items[0].logType").value("reps"));

        UUID seeded = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, source_id) VALUES (:id::uuid, 'Zqx seeded lift', 'inclineyou', :src)",
                Map.of("id", seeded.toString(), "src", "test-" + seeded));
        mvc.perform(get("/v1/exercises/" + seeded)).andExpect(status().isOk())
                .andExpect(jsonPath("$.isCustom").value(false))
                .andExpect(jsonPath("$.logType").doesNotExist());
    }

    @Test
    @DisplayName("search: customs are the owner's alone, `custom` narrows, `includeTotal` counts, a list row carries no description")
    void search() throws Exception {
        create("{\"name\":\"Zqxfly cable\",\"description\":\"Squeeze.\"}");
        signedInAs(other);
        create("{\"name\":\"Zqxfly crossover\"}");
        signedInAs(owner);

        mvc.perform(get("/v1/exercises").param("q", "Zqxfly").param("includeTotal", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Zqxfly cable"))
                .andExpect(jsonPath("$.items[0].description").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(get("/v1/exercises").param("q", "Zqxfly").param("custom", "false")).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/v1/exercises").param("q", "Zqxfly").param("custom", "true")).andExpect(jsonPath("$.items.length()").value(1));
        // Without includeTotal there is no total at all.
        mvc.perform(get("/v1/exercises").param("q", "Zqxfly")).andExpect(jsonPath("$.total").doesNotExist());
    }

    @Test
    @DisplayName("search pages by keyset: a limit of one walks the matches once each, and a foreign cursor is a 400")
    void paging() throws Exception {
        create("{\"name\":\"Zqxpage a\"}");
        create("{\"name\":\"Zqxpage b\"}");
        create("{\"name\":\"Zqxpage c\"}");
        var names = new java.util.ArrayList<String>();
        String cursor = null;
        for (int i = 0; i < 5; i++) {
            var req = get("/v1/exercises").param("q", "Zqxpage").param("limit", "1");
            if (cursor != null) req = req.param("cursor", cursor);
            String json = mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            names.add(com.jayway.jsonpath.JsonPath.read(json, "$.items[0].name"));
            cursor = com.jayway.jsonpath.JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(3, names.size());
        assertEquals(3, new java.util.HashSet<>(names).size());
        mvc.perform(get("/v1/exercises").param("q", "Zqxpage").param("cursor", "bm9wZQ")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a draft is the owner's own custom with status draft; anything but published|draft is a 400")
    void drafts() throws Exception {
        String id = create("{\"name\":\"Zqx draft press\",\"status\":\"draft\"}");
        mvc.perform(get("/v1/exercises/" + id)).andExpect(jsonPath("$.status").value("draft"));
        mvc.perform(get("/v1/exercises").param("q", "Zqx draft")).andExpect(jsonPath("$.items[0].status").value("draft"));
        mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Zqx d2\",\"status\":\"Draft \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("another trainer's private movement is a 404, and so is an unknown id")
    void notVisibleIs404() throws Exception {
        signedInAs(other);
        String theirs = create("{\"name\":\"Zqx their secret lift\"}");
        signedInAs(owner);
        mvc.perform(get("/v1/exercises/" + theirs)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/exercises/" + UUID.randomUUID())).andExpect(status().isNotFound());
        mvc.perform(patch("/v1/exercises/" + theirs).contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"x\"}")).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/exercises/" + theirs)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("PATCH changes only what is sent; an empty body, a taken name and a wrong version are refused; a global is not writable")
    void patchRules() throws Exception {
        String a = create("{\"name\":\"Zqx patch a\",\"target\":\"quads\",\"bodyPart\":\"legs\"}");
        create("{\"name\":\"Zqx patch b\"}");
        mvc.perform(patch("/v1/exercises/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"glutes\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target").value("glutes"))
                .andExpect(jsonPath("$.bodyPart").value("legs"))
                .andExpect(jsonPath("$.name").value("Zqx patch a"));
        // null clears, absent leaves.
        mvc.perform(patch("/v1/exercises/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"target\":null}"))
                .andExpect(jsonPath("$.target").doesNotExist()).andExpect(jsonPath("$.bodyPart").value("legs"));
        mvc.perform(patch("/v1/exercises/" + a).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/v1/exercises/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Zqx patch b\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXERCISE_NAME_TAKEN"));
        mvc.perform(patch("/v1/exercises/" + a).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"x\"}"))
                .andExpect(status().isPreconditionFailed());

        UUID global = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, source_id) VALUES (:id::uuid, 'Zqx global', 'inclineyou', :src)",
                Map.of("id", global.toString(), "src", "test-" + global));
        mvc.perform(patch("/v1/exercises/" + global).contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"x\"}")).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/exercises/" + global)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("delete is soft: it leaves search and frees the name, and again is 204 again")
    void deleteFreesTheName() throws Exception {
        String id = create("{\"name\":\"Zqx retire me\"}");
        mvc.perform(delete("/v1/exercises/" + id)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/exercises/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/exercises").param("q", "Zqx retire")).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/v1/exercises/" + id)).andExpect(status().isNotFound());
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM exercise WHERE id = :id::uuid", Map.of("id", id), Object.class));
        create("{\"name\":\"Zqx retire me\"}");                                   // the name is free again
    }

    @Test
    @DisplayName("equipment is a lookup: the text resolves to a row, meta groups by category, equipmentKey filters, an unknown string stays unresolved")
    void equipmentLookup() throws Exception {
        String known = create("{\"name\":\"Zqx smith thing\",\"equipment\":\"smith machine\"}");
        String unknown = create("{\"name\":\"Zqx mystery thing\",\"equipment\":\"zqx mystery kit\"}");
        assertEquals("smith_machine", jdbc.queryForObject(
                "SELECT q.key FROM exercise e JOIN equipment q ON q.id = e.equipment_id WHERE e.id = :id::uuid", Map.of("id", known), String.class));
        assertNull(jdbc.queryForObject("SELECT equipment_id FROM exercise WHERE id = :id::uuid", Map.of("id", unknown), Object.class));

        // Changing only the text re-resolves it; the old string column is still what the API returns.
        mvc.perform(patch("/v1/exercises/" + known).contentType(MediaType.APPLICATION_JSON).content("{\"equipment\":\"kettlebell\"}")).andExpect(status().isOk());
        assertEquals("kettlebell", jdbc.queryForObject(
                "SELECT q.key FROM exercise e JOIN equipment q ON q.id = e.equipment_id WHERE e.id = :id::uuid", Map.of("id", known), String.class));

        mvc.perform(get("/v1/exercises/meta")).andExpect(status().isOk())
                .andExpect(jsonPath("$.equipmentGroups[?(@.category == 'free weights')].items[?(@.key == 'kettlebell')].count").isNotEmpty())
                .andExpect(jsonPath("$.equipment").isArray());                    // the old facet is still there
        mvc.perform(get("/v1/exercises").param("q", "Zqx").param("equipmentKey", "kettlebell"))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].name").value("Zqx smith thing"));
        mvc.perform(get("/v1/exercises").param("q", "Zqx").param("equipmentKey", "no_such_kit"))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("meta counts the caller's library: own rows in, other trainers' rows out, and a repeat is a 304")
    void metaCountsTheCallersLibrary() throws Exception {
        int before = metaTotal();
        create("{\"name\":\"Zqx meta one\",\"bodyPart\":\"zqxparts\",\"equipment\":\"zqxbar\"}");
        create("{\"name\":\"Zqx meta two\",\"bodyPart\":\"zqxparts\"}");
        signedInAs(other);
        create("{\"name\":\"Zqx meta theirs\",\"bodyPart\":\"zqxparts\"}");
        signedInAs(owner);

        assertEquals(before + 2, metaTotal());
        MvcResult r = mvc.perform(get("/v1/exercises/meta")).andExpect(status().isOk())
                .andExpect(jsonPath("$.bodyParts[?(@.id == 'zqxparts')].count").value(hasItem(2)))
                .andExpect(jsonPath("$.equipment[?(@.id == 'zqxbar')].count").value(hasItem(1)))
                .andExpect(jsonPath("$.levels").isArray())
                .andReturn();
        mvc.perform(get("/v1/exercises/meta").header("If-None-Match", r.getResponse().getHeader("ETag")))
                .andExpect(status().isNotModified());
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    private int metaTotal() throws Exception {
        String body = mvc.perform(get("/v1/exercises/meta")).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.total");
    }

    private String create(String body) throws Exception {
        String json = mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
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
