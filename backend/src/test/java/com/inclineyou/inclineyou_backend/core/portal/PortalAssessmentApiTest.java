package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.OtpSender;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, pa-l1 … pa-a2: the client's assessments tab. What is waiting and what is done, one assessment to take or to read back, the
 * templates the trainer offers and starting one, and the entry — saved for later or submitted, and a cycle moving on when it is. Through the
 * security chain; the suite runs as the schema owner, so the walls themselves (what a client may insert and update) are asserted as the
 * request role in {@code TenantIsolationTest}.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalAssessmentApiTest.CapturingSender.class)
@Transactional
class PortalAssessmentApiTest {

    private static final String WEB = "X-InclineYou-Client";
    private static final String WEIGHT = "{\"key\":\"weight\",\"label\":\"Body weight\",\"group\":\"Body composition\",\"unit\":\"kg\"}";
    private static final String WAIST = "{\"key\":\"waist\",\"label\":\"Waist\",\"group\":\"Girths\",\"unit\":\"cm\"}";
    private static final String VISCERAL = "{\"key\":\"visceral\",\"label\":\"Visceral fat\",\"group\":\"Body composition\",\"unit\":\"\"}";
    private static final String Q_ENERGY = "{\"id\":\"q_energy\",\"text\":\"Energy this week\",\"kind\":\"rating\",\"scale\":5,\"options\":[],\"allowMultiple\":false,\"allowCustom\":false}";
    private static final String Q_NOTE = "{\"id\":\"q_note\",\"text\":\"Anything you want to tell me?\",\"kind\":\"text\",\"scale\":null,\"options\":[],\"allowMultiple\":false,\"allowCustom\":false}";
    private static final String Q_PAIN = "{\"id\":\"q_pain\",\"text\":\"Did anything hurt?\",\"kind\":\"yesno\",\"scale\":null,\"options\":[],\"allowMultiple\":false,\"allowCustom\":false}";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;
    private UUID me, tenant;
    private int seq = 0;
    private final java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    private ResultActions get(String token, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private ResultActions putEntry(String token, String id, String ifMatch, String json) throws Exception {
        var r = put("/v1/portal/assessments/" + id + "/entry").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json);
        if (ifMatch != null) r = r.header("If-Match", "\"" + ifMatch + "\"");
        return mvc.perform(r);
    }

    private String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private String version(UUID assessment) {
        return jdbc.queryForObject("SELECT floor(extract(epoch FROM updated_at) * 1000)::bigint::text FROM assessment WHERE id = :a::uuid", Map.of("a", assessment.toString()), String.class);
    }

