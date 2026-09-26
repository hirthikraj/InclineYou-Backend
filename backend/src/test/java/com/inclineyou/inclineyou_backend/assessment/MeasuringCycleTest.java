package com.inclineyou.inclineyou_backend.assessment;

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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What is left of V5 once its sitting table was removed (23 Sep 2026): the
 * measuring cadence on the client — and, since V22 dropped `body_metric`, the
 * client's reading history as read out of their completed assessments.
 */
@SpringBootTest
@Transactional
class MeasuringCycleTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;
    private UUID other;
    private UUID client;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000040");
        other = trainer("9100000041");
        client = client(owner, "Meera");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── the cadence ───────────────────────────────────────────────────────── */

    @Test
    @DisplayName("setting a cadence with no date seeds one")
    void cadenceSeedsADate() throws Exception {
        mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentIntervalDays\":42}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentIntervalDays").value(42))
                .andExpect(jsonPath("$.nextAssessmentOn").value(LocalDate.now(IST).plusDays(42).toString()));
    }

    @Test
    @DisplayName("zero takes the client off the cycle and takes the date with it")
    void zeroClearsTheCycle() throws Exception {
        jdbc.update("UPDATE client SET assessment_interval_days = 28, next_assessment_on = CURRENT_DATE WHERE id = :c::uuid",
                Map.of("c", client.toString()));
        mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentIntervalDays\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentIntervalDays").doesNotExist())
                .andExpect(jsonPath("$.nextAssessmentOn").doesNotExist());
    }

    @Test
    @DisplayName("a client's sheet refuses an id the catalogue does not have")
    void clientSheetIsValidated() throws Exception {
        mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentMetrics\":[\"waist\",\"neck\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ASSESSMENT_METRIC_UNKNOWN"));
    }

    @Test
    @DisplayName("a client's sheet comes back in catalogue order, however it was sent")
    void clientSheetIsOrdered() throws Exception {
        mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentMetrics\":[\"waist\",\"weight\",\"waist\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentMetrics.length()").value(2))
                .andExpect(jsonPath("$.assessmentMetrics[0]").value("weight"))
                .andExpect(jsonPath("$.assessmentMetrics[1]").value("waist"));
    }

    /* ── the reading history, out of assessments (V22) ─────────────────────── */

    @Test
    @DisplayName("readings come from completed assessments only — V5's six ids, newest first, in the catalogue's unit")
    void historyReadsCompletedAssessments() throws Exception {
        UUID march = assessment("2026-03-01T06:00:00Z", false,
                "[{\"key\":\"weight\",\"value\":80.5},{\"key\":\"neck\",\"value\":38}]");
        UUID april = assessment("2026-04-01T06:00:00Z", false,
                "[{\"key\":\"weight\",\"value\":78},{\"key\":\"waist\",\"value\":88}]");
        assessment(null, false, "[{\"key\":\"weight\",\"value\":70}]");              // not returned yet
        assessment("2026-05-01T06:00:00Z", true, "[{\"key\":\"weight\",\"value\":60}]"); // deleted

        mvc.perform(get("/v1/clients/%s/body-metrics".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].id").value(april.toString()))
                .andExpect(jsonPath("$[0].metricType").value("waist"))
                .andExpect(jsonPath("$[0].unit").value("cm"))
                .andExpect(jsonPath("$[1].metricType").value("weight"))
                .andExpect(jsonPath("$[1].value").value(78))
                .andExpect(jsonPath("$[1].unit").value("kg"))
                .andExpect(jsonPath("$[2].id").value(march.toString()))
                .andExpect(jsonPath("$[2].value").value(80.5));
    }

    @Test
    @DisplayName("there is no way to write a loose reading any more")
    void noLooseReadings() throws Exception {
        mvc.perform(post("/v1/clients/%s/body-metrics".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"metricType\":\"weight\",\"value\":74.2,\"unit\":\"kg\",\"recordedAt\":0}"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    @DisplayName("somebody else's client is a 404 at the client")
    void otherTrainersClientIs404() throws Exception {
        var theirs = client(other, "Rajesh");
        mvc.perform(get("/v1/clients/%s/body-metrics".formatted(theirs)))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID assessment(String completedAt, boolean deleted, String readings) {
        var id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("c", client.toString());
        p.put("t", owner.toString());
        p.put("r", readings);
        p.put("deleted", deleted);
        p.put("done", completedAt);
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, name, due_at, sent_at, completed_at,
                                        entered_by, readings, deleted_at)
                VALUES (:id::uuid, :c::uuid, :t::uuid, 'Monthly', now(), now(),
                        CAST(:done AS timestamptz), CASE WHEN CAST(:done AS text) IS NULL THEN NULL ELSE 'trainer' END,
                        CAST(:r AS jsonb), CASE WHEN :deleted THEN now() END)
                """, p);
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name) VALUES (:id::uuid, :tid::uuid, :name)",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone", Map.of("phone", phone), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
