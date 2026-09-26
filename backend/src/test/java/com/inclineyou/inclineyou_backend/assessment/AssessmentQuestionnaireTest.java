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

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;

/**
 * V14 · assessments, trainer side — the questionnaire, not the tape sitting V5
 * used to have. Pinned: the catalogue's spelling decisions, the template
 * normalisation the editor relies on, the four derived statuses and the filters
 * built on them, and the detail's join (resolve, fall back, drop).
 */
@SpringBootTest
@Transactional
class AssessmentQuestionnaireTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;
    private UUID other;
    private UUID meera;
    private UUID ravi;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("9100001301");
        other = trainer("9100001302");
        meera = client(me, "Meera Iyer");
        ravi = client(me, "Ravi Kumar");
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── the catalogue ───────────────────────────────────────────────────── */

    @Test
    @DisplayName("the catalogue: 21 measurements in 4 groups, 11 questions, V5's ids for the shared six, health items kept")
    void catalogue() throws Exception {
        mvc.perform(get("/v1/assessment-catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups", contains("Body composition", "Girths", "Vitals", "Movement")))
                .andExpect(jsonPath("$.measurements.length()").value(21))
                .andExpect(jsonPath("$.questions.length()").value(11))
                .andExpect(jsonPath("$.measurements[*].key", hasItem("weight")))
                .andExpect(jsonPath("$.measurements[*].key", hasItem("hip")))
                .andExpect(jsonPath("$.measurements[*].key", hasItem("arm")))
                .andExpect(jsonPath("$.measurements[*].key", not(hasItem("body_weight"))))
                .andExpect(jsonPath("$.measurements[?(@.key == 'waist')].metric", contains("waist")))
                .andExpect(jsonPath("$.measurements[*].key", hasItem("bp")))
                .andExpect(jsonPath("$.questions[*].id", hasItem("q_pain")));
    }

    /* ── templates ───────────────────────────────────────────────────────── */

    @Test
    @DisplayName("a template is normalised on write: bare list is ON, keys filtered + deduped, kinds and flags clamped")
    void templateNormalisation() throws Exception {
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"  Monthly check  ",
                 "measurements":["weight","tummy","waist","weight"],
                 "questions":{"items":[
                   {"text":"Energy?","kind":"rating","scale":7},
                   {"id":"mine","text":"Anything else?","kind":"text",
                    "options":[{"id":"x","text":"leftover"}],"allowMultiple":true,"allowCustom":true},
                   {"text":"Pick","kind":"choice","options":[{"text":"One"},{"id":"z","text":"Two"}],"allowMultiple":true},
                   {"kind":"essay"}]}}
                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Monthly check"))
                .andExpect(jsonPath("$.measurements.on").value(true))
                .andExpect(jsonPath("$.measurements.keys", contains("weight", "waist")))
                .andExpect(jsonPath("$.questions.on").value(true))
                .andExpect(jsonPath("$.questions.items[0].scale").value(10))
                .andExpect(jsonPath("$.questions.items[0].id").value(startsWith("aq_")))
                .andExpect(jsonPath("$.questions.items[1].id").value("mine"))
                .andExpect(jsonPath("$.questions.items[1].options.length()").value(0))
                .andExpect(jsonPath("$.questions.items[1].allowMultiple").value(false))
                .andExpect(jsonPath("$.questions.items[1].allowCustom").value(false))
                .andExpect(jsonPath("$.questions.items[2].options[*].id", contains("a", "z")))
                .andExpect(jsonPath("$.questions.items[2].allowMultiple").value(true))
                .andExpect(jsonPath("$.questions.items[3].kind").value("text"))
                .andExpect(jsonPath("$.questions.items[3].text").value("Question 4"))
                .andExpect(jsonPath("$.createdAt").value(startsWith("20")));
    }

    @Test
    @DisplayName("a template needs a name; PUT replaces the blocks it is sent and leaves the rest")
    void templateNameAndPut() throws Exception {
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value("name: required"));

        String id = template("{\"name\":\"Tape\",\"description\":\"Every 4 weeks\",\"measurements\":{\"on\":true,\"keys\":[\"waist\"]}}");
        mvc.perform(put("/v1/assessment-templates/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"measurements\":{\"on\":false,\"keys\":[\"hip\"]}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Tape"))
                .andExpect(jsonPath("$.description").value("Every 4 weeks"))
                .andExpect(jsonPath("$.measurements.on").value(false))
                .andExpect(jsonPath("$.measurements.keys", contains("hip")));
        mvc.perform(put("/v1/assessment-templates/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"\"}"))
                .andExpect(jsonPath("$.description").doesNotExist());
    }

    /* ── sending ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("sendNow:false books it; otherwise it is waiting, or missed once due; the asked counts come from the template")
    void statuses() throws Exception {
        String tpl = standardTemplate();
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(meera, tpl, "2099-01-01T00:00:00Z", false)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("booked"))
                .andExpect(jsonPath("$.sentAt").doesNotExist())
                .andExpect(jsonPath("$.name").value("Monthly check"))
                .andExpect(jsonPath("$.measurements.asked").value(2))
                .andExpect(jsonPath("$.questions.asked").value(2))
                .andExpect(jsonPath("$.unread").value(false));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(meera, tpl, "2099-01-01", null)))
                .andExpect(jsonPath("$.status").value("waiting"))
                .andExpect(jsonPath("$.sentAt").value(startsWith("20")));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(meera, tpl, "2020-01-01T00:00:00Z", true)))
                .andExpect(jsonPath("$.status").value("missed"));
    }

    @Test
    @DisplayName("an unknown client, template or date is a 400 naming the field")
    void sendRefusals() throws Exception {
        String tpl = standardTemplate();
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(client(other, "Theirs"), tpl, null, true)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("clientId: no such client"));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(meera, UUID.randomUUID().toString(), null, true)))
                .andExpect(jsonPath("$.detail").value("templateId: no such assessment"));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(meera, tpl, "next Tuesday", true)))
                .andExpect(jsonPath("$.detail").value("dueAt: must be an ISO date-time"));
    }

    @Test
    @DisplayName("send:true sends a booked one; read toggles both ways; delete is soft")
    void patchAndDelete() throws Exception {
        String a = sent(meera, standardTemplate(), "2099-01-01T00:00:00Z", false);
        mvc.perform(patch("/v1/assessments/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"send\":true}"))
                .andExpect(jsonPath("$.status").value("waiting"));

        returned(a, "[{\"key\":\"waist\",\"value\":88}]", "[]");
        mvc.perform(get("/v1/assessments/" + a)).andExpect(jsonPath("$.unread").value(true));
        mvc.perform(patch("/v1/assessments/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"read\":true}"))
                .andExpect(jsonPath("$.unread").value(false))
                .andExpect(jsonPath("$.readAt").value(startsWith("20")));
        mvc.perform(patch("/v1/assessments/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"read\":false}"))
                .andExpect(jsonPath("$.unread").value(true));

        mvc.perform(delete("/v1/assessments/" + a)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/assessments/" + a)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ASSESSMENT_NOT_FOUND"));
    }

    /* ── the list ────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("status is a CSV set (unknown names ignored), read filters, q matches the client, total counts after filters")
    void listFilters() throws Exception {
        String tpl = standardTemplate();
        sent(meera, tpl, "2099-01-01T00:00:00Z", false);              // booked
        String done = sent(ravi, tpl, "2020-01-01T00:00:00Z", true);  // missed → done below
        sent(ravi, tpl, "2020-02-01T00:00:00Z", true);                // missed
        returned(done, "[]", "[{\"questionId\":\"q_sleep\",\"optionIds\":[\"c\"]}]");

        mvc.perform(get("/v1/assessments").param("status", "done,missed,bogus"))
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/v1/assessments").param("status", "bogus"))
                .andExpect(jsonPath("$.total").value(3));
        mvc.perform(get("/v1/assessments").param("read", "unread"))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(done))
                .andExpect(jsonPath("$.items[0].questions.got").value(1));
        mvc.perform(get("/v1/assessments").param("q", "ravi").param("size", "1"))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items.length()").value(1))
                // Newest due first.
                .andExpect(jsonPath("$.items[0].dueAt").value("2020-02-01T00:00:00Z"));
        mvc.perform(get("/v1/assessments").param("clientId", meera.toString()))
                .andExpect(jsonPath("$.items[0].status").value("booked"));
        // List rows carry no readings or answers — only the counts.
        mvc.perform(get("/v1/assessments"))
                .andExpect(jsonPath("$.items[0].readings").doesNotExist());
    }

    /* ── the detail ──────────────────────────────────────────────────────── */

    @Test
    @DisplayName("the detail resolves readings and answers, drops what it cannot name, and charts only returned assessments")
    void detail() throws Exception {
        String tpl = standardTemplate();
        String first = sent(meera, tpl, "2020-01-01T00:00:00Z", true);
        String second = sent(meera, tpl, "2020-02-01T00:00:00Z", true);
        returned(first, "[{\"key\":\"waist\",\"value\":90}]", "[]");
        returned(second,
                "[{\"key\":\"waist\",\"value\":88},{\"key\":\"weight\",\"value\":74.5},{\"key\":\"tummy\",\"value\":1}]",
                "[{\"questionId\":\"q_blockers\",\"optionIds\":[\"a\",\"b\"]},"
                        + "{\"questionId\":\"q_pain\",\"yes\":false},{\"questionId\":\"gone\",\"text\":\"x\"}]");

        mvc.perform(get("/v1/assessments/" + second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.client.name").value("Meera Iyer"))
                .andExpect(jsonPath("$.template.name").value("Monthly check"))
                .andExpect(jsonPath("$.asked.measurements[*].key", contains("waist", "weight")))
                .andExpect(jsonPath("$.readings.length()").value(2))
                .andExpect(jsonPath("$.readings[0].label").value("Waist, at the navel"))
                .andExpect(jsonPath("$.answers.length()").value(2))
                .andExpect(jsonPath("$.answers[0].chosen", contains("Work", "Travel")))
                // q_pain is not in this template: answered from the bank.
                .andExpect(jsonPath("$.answers[1].text").value("Did anything hurt or feel off while training?"))
                .andExpect(jsonPath("$.answers[1].yes").value(false))
                .andExpect(jsonPath("$.history[0].key").value("waist"))
                .andExpect(jsonPath("$.history[0].points[*].value", contains(90.0, 88.0)))
                .andExpect(jsonPath("$.returned[*].id", contains(second, first)));
    }

    @Test
    @DisplayName("deleting a template keeps every assessment sent from it, with templateId nulled")
    void templateDeleteKeepsAssessments() throws Exception {
        String tpl = standardTemplate();
        String a = sent(meera, tpl, "2020-01-01T00:00:00Z", true);
        returned(a, "[]", "[{\"questionId\":\"q_sleep\",\"optionIds\":[\"c\"]}]");

        mvc.perform(delete("/v1/assessment-templates/" + tpl)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/assessment-templates/" + tpl)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ASSESSMENT_TEMPLATE_NOT_FOUND"));
        mvc.perform(get("/v1/assessments/" + a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.templateId").doesNotExist())
                .andExpect(jsonPath("$.template").doesNotExist())
                .andExpect(jsonPath("$.asked.questions.length()").value(0))
                // The answer still has a label: q_sleep is in the bank.
                .andExpect(jsonPath("$.answers[0].chosen", contains("7 to 8")));
    }

    @Test
    @DisplayName("another trainer's assessment and template are 404s")
    void ownership() throws Exception {
        String a = sent(meera, standardTemplate(), null, true);
        signedInAs(other);
        mvc.perform(get("/v1/assessments/" + a)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/assessments")).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/v1/assessment-templates")).andExpect(jsonPath("$.length()").value(0));
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private String standardTemplate() throws Exception {
        return template("""
                {"name":"Monthly check","measurements":{"on":true,"keys":["waist","weight"]},
                 "questions":{"on":true,"items":[
                   {"id":"q_sleep","text":"How many hours did you sleep on a typical night?","kind":"choice",
                    "options":[{"id":"a","text":"Under 5"},{"id":"b","text":"5 to 6"},{"id":"c","text":"7 to 8"}]},
                   {"id":"q_blockers","text":"What got in the way?","kind":"choice","allowMultiple":true,
                    "options":[{"id":"a","text":"Work"},{"id":"b","text":"Travel"}]}]}}
                """);
    }

    private String template(String body) throws Exception {
        String json = mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private static String send(UUID client, String tpl, String dueAt, Boolean sendNow) {
        return "{\"clientId\":\"" + client + "\",\"templateId\":\"" + tpl + "\""
                + (dueAt == null ? "" : ",\"dueAt\":\"" + dueAt + "\"")
                + (sendNow == null ? "" : ",\"sendNow\":" + sendNow) + "}";
    }

    private String sent(UUID client, String tpl, String dueAt, boolean sendNow) throws Exception {
        String json = mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content(send(client, tpl, dueAt, sendNow)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    /** What the portal will do in module 11: write the answers and close it. */
    private void returned(String id, String readings, String answers) {
        jdbc.update("""
                UPDATE assessment SET readings = CAST(:r AS jsonb), answers = CAST(:a AS jsonb),
                    completed_at = due_at + interval '1 day', read_at = NULL
                WHERE id = :id::uuid
                """, Map.of("r", readings, "a", answers, "id", id));
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