    /** A template on the trainer's shelf; {@code offered} is "clients can start this". */
    private UUID tpl(UUID trainerId, String name, boolean offered, String systemKey, String measurementKeys, String questionItems) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("n", name); m.put("o", offered); m.put("k", systemKey);
        m.put("ms", "{\"on\":true,\"keys\":[" + measurementKeys + "]}"); m.put("qs", "{\"on\":true,\"items\":[" + questionItems + "]}");
        jdbc.update("INSERT INTO assessment_template (id, tenant_id, trainer_id, name, client_can_start, system_key, measurements, questions) VALUES (:id::uuid, :ten::uuid, :t::uuid, :n, :o, :k, CAST(:ms AS jsonb), CAST(:qs AS jsonb))", m);
        return id;
    }

    /** An assessment of the client's. {@code form} is {@code {measurements, questions}}; {@code sent} makes it theirs to see. */
    private UUID asm(UUID client, UUID template, String name, String measurements, String questions, boolean sent, java.time.LocalDate due, UUID schedule) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("c", client.toString()); m.put("t", template.toString()); m.put("n", name); m.put("d", java.sql.Date.valueOf(due)); m.put("s", sent);
        m.put("f", "{\"measurements\":[" + measurements + "],\"questions\":[" + questions + "]}"); m.put("sch", schedule == null ? null : schedule.toString());
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, schedule_id, name, form, due_on, sent_at)
                SELECT :id::uuid, c.tenant_id, c.trainer_id, c.id, :t::uuid, CAST(:sch AS uuid), :n, CAST(:f AS jsonb), :d, CASE WHEN :s THEN now() END FROM client c WHERE c.id = :c::uuid""", m);
        return id;
    }

    private void complete(UUID assessment, String readings, String answers, int daysAgo) {
        jdbc.update("UPDATE assessment SET readings = CAST(:r AS jsonb), answers = CAST(:a AS jsonb), completed_at = now() - make_interval(days => :d), entered_by = 'client' WHERE id = :id::uuid",
                Map.of("r", readings, "a", answers, "d", daysAgo, "id", assessment.toString()));
    }

    @Test
    @DisplayName("the list: what is waiting oldest-due first with how much it asks and whether it is late, what is done newest first, the two counts and whether there is anything to start; unsent, deleted and others' never appear")
    void list() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\"", Q_ENERGY + "," + Q_NOTE);
        UUID lateOne = asm(c, t, "Weekly check-in", WEIGHT, Q_ENERGY + "," + Q_NOTE, true, today.minusDays(3), null);
        UUID soon = asm(c, t, "Monthly measures", WAIST, "", true, today.plusDays(2), null);
        asm(c, t, "Not sent yet", WAIST, "", false, today, null);
        UUID deleted = asm(c, t, "Deleted", WAIST, "", true, today, null);
        jdbc.update("UPDATE assessment SET deleted_at = now() WHERE id = :a::uuid", Map.of("a", deleted.toString()));
        UUID d1 = asm(c, t, "Older done", WAIST, "", true, today.minusDays(40), null); complete(d1, "{\"waist\":84}", "{}", 30);
        UUID d2 = asm(c, t, "Newer done", WAIST, "", true, today.minusDays(20), null); complete(d2, "{\"waist\":82}", "{}", 10);
        UUID other = liveOther();
        asm(other, t, "Somebody else's", WAIST, "", true, today, null);
        String token = tokenFor(phone);

        get(token, "/v1/portal/assessments?state=open&include=counts").andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.items[0].id").value(lateOne.toString())).andExpect(jsonPath("$.items[0].late").value(true))
                .andExpect(jsonPath("$.items[0].state").value("open")).andExpect(jsonPath("$.items[0].systemKey").value("weekly_check_in")).andExpect(jsonPath("$.items[0].asks.measurements").value(1))
                .andExpect(jsonPath("$.items[0].asks.questions").value(2)).andExpect(jsonPath("$.items[0].completedAt").value(nullValue()))
                .andExpect(jsonPath("$.items[1].id").value(soon.toString())).andExpect(jsonPath("$.items[1].late").value(false))
                .andExpect(jsonPath("$.counts.open").value(2)).andExpect(jsonPath("$.counts.done").value(2)).andExpect(jsonPath("$.canStart").value(true)).andExpect(jsonPath("$.nextCursor").value(nullValue()));
        String page = body(get(token, "/v1/portal/assessments?state=done&limit=1").andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].id").value(d2.toString()))
                .andExpect(jsonPath("$.items[0].state").value("done")).andExpect(jsonPath("$.items[0].completedAt").isNumber()).andExpect(jsonPath("$.counts").doesNotExist()).andExpect(jsonPath("$.nextCursor").isString()));
        get(token, "/v1/portal/assessments?state=done&limit=1&cursor=" + com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor")).andExpect(jsonPath("$.items[0].id").value(d1.toString())).andExpect(jsonPath("$.nextCursor").value(nullValue()));
        String openPage = body(get(token, "/v1/portal/assessments?state=open&limit=1").andExpect(jsonPath("$.nextCursor").isString()));
        get(token, "/v1/portal/assessments?state=open&limit=1&cursor=" + com.jayway.jsonpath.JsonPath.read(openPage, "$.nextCursor")).andExpect(jsonPath("$.items[0].id").value(soon.toString()));
        get(token, "/v1/portal/assessments").andExpect(status().isBadRequest());
        get(token, "/v1/portal/assessments?state=maybe").andExpect(status().isBadRequest());
        get(token, "/v1/portal/assessments?state=open&cursor=nonsense").andExpect(status().isBadRequest());
        // nothing on offer: no "start a new one"
        jdbc.update("UPDATE assessment_template SET client_can_start = false WHERE id = :t::uuid", Map.of("t", t.toString()));
        get(token, "/v1/portal/assessments?state=open").andExpect(jsonPath("$.canStart").value(false));
    }

    @Test
    @DisplayName("one to take: the form it asks with every measurement optional, the saved draft, the health notice when it asks one — and with hideWeight on, no weight anywhere; unsent, deleted and others' are 404")
    void openDetail() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\",\"waist\"", Q_ENERGY);
        UUID a = asm(c, t, "Weekly check-in", WEIGHT + "," + WAIST, Q_ENERGY, true, today, null);
        jdbc.update("UPDATE assessment SET readings = '{\"waist\": 82}'::jsonb, answers = '{\"q_energy\": {\"rating\": 4}}'::jsonb WHERE id = :a::uuid", Map.of("a", a.toString()));
        UUID unsent = asm(c, t, "Not sent", WAIST, "", false, today, null);
        String token = tokenFor(phone);

        get(token, "/v1/portal/assessments/" + a).andExpect(status().isOk()).andExpect(header().string("ETag", "\"" + version(a) + "\""))
                .andExpect(jsonPath("$.state").value("open")).andExpect(jsonPath("$.late").value(false)).andExpect(jsonPath("$.version").value(version(a)))
                .andExpect(jsonPath("$.asked.measurements", hasSize(2))).andExpect(jsonPath("$.asked.measurements[0].key").value("weight")).andExpect(jsonPath("$.asked.measurements[0].optional").value(true))
                .andExpect(jsonPath("$.asked.questions[0].text").value("Energy this week")).andExpect(jsonPath("$.entry.readings.waist").value(82))
                .andExpect(jsonPath("$.entry.answers.q_energy.rating").value(4)).andExpect(jsonPath("$.weightHidden").value(false)).andExpect(jsonPath("$.healthNotice").value(nullValue()))
                .andExpect(jsonPath("$.readings").doesNotExist()).andExpect(jsonPath("$.history").doesNotExist()).andExpect(jsonPath("$.returned").doesNotExist());

        // weight hidden: out of the form, the draft and the entry
        jdbc.update("UPDATE assessment SET readings = '{\"weight\": 61, \"waist\": 82}'::jsonb WHERE id = :a::uuid", Map.of("a", a.toString()));
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, hide_weight) SELECT id, tenant_id, true FROM client WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/assessments/" + a).andExpect(jsonPath("$.weightHidden").value(true)).andExpect(jsonPath("$.asked.measurements", hasSize(1))).andExpect(jsonPath("$.asked.measurements[0].key").value("waist"))
                .andExpect(jsonPath("$.entry.readings.weight").doesNotExist()).andExpect(jsonPath("$.entry.readings.waist").value(82));

        // a health item carries its notice
        UUID h = asm(c, t, "Health check", VISCERAL, Q_PAIN, true, today, null);
        get(token, "/v1/portal/assessments/" + h).andExpect(jsonPath("$.healthNotice").value("Your trainer asked this. It is stored with your assessment and they can see it."));

        get(token, "/v1/portal/assessments/" + unsent).andExpect(status().isNotFound());
        UUID other = liveOther();
        get(token, "/v1/portal/assessments/" + asm(other, t, "Theirs", WAIST, "", true, today, null)).andExpect(status().isNotFound());
        get(token, "/v1/portal/assessments/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("one read back: each reading with the last completed one's value and the change, the answers as the trainer reads them, this client's series for the keys asked, and their other completed ones")
    void doneDetail() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"waist\"", Q_ENERGY);
        UUID first = asm(c, t, "Weekly check-in", WAIST, Q_ENERGY, true, today.minusDays(30), null); complete(first, "{\"waist\":84}", "{}", 28);
        UUID second = asm(c, t, "Weekly check-in", WAIST, Q_ENERGY, true, today.minusDays(7), null); complete(second, "{\"waist\":82}", "{\"q_energy\":{\"rating\":4}}", 6);
        String token = tokenFor(phone);

        get(token, "/v1/portal/assessments/" + second).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("done")).andExpect(jsonPath("$.completedAt").isNumber())
                .andExpect(jsonPath("$.readings", hasSize(1))).andExpect(jsonPath("$.readings[0].key").value("waist")).andExpect(jsonPath("$.readings[0].value").value(82))
                .andExpect(jsonPath("$.readings[0].previous").value(84)).andExpect(jsonPath("$.readings[0].change").value(-2))
                .andExpect(jsonPath("$.answers[0].text").value("Energy this week")).andExpect(jsonPath("$.answers[0].rating").value(4))
                .andExpect(jsonPath("$.history[0].key").value("waist")).andExpect(jsonPath("$.history[0].points", hasSize(2))).andExpect(jsonPath("$.history[0].points[0].value").value(84))
                .andExpect(jsonPath("$.returned", hasSize(1))).andExpect(jsonPath("$.returned[0].id").value(first.toString()));
        get(token, "/v1/portal/assessments/" + first).andExpect(jsonPath("$.readings[0].previous").value(nullValue())).andExpect(jsonPath("$.readings[0].change").value(nullValue()));
    }

    @Test
    @DisplayName("the entry: a draft saves and is found again, the trainer rules apply, a stale or missing If-Match is 412 / 428, a submit stamps the client and is final, and nothing submitted is 400")
    void entry() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\",\"waist\"", Q_ENERGY + "," + Q_NOTE);
        UUID a = asm(c, t, "Weekly check-in", WEIGHT + "," + WAIST, Q_ENERGY + "," + Q_NOTE, true, today, null);
        String token = tokenFor(phone);

        putEntry(token, a.toString(), null, "{\"readings\":{},\"answers\":{},\"complete\":false}").andExpect(status().isPreconditionRequired());
        putEntry(token, a.toString(), "1", "{\"readings\":{},\"answers\":{},\"complete\":false}").andExpect(status().isPreconditionFailed());
        // save for later
        String v1 = version(a);
        putEntry(token, a.toString(), v1, "{\"readings\":{\"waist\":82},\"answers\":{\"q_energy\":{\"rating\":4}},\"complete\":false}").andExpect(status().isOk())
                .andExpect(header().exists("ETag")).andExpect(jsonPath("$.state").value("open")).andExpect(jsonPath("$.entry.readings.waist").value(82)).andExpect(jsonPath("$.entry.answers.q_energy.rating").value(4));
        var saved = jdbc.queryForMap("SELECT completed_at, entered_by FROM assessment WHERE id = :a::uuid", Map.of("a", a.toString()));
        assertNull(saved.get("completed_at"));
        assertNull(saved.get("entered_by"));
        // the rules are the trainer's: a key not on the form, a value out of range, an answer that does not fit
        String v2 = version(a);
        putEntry(token, a.toString(), v2, "{\"readings\":{\"chest\":90},\"answers\":{},\"complete\":false}").andExpect(status().isBadRequest());
        putEntry(token, a.toString(), v2, "{\"readings\":{\"waist\":-3},\"answers\":{},\"complete\":false}").andExpect(status().isBadRequest());
        putEntry(token, a.toString(), v2, "{\"readings\":{},\"answers\":{\"q_energy\":{\"rating\":9}},\"complete\":false}").andExpect(status().isBadRequest());
        putEntry(token, a.toString(), v2, "{\"readings\":{},\"answers\":{},\"complete\":false,\"completedAt\":1}").andExpect(status().isBadRequest());
        // submitting nothing
        putEntry(token, a.toString(), v2, "{\"readings\":{},\"answers\":{},\"complete\":true}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NOTHING_ENTERED"));
        // submit
        putEntry(token, a.toString(), v2, "{\"readings\":{\"weight\":61.4,\"waist\":82},\"answers\":{\"q_energy\":{\"rating\":4},\"q_note\":{\"text\":\"slept badly\"}},\"complete\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("done")).andExpect(jsonPath("$.completedAt").isNumber()).andExpect(jsonPath("$.readings", hasSize(2))).andExpect(jsonPath("$.answers", hasSize(2)));
        var done = jdbc.queryForMap("SELECT completed_at, entered_by FROM assessment WHERE id = :a::uuid", Map.of("a", a.toString()));
        assertNotNull(done.get("completed_at"));
        assertEquals("client", done.get("entered_by"));
        // final for the client
        putEntry(token, a.toString(), version(a), "{\"readings\":{\"waist\":70},\"answers\":{},\"complete\":false}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSESSMENT_COMPLETED"));
        // an assessment that is not theirs, or not sent
        UUID other = liveOther();
        putEntry(token, asm(other, t, "Theirs", WAIST, "", true, today, null).toString(), "1", "{\"readings\":{\"waist\":80},\"answers\":{},\"complete\":false}").andExpect(status().isNotFound());
        putEntry(token, asm(c, t, "Not sent", WAIST, "", false, today, null).toString(), "1", "{\"readings\":{\"waist\":80},\"answers\":{},\"complete\":false}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("hideWeight: a weight cannot be sent for a client who hid it, and the rest of the entry still goes through")
    void weightHiddenCannotBeEntered() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\",\"waist\"", "");
        UUID a = asm(c, t, "Weekly check-in", WEIGHT + "," + WAIST, "", true, today, null);
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, hide_weight) SELECT id, tenant_id, true FROM client WHERE id = :c::uuid", Map.of("c", c.toString()));
        String token = tokenFor(phone);
        putEntry(token, a.toString(), version(a), "{\"readings\":{\"weight\":61},\"answers\":{},\"complete\":false}").andExpect(status().isBadRequest());
        putEntry(token, a.toString(), version(a), "{\"readings\":{\"waist\":82},\"answers\":{},\"complete\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.readings", hasSize(1)));
    }

    @Test
    @DisplayName("a submit moves its cycle on from the day it was done and books the next one unsent; a one-off, an ended cycle and a deleted template book nothing")
    void cycleAdvances() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Monthly measures", false, null, "\"waist\"", Q_ENERGY);
        UUID cycle = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", arun.toString()), String.class);
        jdbc.update("INSERT INTO assessment_schedule (id, tenant_id, trainer_id, client_id, template_id, interval_days, next_due_on) VALUES (:id::uuid, :ten::uuid, :t::uuid, :c::uuid, :tpl::uuid, 14, :d)",
                Map.of("id", cycle.toString(), "ten", ten, "t", arun.toString(), "c", c.toString(), "tpl", t.toString(), "d", java.sql.Date.valueOf(today)));
        UUID a = asm(c, t, "Monthly measures", WAIST, Q_ENERGY, true, today, cycle);
        String token = tokenFor(phone);

        putEntry(token, a.toString(), version(a), "{\"readings\":{\"waist\":82},\"answers\":{},\"complete\":false}").andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM assessment WHERE schedule_id = :s::uuid", Map.of("s", cycle.toString()), Integer.class), "a draft books nothing");
        putEntry(token, a.toString(), version(a), "{\"readings\":{\"waist\":82},\"answers\":{},\"complete\":true}").andExpect(status().isOk());
        var next = jdbc.queryForMap("SELECT id::text, due_on, sent_at, completed_at, name, form::text FROM assessment WHERE schedule_id = :s::uuid AND id <> :a::uuid", Map.of("s", cycle.toString(), "a", a.toString()));
        assertEquals(java.sql.Date.valueOf(today.plusDays(14)), next.get("due_on"));
        assertNull(next.get("sent_at"));
        assertNull(next.get("completed_at"));
        assertEquals("Monthly measures", next.get("name"));
        assertEquals(java.sql.Date.valueOf(today.plusDays(14)), jdbc.queryForObject("SELECT next_due_on FROM assessment_schedule WHERE id = :s::uuid", Map.of("s", cycle.toString()), java.sql.Date.class));
        // the next form is the template's, with the catalogue's labels, and it asks what the template asks
        org.junit.jupiter.api.Assertions.assertTrue(((String) next.get("form")).contains("Waist") && ((String) next.get("form")).contains("q_energy"));
        // not yet theirs: unsent, so it is not on their list
        get(token, "/v1/portal/assessments?state=open").andExpect(jsonPath("$.items", hasSize(0)));

        // an ended cycle books nothing more (the cycle holds one open at a time, so the one just booked goes first)
        jdbc.update("DELETE FROM assessment WHERE schedule_id = :s::uuid AND id <> :a::uuid", Map.of("s", cycle.toString(), "a", a.toString()));
        UUID b = asm(c, t, "Monthly measures", WAIST, "", true, today, cycle);
        jdbc.update("UPDATE assessment_schedule SET ended_at = now() WHERE id = :s::uuid", Map.of("s", cycle.toString()));
        int before = jdbc.queryForObject("SELECT count(*) FROM assessment WHERE schedule_id = :s::uuid", Map.of("s", cycle.toString()), Integer.class);
        putEntry(token, b.toString(), version(b), "{\"readings\":{\"waist\":81},\"answers\":{},\"complete\":true}").andExpect(status().isOk());
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM assessment WHERE schedule_id = :s::uuid", Map.of("s", cycle.toString()), Integer.class));
        // a one-off has no cycle at all
        UUID one = asm(c, t, "One-off", WAIST, "", true, today, null);
        putEntry(token, one.toString(), version(one), "{\"readings\":{\"waist\":80},\"answers\":{},\"complete\":true}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("start one: only the templates the trainer offers and only their own, Continue when one is already waiting; starting makes a sent, open assessment due today — once, whatever the retries")
    void startOne() throws Exception {
        UUID c = live();
        UUID offered = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\"", Q_ENERGY);
        UUID kept = tpl(arun, "Trainer only", false, null, "\"waist\"", "");
        UUID theirs = tpl(divya, "Another trainer's", true, null, "\"waist\"", "");
        String token = tokenFor(phone);

        get(token, "/v1/portal/assessment-templates").andExpect(status().isOk()).andExpect(header().exists("ETag")).andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(offered.toString())).andExpect(jsonPath("$.items[0].systemKey").value("weekly_check_in")).andExpect(jsonPath("$.items[0].asks.measurements").value(1))
                .andExpect(jsonPath("$.items[0].asks.questions").value(1)).andExpect(jsonPath("$.items[0].openAssessmentId").value(nullValue()));

        UUID id = UUID.randomUUID();
        String start = "{\"id\":\"" + id + "\",\"templateId\":\"" + offered + "\"}";
        String made = body(mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(start)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString())).andExpect(jsonPath("$.state").value("open")).andExpect(jsonPath("$.dueOn").value(today.toString())).andExpect(jsonPath("$.late").value(false))
                .andExpect(jsonPath("$.asked.measurements[0].label").value("Body weight")).andExpect(jsonPath("$.asked.questions[0].id").value("q_energy")).andExpect(jsonPath("$.entry.readings").isEmpty()));
        var row = jdbc.queryForMap("SELECT sent_at, completed_at, name, schedule_id FROM assessment WHERE id = :a::uuid", Map.of("a", id.toString()));
        assertNotNull(row.get("sent_at"));
        assertNull(row.get("completed_at"));
        assertNull(row.get("schedule_id"));
        // the same id again, and another id for a template already waiting: one assessment, 200
        mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(start)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + UUID.randomUUID() + "\",\"templateId\":\"" + offered + "\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM assessment WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class));
        get(token, "/v1/portal/assessment-templates").andExpect(jsonPath("$.items[0].openAssessmentId").value(id.toString()));
        get(token, "/v1/portal/assessments?state=open").andExpect(jsonPath("$.items[0].id").value(id.toString()));

        // a template that is not offered, or is another trainer's, or does not exist: one answer
        for (UUID bad : new UUID[]{kept, theirs, UUID.randomUUID()}) {
            mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"id\":\"" + UUID.randomUUID() + "\",\"templateId\":\"" + bad + "\"}")).andExpect(status().isNotFound());
        }
        // an id somebody else holds
        UUID other = liveOther();
        UUID theirsAsm = asm(other, offered, "Theirs", WAIST, "", true, today, null);
        UUID second = tpl(arun, "Second offered", true, null, "\"waist\"", "");
        mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + theirsAsm + "\",\"templateId\":\"" + second + "\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
        mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"x\",\"templateId\":\"" + offered + "\"}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on every assessment route, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        UUID t = tpl(arun, "Weekly check-in", true, "weekly_check_in", "\"weight\"", "");
        UUID a = asm(c, t, "Weekly check-in", WEIGHT, "", true, today, null);
        String token = tokenFor(phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        for (String u : new String[]{"/v1/portal/assessments?state=open", "/v1/portal/assessments/" + a, "/v1/portal/assessment-templates"}) {
            get(token, u).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        }
        putEntry(token, a.toString(), "1", "{\"readings\":{},\"answers\":{},\"complete\":false}").andExpect(status().isForbidden());
        mvc.perform(post("/v1/portal/assessments").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + UUID.randomUUID() + "\",\"templateId\":\"" + t + "\"}")).andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/assessments?state=open")).andExpect(status().isUnauthorized());
    }

    private UUID liveOther2() {
        String p = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", p));
        return liveRow(arun, p);
    }

    private String phoneOf(UUID client) {
        return jdbc.queryForObject("SELECT phone FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class);
    }

    private String tokenFor(String p) throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + p + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(p) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private UUID live() {
        trainerOnce();
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", phone));
        return liveRow(arun, phone);
    }

    private UUID liveOther() {
        return liveRow(arun, "+91980000" + String.format("%04d", 1000 + (++seq)));
    }

    private UUID liveRow(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair' WHERE id = :c::uuid", Map.of("c", id.toString()));
        return id;
    }

    private void trainerOnce() {
        me = arun;
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", arun.toString()), String.class));
    }

    private String token() throws Exception {
        return signInToken();
    }

    private UUID program(UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "c", clientId.toString()));
        return id;
    }

    private UUID workout(UUID prog, int week, int day, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, :d, 0, :n)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "p", prog.toString(), "w", week, "d", day, "n", name));
        return id;
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)", Map.of("id", id.toString(), "n", name, "src", "t-" + id));
        return id;
    }

    private UUID workoutExercise(UUID workout, UUID ex, int pos) {
        UUID id = UUID.randomUUID();
        // one exercise row per call would make four exercises; the test wants one exercise with four sets, so reuse the row after the first
        var found = jdbc.queryForList("SELECT id::text FROM workout_exercise WHERE workout_id = :w::uuid AND exercise_id = :e::uuid", Map.of("w", workout.toString(), "e", ex.toString()), String.class);
        if (!found.isEmpty()) return UUID.fromString(found.getFirst());
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, :p)",
                Map.of("id", id.toString(), "ten", tenant.toString(), "w", workout.toString(), "e", ex.toString(), "p", pos));
        return id;
    }

    private void workoutSet(UUID we, int rest) {
        int pos = jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", we.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, load_value, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, :p, 'weight', 'reps', 20, 10, :r)",
                Map.of("ten", tenant.toString(), "w", we.toString(), "p", pos, "r", rest));
    }

    private UUID session(UUID clientId, UUID workoutId, Instant at, int minutes, String status, String loggedBy, Instant started, Instant ended) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("w", workoutId == null ? null : workoutId.toString());
        m.put("at", java.sql.Timestamp.from(at)); m.put("m", minutes); m.put("e", java.sql.Timestamp.from(at.plusSeconds(minutes * 60L))); m.put("s", status); m.put("lb", loggedBy);
        m.put("st", started == null ? null : java.sql.Timestamp.from(started)); m.put("en", ended == null ? null : java.sql.Timestamp.from(ended));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, CAST(:w AS uuid), :at, :m, :e, :s, :lb, :st, :en)""", m);
        return id;
    }

    private void setDone(UUID sessionId, UUID clientId, UUID ex, int load, int reps, Instant at) {
        UUID sx = UUID.fromString(jdbc.queryForList("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid",
                Map.of("s", sessionId.toString(), "e", ex.toString()), String.class).stream().findFirst().orElseGet(() -> {
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                    Map.of("x", id.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", ex.toString()));
            return id.toString();
        }));
        int pos = jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at) VALUES (:x::uuid, :p, false, 'weight', 'reps', :l, :r, :at)",
                Map.of("x", sx.toString(), "p", pos, "l", load, "r", reps, "at", java.sql.Timestamp.from(at)));
    }

    private UUID message(UUID clientId, String kind, String body, UUID sessionId, Instant at, boolean deleted) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("k", kind); m.put("b", body);
        m.put("s", sessionId == null ? null : sessionId.toString()); m.put("at", java.sql.Timestamp.from(at)); m.put("d", deleted);
        jdbc.update("""
                INSERT INTO client_message (id, tenant_id, client_id, trainer_id, session_id, body, kind, at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, CAST(:s AS uuid), :b, :k, :at, CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    private void pack(UUID clientId, int total, int left) {
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', :tot, :left, 12000, 'INR', current_date, current_date + 60)""",
                Map.of("t", arun.toString(), "c", clientId.toString(), "tot", total, "left", left));
    }

    private void milestone(UUID clientId, String kind, String label, Instant at) {
        jdbc.update("INSERT INTO milestone (tenant_id, client_id, kind, label, at) SELECT tenant_id, id, :k, :l, :at FROM client WHERE id = :c::uuid",
                Map.of("k", kind, "l", label, "at", java.sql.Timestamp.from(at), "c", clientId.toString()));
    }

    private void assessment(UUID clientId, boolean sent, java.time.LocalDate due) {
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
                SELECT gen_random_uuid(), c.tenant_id, c.trainer_id, c.id, t.id, 'Weekly check-in', '{"measurements":[],"questions":[]}'::jsonb, :d::date, now()
                  FROM client c JOIN assessment_template t ON t.trainer_id = c.trainer_id WHERE c.id = :c::uuid LIMIT 1""",
                Map.of("d", due.toString(), "c", clientId.toString()));
    }

    /** The credential verify answers for this number. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private UUID client(UUID trainerId, String p, String membership) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("p", p);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', :p, 'independent')", m);
        if ("invited".equals(membership)) jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
        return id;
    }

    private UUID trainer(String p, String name, String headline) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", p));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", p), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au, "n", name));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (gen_random_uuid(), :t::uuid, 'Weekly')", Map.of("t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender portalAssessmentCapturingSender() {
            return this;
        }

        @Override
        public void send(String phone, String code) {
            sent.put(phone, code);
        }

        String codeFor(String phone) {
            String code = sent.get(phone);
            if (code == null) throw new AssertionError("no code was sent to " + phone);
            return code;
        }
    }
}
