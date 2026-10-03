package com.inclineyou.inclineyou_backend.core.assessment;

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
 * A client's body readings, read out of the assessments they came back on ({@code GET /v1/clients/{id}/readings}).
 * A body is measured in an assessment and nowhere else (24 Sep 2026): there is no loose weigh-in, and a correction is an
 * edit to the assessment. {@code MetricReadings} is the one reader, so the client file, the report and the portal cannot
 * disagree about which readings count.
 *
 * <p>This was {@code MeasuringCycleTest}, which also pinned the per-client cadence ({@code assessment_interval_days},
 * {@code next_assessment_on}, {@code assessment_metrics}). Those columns are gone: a cycle is an
 * {@code assessment_schedule} row, and {@code AssessmentApiTest} pins it (books the first assessment, finishing moves it
 * on from the day it was done, ending keeps one somebody started).
 */
@SpringBootTest
@Transactional
class ClientReadingsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;
    private UUID other;
    private UUID client;
    private UUID template;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000040");
        other = trainer("9100000041");
        client = client(owner, "Meera");
        template = template(owner);
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("readings come from completed assessments only — V5's six ids, oldest first, in the catalogue's label and unit")
    void historyReadsCompletedAssessments() throws Exception {
        UUID march = assessment("2026-03-01T06:00:00Z", false,
                "{\"weight\":80.5,\"neck\":38}");
        UUID april = assessment("2026-04-01T06:00:00Z", false,
                "{\"weight\":78,\"waist\":88}");
        assessment(null, false, "{\"weight\":70}");                            // not returned yet
        assessment("2026-05-01T06:00:00Z", true, "{\"weight\":60}");          // deleted

        mvc.perform(get("/v1/clients/%s/readings".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))                 // neck is not one of the six
                .andExpect(jsonPath("$.items[0].assessmentId").value(march.toString()))
                .andExpect(jsonPath("$.items[0].key").value("weight"))
                .andExpect(jsonPath("$.items[0].value").value(80.5))
                .andExpect(jsonPath("$.items[0].unit").value("kg"))
                .andExpect(jsonPath("$.items[0].label").isString())
                .andExpect(jsonPath("$.items[0].at").isNumber())
                .andExpect(jsonPath("$.items[1].assessmentId").value(april.toString()))
                .andExpect(jsonPath("$.items[1].key").value("waist"))
                .andExpect(jsonPath("$.items[1].unit").value("cm"))
                .andExpect(jsonPath("$.items[2].key").value("weight"))
                .andExpect(jsonPath("$.items[2].value").value(78));
    }

    @Test
    @DisplayName("key narrows to the measurements named; one the catalogue does not have is a 400")
    void keyFilter() throws Exception {
        assessment("2026-04-01T06:00:00Z", false, "{\"weight\":78,\"waist\":88}");
        mvc.perform(get("/v1/clients/%s/readings".formatted(client)).param("key", "waist"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].key").value("waist"));
        mvc.perform(get("/v1/clients/%s/readings".formatted(client)).param("key", "weight,waist"))
                .andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/v1/clients/%s/readings".formatted(client)).param("key", "neck"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("there is no way to write a loose reading any more")
    void noLooseReadings() throws Exception {
        for (var req : new org.springframework.test.web.servlet.RequestBuilder[]{
                post("/v1/clients/%s/body-metrics".formatted(client)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"metricType\":\"weight\",\"value\":74.2,\"unit\":\"kg\",\"recordedAt\":0}"),
                post("/v1/clients/%s/readings".formatted(client)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"weight\",\"value\":74.2}")}) {
            int status = mvc.perform(req).andReturn().getResponse().getStatus();
            org.junit.jupiter.api.Assertions.assertTrue(status == 404 || status == 405, "answered " + status);
        }
    }

    @Test
    @DisplayName("somebody else's client is a 404 at the client")
    void otherTrainersClientIs404() throws Exception {
        var theirs = client(other, "Rajesh");
        mvc.perform(get("/v1/clients/%s/readings".formatted(theirs)))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    /** A template is the NOT NULL parent of every assessment; its measurement list is irrelevant to the readings read. */
    private UUID template(UUID trainerId) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (:id::uuid, :t::uuid, 'Monthly')",
                Map.of("id", id.toString(), "t", trainerId.toString()));
        return id;
    }

    /**
     * An assessment whose frozen form measures weight, waist and neck. {@code assessment_readings_valid} refuses a
     * reading whose key the form does not carry, and one that is not a positive number under 100,000.
     */
    private UUID assessment(String completedAt, boolean deleted, String readings) {
        var id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("c", client.toString());
        p.put("t", owner.toString());
        p.put("tpl", template.toString());
        p.put("r", readings);
        p.put("deleted", deleted);
        p.put("done", completedAt);
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, template_id, name, form, due_on, sent_at, completed_at,
                                        entered_by, readings, deleted_at)
                VALUES (:id::uuid, :c::uuid, :t::uuid, :tpl::uuid, 'Monthly',
                        '{"measurements":[{"key":"weight"},{"key":"waist"},{"key":"neck"}],"questions":[]}'::jsonb,
                        current_date, now(), CAST(:done AS timestamptz),
                        CASE WHEN CAST(:done AS text) IS NULL THEN NULL ELSE 'trainer' END,
                        CAST(:r AS jsonb), CASE WHEN :deleted THEN now() END)
                """, p);
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
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
