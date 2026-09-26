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


import static org.hamcrest.Matchers.contains;

/**
 * Module 11c · a client answering an assessment and logging a weight.
 */
@SpringBootTest
@Transactional
class PortalClientWriteTest {

    private static final String PHONE = "9100001701";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID asha;
    private UUID meera;
    private UUID sent;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        asha = uuid("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, '9100001711', 'Asha')");
        meera = uuid("INSERT INTO client (id, trainer_id, name, phone, membership_status, accepted_at) VALUES (:id::uuid, '" + asha + "', 'Meera', '" + PHONE + "', 'accepted', now())");
        UUID tpl = uuid("""
                INSERT INTO assessment_template (id, trainer_id, name, measurements, questions)
                VALUES (:id::uuid, '%s', 'Monthly', '{"on":true,"keys":["waist","weight"]}', '{"on":true,"items":[
                  {"id":"q_pain","text":"Pain?","kind":"yesno","scale":null,"options":[],"allowMultiple":false,"allowCustom":false},
                  {"id":"q_energy","text":"Energy?","kind":"rating","scale":5,"options":[],"allowMultiple":false,"allowCustom":false},
                  {"id":"q_next","text":"Next?","kind":"text","scale":null,"options":[],"allowMultiple":false,"allowCustom":false},
                  {"id":"q_sleep","text":"Sleep?","kind":"choice","scale":null,"options":[{"id":"a","text":"<5"},{"id":"b","text":"7-8"}],"allowMultiple":false,"allowCustom":true}]}')
                """.formatted(asha));
        sent = uuid("""
                INSERT INTO assessment (id, client_id, trainer_id, template_id, name, due_at, sent_at, measurements_asked, questions_asked)
                VALUES (:id::uuid, '%s', '%s', '%s', 'Monthly', now() + interval '2 days', now(), 2, 4)
                """.formatted(meera, asha, tpl));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(PHONE, null, AuthorityUtils.createAuthorityList("ROLE_CLIENT")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("measurements: stored in the template's order; a bad replacement leaves the old one; clear removes it")
    void measurements() throws Exception {
        answer("{\"kind\":\"measurement\",\"key\":\"weight\",\"value\":74.5}").andExpect(status().isOk());
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"value\":88}")
                .andExpect(jsonPath("$.readings[*].key", contains("waist", "weight")))
                .andExpect(jsonPath("$.measurements.got").value(2));
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"value\":0}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"value\":\"lots\"}").andExpect(status().isBadRequest());
        mvc.perform(get("/v1/me/assessments/" + sent)).andExpect(jsonPath("$.readings[0].value").value(88.0));
        answer("{\"kind\":\"measurement\",\"key\":\"bp\",\"value\":120}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("key: not asked in this assessment"));
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"clear\":true}")
                .andExpect(jsonPath("$.readings[*].key", contains("weight")));
    }

    @Test
    @DisplayName("questions are checked by kind, and a choice keeps one id unless it allows several")
    void questions() throws Exception {
        answer("{\"kind\":\"question\",\"questionId\":\"q_pain\",\"yes\":\"no\"}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"question\",\"questionId\":\"q_pain\",\"yes\":false,\"rating\":3}")
                .andExpect(jsonPath("$.answers[0].yes").value(false))
                .andExpect(jsonPath("$.answers[0].rating").doesNotExist());
        answer("{\"kind\":\"question\",\"questionId\":\"q_energy\",\"rating\":6}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"question\",\"questionId\":\"q_energy\",\"rating\":2.5}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"question\",\"questionId\":\"q_energy\",\"rating\":4}").andExpect(status().isOk());
        answer("{\"kind\":\"question\",\"questionId\":\"q_next\",\"text\":\"  \"}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"question\",\"questionId\":\"q_sleep\",\"optionIds\":[\"b\",\"a\",\"zz\"]}")
                .andExpect(jsonPath("$.answers[2].optionIds", contains("b")));
        answer("{\"kind\":\"question\",\"questionId\":\"q_sleep\",\"text\":\"Depends on the baby\"}")
                .andExpect(jsonPath("$.answers[2].text").value("Depends on the baby"))
                .andExpect(jsonPath("$.answers[2].optionIds.length()").value(0))
                .andExpect(jsonPath("$.questions.got").value(3));
        answer("{\"kind\":\"question\",\"questionId\":\"q_nope\",\"text\":\"x\"}").andExpect(status().isBadRequest());
        answer("{\"kind\":\"essay\"}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("submit refuses an empty one, closes a partial one unread for the trainer, and then it is CLOSED")
    void submit() throws Exception {
        mvc.perform(post("/v1/me/assessments/" + sent + "/submit"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EMPTY"));
        answer("{\"kind\":\"question\",\"questionId\":\"q_pain\",\"yes\":true}");
        mvc.perform(post("/v1/me/assessments/" + sent + "/submit"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("done"))
                .andExpect(jsonPath("$.completedAt").isString());
        answer("{\"kind\":\"question\",\"questionId\":\"q_next\",\"text\":\"late\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLOSED"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "SELECT read_at IS NULL FROM assessment WHERE id = :id::uuid", Map.of("id", sent.toString()), Boolean.class)).isTrue();
        // No bell row: a returned assessment is read on the assessments list.
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM trainer_notification WHERE trainer_id = :t::uuid", Map.of("t", asha.toString()), Integer.class)).isZero();
    }

    @Test
    @DisplayName("an unsent assessment cannot be answered")
    void unsent() throws Exception {
        jdbc.update("UPDATE assessment SET sent_at = NULL WHERE id = :id::uuid", Map.of("id", sent.toString()));
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"value\":88}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a reading reaches /v1/me/metrics only by returning an assessment — there is no weigh-in (V22)")
    void readingsComeFromAssessments() throws Exception {
        answer("{\"kind\":\"measurement\",\"key\":\"waist\",\"value\":88}").andExpect(status().isOk());
        // Not yet returned, so not yet a reading.
        mvc.perform(get("/v1/me/metrics")).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/v1/me/assessments/" + sent + "/submit")).andExpect(status().isOk());
        mvc.perform(get("/v1/me/metrics"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(sent.toString()))
                .andExpect(jsonPath("$[0].metricType").value("waist"))
                .andExpect(jsonPath("$[0].value").value(88))
                .andExpect(jsonPath("$[0].unit").value("cm"));

        mvc.perform(post("/v1/me/metrics").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"metricType\":\"weight\",\"value\":74.2}"))
                .andExpect(status().isMethodNotAllowed());
    }

    private org.springframework.test.web.servlet.ResultActions answer(String body) throws Exception {
        return mvc.perform(post("/v1/me/assessments/" + sent + "/answers").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID uuid(String insert) {
        UUID id = UUID.randomUUID();
        jdbc.update(insert, Map.of("id", id.toString()));
        return id;
    }
}
