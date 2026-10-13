package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, tr-a6 and tr-a12: assessments are the client's to take. Pins that an assessment given to a client on the
 * portal is visible to them at once (and tells them once), that "take in person only" and a client with no portal keep it
 * the trainer's, that sending later is idempotent, the weekly check-in as an idempotent request for the product's own form,
 * that {@code clientCanStart} survives a 1.1-shaped PUT, and that a cycle stores {@code sendToClient}.
 */
@SpringBootTest
@Transactional
class AssessmentClientSendApiTest {

    private static final String FORM = """
            {"name":"Monthly check","description":null,
             "measurements":{"on":true,"keys":["weight"]},
             "questions":{"on":true,"items":[
               {"id":"q1","text":"Did anything hurt?","kind":"yesno","scale":null,"options":[],"allowMultiple":false,"allowCustom":false}]}}""";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, joined, stranger;
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100001701");
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        joined = client("On The Portal");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", joined.toString()));
        stranger = client("Not On It");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("given to a client on the portal it is sent at once, and tells them once; a replayed id tells nobody again")
    void sentAtOnce() throws Exception {
        String tpl = template(FORM);
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"dueOn\":\"" + today.plusDays(1) + "\"}";
        String json = give(body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertNotNull(JsonPath.read(json, "$.sentAt"));
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE id = :i::uuid AND sent_at IS NOT NULL", id));
        Map<String, Object> n = jdbc.queryForMap("SELECT kind, text FROM client_notification WHERE client_id = :c::uuid", Map.of("c", joined.toString()));
        assertEquals("checkin", n.get("kind"));
        assertEquals("A new assessment is waiting: Monthly check.", n.get("text"));
        give(body).andExpect(status().isOk()).andExpect(jsonPath("$.sentAt").isNumber());
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid", joined), "a replay is not a second notice");
    }

    @Test
    @DisplayName("sendNow:false keeps it the trainer's; a client with no portal is not an error and sends nothing; the list carries sentAt")
    void keptInPerson() throws Exception {
        String tpl = template(FORM);
        String kept = JsonPath.read(give("{\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"sendNow\":false}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sentAt").value(org.hamcrest.Matchers.nullValue()))
                .andReturn().getResponse().getContentAsString(), "$.id");
        give("{\"clientId\":\"" + stranger + "\",\"templateId\":\"" + tpl + "\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sentAt").value(org.hamcrest.Matchers.nullValue()));
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid", joined));

