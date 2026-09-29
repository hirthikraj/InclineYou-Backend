package com.inclineyou.inclineyou_backend.core.template;

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
 * V11 · the certified shelf, against the two sample programs V11 ships.
 *
 * <ol>
 *   <li>the literal paths win over `/{id}` — the shelf used to answer 400;</li>
 *   <li>the blueprint's catalogue source ids resolve to this database's
 *       exercise ids, and the named workouts come with it;</li>
 *   <li>copying makes the trainer's OWN template with frozen provenance, bumps
 *       `usedCount`, and `mine` then reports it — stale once the original moves;</li>
 *   <li>the original cannot be edited, deleted or assigned.</li>
 * </ol>
 */
@SpringBootTest
@Transactional
class CertifiedProgramsTest {

    private static final String FULL_BODY = "7c1f0a52-3b8e-4d6a-9a51-0e2b6f1c0a01";
    private static final String UPPER_LOWER = "7c1f0a52-3b8e-4d6a-9a51-0e2b6f1c0a02";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001101', 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of());
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = '+919100001101'", Map.of(), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, 'C')
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId));
        owner = UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        owner.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("the shelf lists both samples, beginner first, as samples, with no blueprint on the list")
    void shelf() throws Exception {
        mvc.perform(get("/v1/templates/certified"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(FULL_BODY))
                .andExpect(jsonPath("$[0].source").value("certified"))
                .andExpect(jsonPath("$[0].exercises.length()").value(0))
                .andExpect(jsonPath("$[0].exerciseCount").value(15))
                .andExpect(jsonPath("$[0].certified.level").value("beginner"))
                .andExpect(jsonPath("$[0].certified.equipment").value("dumbbells"))
                .andExpect(jsonPath("$[0].certified.sample").value(true))
                .andExpect(jsonPath("$[0].certified.reviewedAt").doesNotExist())
                .andExpect(jsonPath("$[0].mine").doesNotExist())
                .andExpect(jsonPath("$[1].id").value(UPPER_LOWER))
                .andExpect(jsonPath("$[1].exerciseCount").value(21))
                .andExpect(jsonPath("$[1].assignedCount").value(0));

        // …and never on the trainer's own shelf.
        mvc.perform(get("/v1/templates"))
                .andExpect(jsonPath("$[*].id", not(hasItem(FULL_BODY))));
    }

    @Test
    @DisplayName("the preview resolves each movement to a library row and keeps the named workouts")
    void preview() throws Exception {
        String benchId = jdbc.queryForObject(
                "SELECT id::text FROM exercise WHERE source_id = 'gymvisual-0025'", Map.of(), String.class);
        mvc.perform(get("/v1/templates/certified/" + UPPER_LOWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises.length()").value(21))
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(benchId))
                .andExpect(jsonPath("$.exercises[0].workoutName").value("Upper A"))
                .andExpect(jsonPath("$.dayLabels.2").value("Lower A"))
                .andExpect(jsonPath("$.trainingDays.length()").value(4))
                .andExpect(jsonPath("$.weeks").value(8));

        mvc.perform(get("/v1/templates/certified/" + UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CERTIFIED_NOT_FOUND"));
    }

    @Test
    @DisplayName("copying makes the trainer's own template, bumps usedCount, and `mine` goes stale when the original moves")
    void copy() throws Exception {
        int usedBefore = used(FULL_BODY);
        String json = mvc.perform(post("/v1/templates/certified/" + FULL_BODY + "/copy"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Full-body foundations"))
                .andExpect(jsonPath("$.source").value("own"))
                .andExpect(jsonPath("$.copiedFrom.id").value(FULL_BODY))
                .andExpect(jsonPath("$.copiedFrom.name").value("Full-body foundations"))
                .andExpect(jsonPath("$.exercises.length()").value(15))
                .andExpect(jsonPath("$.weeks").value(6))
                .andReturn().getResponse().getContentAsString();
        String copyId = com.jayway.jsonpath.JsonPath.read(json, "$.id");
        assertEquals(usedBefore + 1, used(FULL_BODY));

        mvc.perform(get("/v1/templates/certified/" + FULL_BODY))
                .andExpect(jsonPath("$.mine.id").value(copyId))
                .andExpect(jsonPath("$.mine.stale").value(false));

        // The trainer's copy is theirs: editable and assignable like any template.
        mvc.perform(put("/v1/templates/" + copyId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Meera's foundations\"}"))
                .andExpect(status().isOk());

        // A revision of the original is not propagated — it only marks the copy stale.
        jdbc.update("UPDATE certified_template SET updated_at = now() + interval '1 minute' WHERE id = :id::uuid",
                Map.of("id", FULL_BODY));
        mvc.perform(get("/v1/templates/certified"))
                .andExpect(jsonPath("$[0].mine.stale").value(true));
        mvc.perform(get("/v1/templates/" + copyId))
                .andExpect(jsonPath("$.name").value("Meera's foundations"))
                .andExpect(jsonPath("$.exercises.length()").value(15));
    }

    @Test
    @DisplayName("a name on the copy request is used verbatim")
    void copyWithName() throws Exception {
        mvc.perform(post("/v1/templates/certified/" + UPPER_LOWER + "/copy")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ravi's 4-day\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Ravi's 4-day"))
                .andExpect(jsonPath("$.exercises[0].workoutName").value("Upper A"));
    }

    @Test
    @DisplayName("the original cannot be edited, deleted or assigned — each refusal is typed")
    void originalIsReadOnly() throws Exception {
        mvc.perform(put("/v1/templates/" + FULL_BODY).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CERTIFIED_READ_ONLY"));
        mvc.perform(delete("/v1/templates/" + FULL_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CERTIFIED_READ_ONLY"));
        mvc.perform(post("/v1/templates/" + FULL_BODY + "/apply").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CERTIFIED_COPY_FIRST"));
    }

    private int used(String id) {
        return jdbc.queryForObject("SELECT used_count FROM certified_template WHERE id = :id::uuid",
                Map.of("id", id), Integer.class);
    }
}