        mvc.perform(get("/v1/assessments?clientId=" + joined)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(kept)).andExpect(jsonPath("$.items[0].sentAt").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(post("/v1/assessments/" + kept + "/send").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        mvc.perform(get("/v1/assessments?clientId=" + joined)).andExpect(jsonPath("$.items[0].sentAt").isNumber());
    }

    @Test
    @DisplayName("send: later, idempotent (no second notice), and 409 for a done one, a client with no portal, and an archived one; 404 for another trainer's")
    void sendLater() throws Exception {
        String tpl = template(FORM);
        String a = JsonPath.read(give("{\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"sendNow\":false}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        String first = send(a).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long sentAt = ((Number) JsonPath.read(first, "$.sentAt")).longValue();
        String second = send(a).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(sentAt, ((Number) JsonPath.read(second, "$.sentAt")).longValue(), "sending again keeps the date");
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid", joined), "and tells nobody twice");

        String noPortal = JsonPath.read(give("{\"clientId\":\"" + stranger + "\",\"templateId\":\"" + tpl + "\"}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        send(noPortal).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_ON_PORTAL"));

        String done = JsonPath.read(give("{\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"sendNow\":false}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.update("UPDATE assessment SET completed_at = now(), entered_by = 'trainer' WHERE id = :i::uuid", Map.of("i", done));
        send(done).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSESSMENT_COMPLETED"));

        String late = JsonPath.read(give("{\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"sendNow\":false}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :c::uuid", Map.of("c", joined.toString()));
        send(late).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ARCHIVED"));

        send(UUID.randomUUID().toString()).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the weekly check-in: asked for with systemKey alone, made once (201) and found after (200), offered to clients; nothing else may ride with it")
    void weeklyCheckIn() throws Exception {
        UUID id = UUID.randomUUID();
        String made = mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"systemKey\":\"weekly_check_in\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.systemKey").value("weekly_check_in"))
                .andExpect(jsonPath("$.clientCanStart").value(true)).andExpect(jsonPath("$.name").value("Weekly check-in"))
                .andReturn().getResponse().getContentAsString();
        assertEquals(List.of("weight"), JsonPath.read(made, "$.measurements.keys"));
        assertEquals(2, ((List<?>) JsonPath.read(made, "$.questions.items")).size());

        // Found, not made again: by the same id, by no id, and by a new one.
        for (String body : new String[]{"{\"id\":\"" + id + "\",\"systemKey\":\"weekly_check_in\"}", "{\"systemKey\":\"weekly_check_in\"}",
                "{\"id\":\"" + UUID.randomUUID() + "\",\"systemKey\":\"weekly_check_in\"}"}) {
            mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        }
        assertEquals(1, count("SELECT count(*) FROM assessment_template WHERE trainer_id = :i::uuid AND system_key = 'weekly_check_in'", me));

        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("{\"systemKey\":\"mystery\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("systemKey")));
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("{\"systemKey\":\"weekly_check_in\",\"name\":\"Mine\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/assessment-templates")).andExpect(jsonPath("$.items[?(@.systemKey=='weekly_check_in')].clientCanStart").value(true));
    }

    @Test
    @DisplayName("the weekly check-in's name is told apart when a form of the trainer's already has it, rather than refused")
    void weeklyNameTaken() throws Exception {
        template(FORM.replace("Monthly check", "Weekly check-in"));
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("{\"systemKey\":\"weekly_check_in\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Weekly check-in (default)"));
    }

    @Test
    @DisplayName("clientCanStart: false on a trainer's own form, settable on POST and PUT, and a 1.1-shaped PUT leaves it alone")
    void clientCanStart() throws Exception {
        String own = mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.clientCanStart").value(false)).andExpect(jsonPath("$.systemKey").value(org.hamcrest.Matchers.nullValue()))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(own, "$.id");
        String version = JsonPath.read(own, "$.version");

        String on = putTemplate(id, version, FORM.replaceFirst("\\{", "{\"clientCanStart\":true,"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clientCanStart").value(true)).andReturn().getResponse().getContentAsString();
        String renamed = putTemplate(id, JsonPath.read(on, "$.version"), FORM.replace("Monthly check", "Monthly check 2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clientCanStart").value(true)).andReturn().getResponse().getContentAsString();
        putTemplate(id, JsonPath.read(renamed, "$.version"), FORM.replace("Monthly check", "Monthly check 2").replaceFirst("\\{", "{\"clientCanStart\":false,"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clientCanStart").value(false));
        assertEquals(false, jdbc.queryForObject("SELECT client_can_start FROM assessment_template WHERE id = :i::uuid", Map.of("i", id), Boolean.class));

        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON)
                        .content(FORM.replace("Monthly check", "Offered from the start").replaceFirst("\\{", "{\"clientCanStart\":true,")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.clientCanStart").value(true));
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON)
                        .content(FORM.replace("Monthly check", "Bad").replaceFirst("\\{", "{\"clientCanStart\":\"yes\",")))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a cycle stores sendToClient: default true, settable on POST, changed by PATCH alone, and PATCH still needs something to change")
    void cycleSendToClient() throws Exception {
        String tpl = template(FORM);
        String made = mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + joined + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":14,\"firstDueOn\":\"" + today.plusDays(3) + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sendToClient").value(true)).andReturn().getResponse().getContentAsString();
        String sid = JsonPath.read(made, "$.id");
        assertNull(jdbc.queryForObject("SELECT sent_at::text FROM assessment WHERE schedule_id = :i::uuid", Map.of("i", sid), String.class),
                "booking a cycle sends nothing: the daily sender does that on the due date");

        mvc.perform(patch("/v1/assessment-schedules/" + sid).contentType(MediaType.APPLICATION_JSON).content("{\"sendToClient\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sendToClient").value(false)).andExpect(jsonPath("$.intervalDays").value(14));
        mvc.perform(get("/v1/assessment-schedules?clientId=" + joined)).andExpect(jsonPath("$.items[0].sendToClient").value(false));
        mvc.perform(patch("/v1/assessment-schedules/" + sid).contentType(MediaType.APPLICATION_JSON).content("{\"sendToClient\":null}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/v1/assessment-schedules/" + sid).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());

        UUID other = client("Second");
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + other + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":7,\"sendToClient\":false}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sendToClient").value(false));
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private org.springframework.test.web.servlet.ResultActions give(String body) throws Exception {
        return mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private org.springframework.test.web.servlet.ResultActions send(String id) throws Exception {
        return mvc.perform(post("/v1/assessments/" + id + "/send").contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    private org.springframework.test.web.servlet.ResultActions putTemplate(String id, String version, String body) throws Exception {
        return mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"" + version + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String template(String form) throws Exception {
        return JsonPath.read(mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(form))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private int count(String sql, Object id) {
        return jdbc.queryForObject(sql, Map.of(sql.contains(":c::") ? "c" : "i", id.toString()), Integer.class);
    }

    private UUID client(String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')",
                Map.of("id", id.toString(), "tid", me.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, :p FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p", Map.of("p", phone), String.class));
    }
}
