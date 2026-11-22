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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.1 Assessments, end to end over MockMvc: the catalogue, the
 * template shelf and its conditional PUT, one-off assessments, the entry write,
 * and a cycle moving on when its open assessment is finished, skipped or ended.
 */
@SpringBootTest
@Transactional
class AssessmentApiTest {

    private static final String FORM = """
            {"name":"Monthly check","description":null,
             "measurements":{"on":true,"keys":["weight","waist"]},
             "questions":{"on":true,"items":[
               {"id":"q1","text":"Did anything hurt?","kind":"yesno","scale":null,"options":[],"allowMultiple":false,"allowCustom":false},
               {"id":"q2","text":"How was your sleep?","kind":"rating","scale":10,"options":[],"allowMultiple":false,"allowCustom":false},
               {"id":"q3","text":"What got in the way?","kind":"choice","scale":null,
                "options":[{"id":"a","text":"Work"},{"id":"b","text":"Travel"}],"allowMultiple":true,"allowCustom":true}]}}""";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    @Autowired AssessmentService service;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean AssessmentTemplateJdbcRepository templateRepo;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean AssessmentJdbcRepository assessmentRepo;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean AssessmentScheduleJdbcRepository scheduleRepo;
    private MockMvc mvc;
    private UUID me;
    private UUID other;
    private UUID meera;
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100001301");
        other = trainer("+919100001302");
        meera = client(me, "Meera Iyer");
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        // The labels AuthTokenFilter puts on a request's connection; erase_client() (a client delete) checks them.
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true) || set_config('app.tenant_ids', :ids, true)",
                Map.of("t", me.toString(), "ids", "{" + tenant + "}"), String.class);
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    /* ── the catalogue ───────────────────────────────────────────────────── */

    @Test
    @DisplayName("the catalogue leaves out resting heart rate and blood pressure, and answers If-None-Match with 304")
    void catalogue() throws Exception {
        mvc.perform(get("/v1/assessment-catalog")).andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements[*].key", hasItem("weight")))
                .andExpect(jsonPath("$.measurements[*].key", not(hasItem("bp"))))
                .andExpect(jsonPath("$.measurements[*].key", not(hasItem("resting_hr"))))
                .andExpect(jsonPath("$.groups", not(hasItem("Vitals"))))
                .andExpect(jsonPath("$.measurements[?(@.key=='weight')].charted", hasItem(true)))
                .andExpect(jsonPath("$.measurements[?(@.key=='neck')].charted", hasItem(false)))
                .andExpect(header().string("ETag", "\"catalog-" + com.inclineyou.inclineyou_backend.shared.util.ContentTag.of(service.catalog()) + "\""));
        // The tag is the served content's (19 Nov 2026), so it cannot drift from the catalogue the way a hand-bumped date could.
        String etag = mvc.perform(get("/v1/assessment-catalog")).andReturn().getResponse().getHeader("ETag");
        mvc.perform(get("/v1/assessment-catalog").header("If-None-Match", etag)).andExpect(status().isNotModified());
    }

    /* ── templates ───────────────────────────────────────────────────────── */

    @Test
    @DisplayName("a template: 201 then a replayed id is 200, the name is unique, and every bad field is a 400")
    void templateWrites() throws Exception {
        String id = UUID.randomUUID().toString();
        var body = FORM.replaceFirst("\\{", "{\"id\":\"" + id + "\",");
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.liveCycles").value(0)).andExpect(jsonPath("$.version").exists());
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TEMPLATE_NAME_TAKEN"));

        bad(FORM.replace("\"scale\":10", "\"scale\":7").replace("Monthly", "A"), "scale");
        bad(FORM.replace("{\"id\":\"b\",\"text\":\"Travel\"}", "").replace("{\"id\":\"a\",\"text\":\"Work\"},", "{\"id\":\"a\",\"text\":\"Work\"}").replace("Monthly", "B"), "options");
        bad(FORM.replace("\"weight\"", "\"bp\"").replace("Monthly", "C"), "measurements.keys");
        bad(FORM.replace("\"name\":\"Monthly check\"", "\"name\":\" \""), "name");
        bad(FORM.replace("\"description\":null,", "\"description\":null,\"sendNow\":true,"), "sendNow");
    }

    @Test
    @DisplayName("PUT a template is conditional: 428 without If-Match, 412 when stale, and it refreshes assessments nobody has started")
    void templatePut() throws Exception {
        var t = template();
        String id = t.read("$.id"), version = t.read("$.version");
        var giving = give(id, today.toString());
        String a1 = giving.read("$.id");

        mvc.perform(put("/v1/assessment-templates/" + id).contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isPreconditionRequired()).andExpect(jsonPath("$.code").value("PRECONDITION_REQUIRED"));
        mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("PRECONDITION_FAILED"));

        var edited = FORM.replace("Monthly check", "Monthly check v2").replace("\"weight\",\"waist\"", "\"weight\",\"waist\",\"hip\"");
        mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"" + version + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(edited))
                .andExpect(status().isOk()).andExpect(jsonPath("$.measurements.keys.length()").value(3));
        mvc.perform(get("/v1/assessments/" + a1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Monthly check v2"))
                .andExpect(jsonPath("$.measurements.asked").value(3))
                .andExpect(jsonPath("$.asked.measurements[2].label").value("Hips, at the widest"));

        // once something is entered, the assessment keeps the form it is answered against
        String v = saveEntry(a1, """
                {"readings":{"weight":78.4},"answers":{},"complete":false}""", null).andReturn().getResponse().getHeader("ETag");
        assertEquals(true, v != null);
        var again = edited.replace("v2", "v3").replace("\"weight\",\"waist\",\"hip\"", "\"weight\"");
        var current = JsonPath.parse(mvc.perform(get("/v1/assessment-templates")).andReturn().getResponse().getContentAsString())
                .read("$.items[0].version", String.class);
        mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"" + current + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(again)).andExpect(status().isOk());
        mvc.perform(get("/v1/assessments/" + a1)).andExpect(jsonPath("$.name").value("Monthly check v2"))
                .andExpect(jsonPath("$.measurements.asked").value(3));
    }

    @Test
    @DisplayName("deleting a template is 204 twice, ends its live cycles, and a started assessment already given still opens")
    void templateDelete() throws Exception {
        String tpl = template().read("$.id");
        String cycle = cycle(tpl, 28, today.toString()).read("$.id");
        String open = JsonPath.parse(mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString()))
                .andReturn().getResponse().getContentAsString()).read("$.items[0].openAssessmentId");
        mvc.perform(get("/v1/assessment-templates")).andExpect(jsonPath("$.items[0].liveCycles").value(1));
        // Started, so it is kept: since 19 Nov an UNSTARTED open one goes with its cycle (deleteFormEndsCyclesLikeEnd).
        saveEntry(open, """
                {"readings":{"weight":70.0},"answers":{},"complete":false}""", null);

        mvc.perform(delete("/v1/assessment-templates/" + tpl)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/assessment-templates/" + tpl)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString()))
                .andExpect(jsonPath("$.items[0].endedAt").isNumber());
        mvc.perform(get("/v1/assessments/" + open)).andExpect(status().isOk())
                .andExpect(jsonPath("$.template.deleted").value(true)).andExpect(jsonPath("$.asked.questions.length()").value(3));
        mvc.perform(get("/v1/assessments/" + open)).andExpect(jsonPath("$.schedule.id").value(cycle));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\"}")).andExpect(status().isNotFound());
    }

    /* ── one assessment, and the entry write ─────────────────────────────── */

    @Test
    @DisplayName("Take now: create, save a draft, refuse bad entries, finish, then a correction keeps the date")
    void takeNow() throws Exception {
        String tpl = template().read("$.id");
        var made = give(tpl, null);   // dueOn defaults to today
        String id = made.read("$.id");
        assertEquals("booked", made.read("$.state"));
        assertEquals(today.toString(), made.read("$.dueOn"));

        // If-Match is REQUIRED on the entry
        mvc.perform(put("/v1/assessments/" + id + "/entry").contentType(MediaType.APPLICATION_JSON)
                .content("{\"readings\":{},\"answers\":{},\"complete\":false}")).andExpect(status().isPreconditionRequired());

        String version = made.read("$.version");
        // nothing to finish with
        entry(id, version, "{\"readings\":{},\"answers\":{},\"complete\":true}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOTHING_ENTERED"));
        // a key the form never asked, a value out of range, an answer of the wrong kind, a future date
        entry(id, version, "{\"readings\":{\"hip\":90},\"answers\":{},\"complete\":false}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION")).andExpect(jsonPath("$.detail").value("readings.hip: this assessment does not ask for it"));
        entry(id, version, "{\"readings\":{\"weight\":0},\"answers\":{},\"complete\":false}").andExpect(status().isBadRequest());
        entry(id, version, "{\"readings\":{},\"answers\":{\"q2\":{\"rating\":11}},\"complete\":false}").andExpect(status().isBadRequest());
        entry(id, version, "{\"readings\":{},\"answers\":{\"q1\":{\"rating\":3}},\"complete\":false}").andExpect(status().isBadRequest());
        entry(id, version, "{\"readings\":{},\"answers\":{\"q3\":{\"optionIds\":[\"zz\"]}},\"complete\":false}").andExpect(status().isBadRequest());
        entry(id, version, "{\"readings\":{\"weight\":70},\"answers\":{},\"complete\":false,\"completedAt\":" + (System.currentTimeMillis() - 1000) + "}")
                .andExpect(status().isBadRequest());
        entry(id, version, "{\"readings\":{\"weight\":70},\"answers\":{},\"complete\":true,\"completedAt\":" + (System.currentTimeMillis() + 86_400_000L) + "}")
                .andExpect(status().isBadRequest());

        // save for later — the state does not change, and the next save uses the version that came back
        var draft = entry(id, version, "{\"readings\":{\"weight\":78.4},\"answers\":{\"q1\":{\"yes\":false}},\"complete\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("booked"))
                .andExpect(jsonPath("$.measurements.got").value(1)).andExpect(jsonPath("$.questions.got").value(1))
                .andExpect(jsonPath("$.entry.readings.weight").value(78.4)).andReturn();
        String v2 = draft.getResponse().getHeader("ETag").replace("\"", "");
        // a stale version is refused, so a second tab cannot replace the draft. ("1" stands in:
        // this whole test is one transaction, so updated_at — the version — never actually moves.)
        entry(id, "1", "{\"readings\":{\"weight\":1},\"answers\":{},\"complete\":false}").andExpect(status().isPreconditionFailed());

        var done = entry(id, v2, """
                {"readings":{"weight":78.4,"waist":84},
                 "answers":{"q1":{"yes":false},"q2":{"rating":7},"q3":{"optionIds":["a","b"],"text":"a cold"},"q9":{"text":""}},
                 "complete":true}""".replace(",\"q9\":{\"text\":\"\"}", ""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("done"))
                .andExpect(jsonPath("$.enteredBy").value("trainer")).andExpect(jsonPath("$.completedAt").isNumber())
                .andExpect(jsonPath("$.readings.length()").value(2)).andExpect(jsonPath("$.readings[0].charted").value(true))
                .andExpect(jsonPath("$.answers[2].chosen[1]").value("Travel")).andExpect(jsonPath("$.answers[2].answer").value("a cold"))
                .andExpect(jsonPath("$.history[0].key").value("weight")).andExpect(jsonPath("$.returned[0].id").value(id))
                .andReturn();
        long completedAt = ((Number) JsonPath.read(done.getResponse().getContentAsString(), "$.completedAt")).longValue();
        String v3 = done.getResponse().getHeader("ETag").replace("\"", "");

        // a correction stays done, keeps its date, and refuses an empty entry
        entry(id, v3, "{\"readings\":{\"weight\":77.9,\"waist\":84},\"answers\":{},\"complete\":false}").andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("done")).andExpect(jsonPath("$.completedAt").value(completedAt))
                .andExpect(jsonPath("$.readings[0].value").value(77.9));
        String v4 = JsonPath.read(mvc.perform(get("/v1/assessments/" + id)).andReturn().getResponse().getContentAsString(), "$.version");
        entry(id, v4, "{\"readings\":{},\"answers\":{},\"complete\":true}").andExpect(jsonPath("$.code").value("NOTHING_ENTERED"));

        // a done assessment has no date to move
        mvc.perform(patch("/v1/assessments/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dueOn\":\"" + today.plusDays(3) + "\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSESSMENT_COMPLETED"));
        // there is no separate readings read (removed 10 Oct 2026): the assessment itself carries them, corrected above
        mvc.perform(get("/v1/assessments/" + id)).andExpect(jsonPath("$.readings[0].value").value(77.9));
    }

    @Test
    @DisplayName("create: a replayed id is 200, somebody else's client and template are 404, an archived client is 409, sendNow is a no-op without a portal")
    void createRules() throws Exception {
        String tpl = template().read("$.id");
        String id = UUID.randomUUID().toString();
        var body = "{\"id\":\"" + id + "\",\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"dueOn\":\"" + today.plusDays(2) + "\"}";
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());

        UUID theirs = client(other, "Not Mine");
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + theirs + "\",\"templateId\":\"" + tpl + "\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + UUID.randomUUID() + "\"}")).andExpect(status().isNotFound());
        // sendNow is real in 1.2 and, for a client with no portal, a no-op rather than a refusal.
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(id, UUID.randomUUID().toString()).replace("}", ",\"sendNow\":true}")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sentAt").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(id, UUID.randomUUID().toString()).replace("}", ",\"sendNow\":\"yes\"}"))).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"dueOn\":\"soon\"}")).andExpect(status().isBadRequest());

        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :id::uuid",
                Map.of("id", meera.toString()));
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ARCHIVED"));
    }

    @Test
    @DisplayName("another trainer's assessment, template and cycle are 404s")
    void ownership() throws Exception {
        String tpl = template().read("$.id");
        String a = give(tpl, null).read("$.id");
        String s = cycle(tpl, 14, today.plusDays(1).toString()).read("$.id");
        signedInAs(other);
        mvc.perform(get("/v1/assessments/" + a)).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/assessments/" + a)).andExpect(status().isNotFound());
        mvc.perform(put("/v1/assessment-templates/" + tpl).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/v1/assessment-schedules/" + s)).andExpect(status().isNotFound());
        mvc.perform(post("/v1/assessment-schedules/" + s + "/end")).andExpect(status().isNotFound());
        mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString())).andExpect(status().isNotFound());
        mvc.perform(get("/v1/assessment-templates")).andExpect(jsonPath("$.items.length()").value(0));
    }

    /* ── cycles ──────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("a cycle books its first assessment, finishing moves it on from the day it was DONE, and a correction never does")
    void cycleMovesOn() throws Exception {
        String tpl = template().read("$.id");
        String cid = UUID.randomUUID().toString();
        var body = "{\"id\":\"" + cid + "\",\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":28,\"firstDueOn\":\"" + today.plusDays(3) + "\"}";
        var made = mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.templateName").value("Monthly check"))
                .andExpect(jsonPath("$.nextDueOn").value(today.plusDays(3).toString())).andReturn();
        String first = JsonPath.read(made.getResponse().getContentAsString(), "$.openAssessmentId");
        // a replay books nothing more
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.openAssessmentId").value(first));
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE schedule_id = :id::uuid", cid));
        // one live cycle per client and template; an interval outside 1–366 is refused
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(cid, UUID.randomUUID().toString()))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SCHEDULE_LIVE"));
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(cid, UUID.randomUUID().toString()).replace("28", "400"))).andExpect(status().isBadRequest());

        // moving the cycle moves its open assessment; the assessment moving moves the cycle
        mvc.perform(patch("/v1/assessment-schedules/" + cid).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nextDueOn\":\"" + today.plusDays(5) + "\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.nextDueOn").value(today.plusDays(5).toString()));
        mvc.perform(get("/v1/assessments/" + first)).andExpect(jsonPath("$.dueOn").value(today.plusDays(5).toString()));
        mvc.perform(patch("/v1/assessments/" + first).contentType(MediaType.APPLICATION_JSON)
                .content("{\"dueOn\":\"" + today.plusDays(6) + "\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.dueOn").value(today.plusDays(6).toString()));
        mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString()))
                .andExpect(jsonPath("$.items[0].nextDueOn").value(today.plusDays(6).toString()));
        mvc.perform(patch("/v1/assessment-schedules/" + cid).contentType(MediaType.APPLICATION_JSON).content("{\"end\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/v1/assessment-schedules/" + cid).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());

        // finish it, back-dated a week: the cycle moves from the completed day
        long weekAgo = System.currentTimeMillis() - 7 * 86_400_000L;
        String v = JsonPath.read(mvc.perform(get("/v1/assessments/" + first)).andReturn().getResponse().getContentAsString(), "$.version");
        entry(first, v, "{\"readings\":{\"weight\":80},\"answers\":{},\"complete\":true,\"completedAt\":" + weekAgo + "}").andExpect(status().isOk());
        LocalDate completedDay = java.time.Instant.ofEpochMilli(weekAgo).atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
        var cycles = JsonPath.parse(mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString()))
                .andReturn().getResponse().getContentAsString());
        assertEquals(completedDay.plusDays(28).toString(), cycles.read("$.items[0].nextDueOn"));
        String second = cycles.read("$.items[0].openAssessmentId");
        assertEquals(false, first.equals(second));
        mvc.perform(get("/v1/assessments/" + second)).andExpect(jsonPath("$.dueOn").value(completedDay.plusDays(28).toString()))
                .andExpect(jsonPath("$.scheduleId").value(cid)).andExpect(jsonPath("$.asked.measurements.length()").value(2));

        // correcting the finished one books nothing and moves nothing
        String v2 = JsonPath.read(mvc.perform(get("/v1/assessments/" + first)).andReturn().getResponse().getContentAsString(), "$.version");
        entry(first, v2, "{\"readings\":{\"weight\":79},\"answers\":{},\"complete\":true}").andExpect(status().isOk());
        assertEquals(2, count("SELECT count(*) FROM assessment WHERE schedule_id = :id::uuid AND deleted_at IS NULL", cid));

        // deleting the open one SKIPS it: the cycle books the next at due_on + interval
        var skipped = mvc.perform(delete("/v1/assessments/" + second)).andExpect(status().isOk())
                .andExpect(jsonPath("$.next.dueOn").value(completedDay.plusDays(56).toString())).andReturn();
        String third = JsonPath.read(skipped.getResponse().getContentAsString(), "$.next.id");
        // A retry names the same next (19 Nov 2026; it used to answer next: null).
        mvc.perform(delete("/v1/assessments/" + second)).andExpect(status().isOk()).andExpect(jsonPath("$.next.id").value(third));

        // ending stops it: the unstarted open one goes, and ending again is 200 as it is
        mvc.perform(post("/v1/assessment-schedules/" + cid + "/end")).andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").isNumber()).andExpect(jsonPath("$.openAssessmentId").doesNotExist());
        mvc.perform(post("/v1/assessment-schedules/" + cid + "/end")).andExpect(status().isOk());
        mvc.perform(get("/v1/assessments/" + third)).andExpect(status().isNotFound());
        mvc.perform(patch("/v1/assessment-schedules/" + cid).contentType(MediaType.APPLICATION_JSON)
                .content("{\"intervalDays\":7}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SCHEDULE_ENDED"));
        // an ended cycle no longer blocks a new one on the same form
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(cid, UUID.randomUUID().toString()))).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("ending or deleting a cycle keeps an assessment somebody has started, and finishing it books nothing more")
    void startedSurvives() throws Exception {
        String tpl = template().read("$.id");
        String cid = cycle(tpl, 7, today.toString()).read("$.id");
        String open = JsonPath.read(mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString()))
                .andReturn().getResponse().getContentAsString(), "$.items[0].openAssessmentId");
        String v = JsonPath.read(mvc.perform(get("/v1/assessments/" + open)).andReturn().getResponse().getContentAsString(), "$.version");
        entry(open, v, "{\"readings\":{\"weight\":70},\"answers\":{},\"complete\":false}").andExpect(status().isOk());

        mvc.perform(post("/v1/assessment-schedules/" + cid + "/end")).andExpect(status().isOk())
                .andExpect(jsonPath("$.openAssessmentId").value(open));
        String v2 = JsonPath.read(mvc.perform(get("/v1/assessments/" + open)).andReturn().getResponse().getContentAsString(), "$.version");
        entry(open, v2, "{\"readings\":{\"weight\":70},\"answers\":{},\"complete\":true}").andExpect(status().isOk());
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE schedule_id = :id::uuid AND deleted_at IS NULL", cid));

        mvc.perform(delete("/v1/assessment-schedules/" + cid)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/assessment-schedules/" + cid)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString())).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/v1/assessments/" + open)).andExpect(status().isOk()).andExpect(jsonPath("$.schedule").doesNotExist());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("deleting a client deletes their assessments, done ones too, and their cycles: nothing is left in the list")
    void clientDeleteTakesAssessments() throws Exception {
        String tpl = template().read("$.id");
        String done = give(tpl, today.toString()).read("$.id");
        saveEntry(done, "{\"readings\":{\"weight\":78.4},\"answers\":{},\"complete\":true}", null);
        String open = give(tpl, today.minusDays(2).toString()).read("$.id");
        cycle(tpl, 28, today.plusDays(3).toString());

        // Archive first: delete is only offered for an archived client (CLIENT_NOT_ARCHIVED otherwise).
        mvc.perform(post("/v1/clients/" + meera + "/archive").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"moved_away\"}")).andExpect(status().isOk());
        mvc.perform(post("/v1/clients/" + meera + "/delete").contentType(MediaType.APPLICATION_JSON)
                .content("{\"confirmName\":\"Meera Iyer\"}")).andExpect(status().isOk());

        assertEquals(0, count("SELECT count(*) FROM assessment WHERE client_id = :id::uuid AND deleted_at IS NULL", meera.toString()));
        assertEquals(0, count("SELECT count(*) FROM assessment_schedule WHERE client_id = :id::uuid AND deleted_at IS NULL", meera.toString()));
        mvc.perform(get("/v1/assessments").param("includeTotal", "true")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.grandTotal").value(0));
        mvc.perform(get("/v1/assessments/" + done)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/assessments/" + open)).andExpect(status().isNotFound());
        // the client is gone, so their cycles are not there to read at all
        mvc.perform(get("/v1/assessment-schedules").param("clientId", meera.toString())).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a reading's floor is the measurement's: 0 push-ups and a negative sit-and-reach are results, a 0 kg weight is not")
    void readingBounds() throws Exception {
        String tpl = JsonPath.read(mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Fitness test","description":null,
                         "measurements":{"on":true,"keys":["weight","pushups","plank","ohs","sit_reach"]},
                         "questions":{"on":false,"items":[]}}"""))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String id = give(tpl, today.toString()).read("$.id");

        // the take screen is told each floor, so it need not know the rule itself
        mvc.perform(get("/v1/assessments/" + id))
                .andExpect(jsonPath("$.asked.measurements[?(@.key=='weight')].minInclusive").value(org.hamcrest.Matchers.contains(false)))
                .andExpect(jsonPath("$.asked.measurements[?(@.key=='pushups')].minInclusive").value(org.hamcrest.Matchers.contains(true)))
                .andExpect(jsonPath("$.asked.measurements[?(@.key=='sit_reach')].min").value(org.hamcrest.Matchers.contains(-100000)));
        mvc.perform(get("/v1/assessment-catalog"))
                .andExpect(jsonPath("$.measurements[?(@.key=='ohs')].min").value(org.hamcrest.Matchers.contains(0)))
                .andExpect(jsonPath("$.measurements[?(@.key=='ohs')].minInclusive").value(org.hamcrest.Matchers.contains(true)));

        entry(id, version(id), "{\"readings\":{\"weight\":0},\"answers\":{},\"complete\":false}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("readings.weight: must be above 0 and below 100,000"));
        entry(id, version(id), "{\"readings\":{\"pushups\":-1},\"answers\":{},\"complete\":false}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("readings.pushups: must be 0 or more and below 100,000"));
        entry(id, version(id), "{\"readings\":{\"sit_reach\":-100000},\"answers\":{},\"complete\":false}")
                .andExpect(status().isBadRequest());

        // and past the service, the database's own check (V28) takes them too
        entry(id, version(id), "{\"readings\":{\"weight\":71.5,\"pushups\":0,\"plank\":0,\"ohs\":0,\"sit_reach\":-4.5},\"answers\":{},\"complete\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("done"))
                .andExpect(jsonPath("$.entry.readings.pushups").value(0))
                .andExpect(jsonPath("$.entry.readings.sit_reach").value(-4.5));
        assertEquals(-4.5, jdbc.queryForObject("SELECT (readings->>'sit_reach')::numeric FROM assessment WHERE id = :id::uuid",
                Map.of("id", id), Double.class));
    }

    @Test
    @DisplayName("completedAt may be back-dated up to a year, never to 1970 and never so far back the database cannot hold it")
    void backDateFloor() throws Exception {
        String tpl = template().read("$.id");
        String body = "{\"readings\":{\"weight\":70},\"answers\":{},\"complete\":true,\"completedAt\":%d}";
        for (long at : new long[]{0L, -99999999999999999L,
                java.time.Instant.now().minus(java.time.Duration.ofDays(400)).toEpochMilli()}) {
            String id = give(tpl, today.toString()).read("$.id");
            entry(id, version(id), body.formatted(at)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value("completedAt: at most a year back"));
        }
        String id = give(tpl, today.toString()).read("$.id");
        long monthAgo = java.time.Instant.now().minus(java.time.Duration.ofDays(30)).toEpochMilli();
        entry(id, version(id), body.formatted(monthAgo)).andExpect(status().isOk()).andExpect(jsonPath("$.completedAt").value(monthAgo));
    }

    @Test
    @DisplayName("GET one: the ETag is the whole answer's, so a repeat is 304 and a change outside the row (the client) is a fresh 200")
    void detailEtagIsTheWholeAnswer() throws Exception {
        String id = give(template().read("$.id"), today.toString()).read("$.id");
        var first = mvc.perform(get("/v1/assessments/" + id)).andExpect(status().isOk()).andReturn().getResponse();
        String etag = first.getHeader("ETag");
        String version = JsonPath.read(first.getContentAsString(), "$.version");
        org.junit.jupiter.api.Assertions.assertNotEquals("\"" + version + "\"", etag, "not the row's version");
        mvc.perform(get("/v1/assessments/" + id).header("If-None-Match", etag)).andExpect(status().isNotModified());

        // Nothing on the assessment row moved; the answer did.
        jdbc.update("UPDATE client SET name = 'Meera I.' WHERE id = :c::uuid", Map.of("c", meera.toString()));
        mvc.perform(get("/v1/assessments/" + id).header("If-None-Match", etag)).andExpect(status().isOk())
                .andExpect(jsonPath("$.client.name").value("Meera I."))
                .andExpect(jsonPath("$.version").value(version));
    }

    @Test
    @DisplayName("the shelf's ETag is its whole content: a repeat is 304; a new form makes the old tag miss")
    void shelfEtag() throws Exception {
        template();
        String etag = mvc.perform(get("/v1/assessment-templates")).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        assertEquals(26, etag.length(), "a 12-byte SHA-256 prefix in quotes, not a 32-bit hashCode: " + etag);
        mvc.perform(get("/v1/assessment-templates").header("If-None-Match", etag)).andExpect(status().isNotModified());
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON)
                .content(FORM.replaceFirst("\"name\"\\s*:\\s*\"[^\"]*\"", "\"name\":\"Second form\""))).andExpect(status().isCreated());
        mvc.perform(get("/v1/assessment-templates").header("If-None-Match", etag)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("a trainer's live forms are capped at 100: the 101st is 409 TEMPLATE_LIMIT; a deleted one frees a place")
    void formCap() throws Exception {
        for (int n = 0; n < AssessmentTemplateService.MAX_FORMS; n++) {
            jdbc.update("""
                    INSERT INTO assessment_template (id, trainer_id, name, measurements, questions)
                    VALUES (gen_random_uuid(), :t::uuid, :n, '{"on":true,"keys":["weight"]}', '{"on":false,"items":[]}')""",
                    Map.of("t", me.toString(), "n", "Form " + n));
        }
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TEMPLATE_LIMIT"));
        jdbc.update("UPDATE assessment_template SET deleted_at = now() WHERE trainer_id = :t::uuid AND name = 'Form 0'",
                Map.of("t", me.toString()));
        template();
    }

    @Test
    @DisplayName("a form double-tapped with one id: the first lookup misses the first request, and the answer is that form (200), not 409")
    void formDoubleTap() throws Exception {
        UUID id = UUID.randomUUID();
        String body = FORM.replaceFirst("\\{", "{\"id\":\"" + id + "\",");
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        // The second request's first lookup ran before the first committed.
        org.mockito.Mockito.doReturn(java.util.Optional.empty()).doCallRealMethod().when(templateRepo).isMine(id, me);
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
    }

    @Test
    @DisplayName("PUT a template that changes neither name nor form (a description edit) leaves unstarted assessments untouched")
    void templatePutLeavesSameFormAlone() throws Exception {
        var t = template();
        String id = t.read("$.id"), version = t.read("$.version");
        String a1 = give(id, today.toString()).read("$.id");
        // A row's physical address moves on every rewrite, even inside this one transaction, where now() — and so the
        // version — cannot.
        String before = jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :id::uuid", Map.of("id", a1), String.class);
        String described = mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"" + version + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(FORM.replace("\"description\":null", "\"description\":\"Once a month\"")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(before, jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :id::uuid", Map.of("id", a1), String.class),
                "a description edit does not rewrite the assessment");

        mvc.perform(put("/v1/assessment-templates/" + id).header("If-Match", "\"" + JsonPath.read(described, "$.version") + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(FORM.replace("Monthly check", "Monthly check v2"))).andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertNotEquals(before,
                jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :id::uuid", Map.of("id", a1), String.class),
                "a renamed form does");
    }

    @Test
    @DisplayName("deleting a form ends its cycles as POST …/end does: each cycle's unstarted open assessment goes; a started one stays")
    void deleteFormEndsCyclesLikeEnd() throws Exception {
        String tpl = template().read("$.id");
        cycle(tpl, 7, today.toString());
        UUID asha = client(me, "Asha");
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + asha + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":7,\"firstDueOn\":\"" + today + "\"}"))
                .andExpect(status().isCreated());
        String ashaOpen = jdbc.queryForObject("SELECT id::text FROM assessment WHERE client_id = :c::uuid AND deleted_at IS NULL",
                Map.of("c", asha.toString()), String.class);
        saveEntry(ashaOpen, """
                {"readings":{"weight":61.0},"answers":{},"complete":false}""", null);   // Asha has started hers

        mvc.perform(delete("/v1/assessment-templates/" + tpl)).andExpect(status().isNoContent());
        assertEquals(0, count("SELECT count(*) FROM assessment WHERE client_id = :id::uuid AND deleted_at IS NULL", meera.toString()),
                "Meera's unstarted one goes with the cycle");
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE id = :id::uuid AND deleted_at IS NULL", ashaOpen),
                "Asha's started one stays");
    }

    @Test
    @DisplayName("give: dueOn within 3 months of today either way; a double tap with one id answers the first (200), not 409")
    void giveRules() throws Exception {
        String tpl = template().read("$.id");
        for (String due : new String[]{"1900-01-01", "2999-12-31", today.plusMonths(4).toString()}) {
            mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"dueOn\":\"" + due + "\"}"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("dueOn")));
        }
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"dueOn\":\""
                + today.plusMonths(2) + "\",\"sendNow\":false}";
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        // The second tap's lookup ran before the first committed.
        org.mockito.Mockito.doReturn(java.util.Optional.empty()).doCallRealMethod().when(assessmentRepo).isMine(id, me, meera);
        mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE client_id = :id::uuid AND deleted_at IS NULL", meera.toString()));
    }

    @Test
    @DisplayName("start a cycle: firstDueOn within 3 months either way; a double tap meeting its own live cycle answers it (200), not 409")
    void cycleRules() throws Exception {
        String tpl = template().read("$.id");
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":7,\"firstDueOn\":\"1900-01-01\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("firstDueOn")));
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl
                + "\",\"intervalDays\":7,\"firstDueOn\":\"" + today + "\"}";
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        // The second tap's first lookup ran before the first committed; it then meets the live cycle the first made.
        org.mockito.Mockito.doReturn(java.util.Optional.empty()).doCallRealMethod().when(scheduleRepo).isMine(id, me);
        mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        assertEquals(1, count("SELECT count(*) FROM assessment WHERE client_id = :id::uuid AND deleted_at IS NULL", meera.toString()),
                "one first assessment, not two");
    }

    @Test
    @DisplayName("re-pace a cycle: nextDueOn within 3 months; the same date leaves the open assessment untouched, a new one moves it")
    void cyclePatchRules() throws Exception {
        String tpl = template().read("$.id");
        var c = cycle(tpl, 7, today.toString());
        String id = c.read("$.id"), version = c.read("$.version");
        String open = jdbc.queryForObject("SELECT id::text FROM assessment WHERE schedule_id = :s::uuid AND deleted_at IS NULL",
                Map.of("s", id), String.class);
        mvc.perform(patch("/v1/assessment-schedules/" + id).header("If-Match", "\"" + version + "\"").contentType(MediaType.APPLICATION_JSON)
                .content("{\"nextDueOn\":\"2999-12-31\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("nextDueOn")));
        String before = jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :i::uuid", Map.of("i", open), String.class);
        mvc.perform(patch("/v1/assessment-schedules/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nextDueOn\":\"" + today + "\"}")).andExpect(status().isOk());
        assertEquals(before, jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :i::uuid", Map.of("i", open), String.class),
                "the same date does not rewrite the open assessment");
        mvc.perform(patch("/v1/assessment-schedules/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nextDueOn\":\"" + today.plusDays(3) + "\"}")).andExpect(status().isOk());
        assertEquals(today.plusDays(3).toString(), jdbc.queryForObject("SELECT due_on::text FROM assessment WHERE id = :i::uuid",
                Map.of("i", open), String.class));
    }

    @Test
    @DisplayName("move: dueOn within 3 months; the same date leaves the row untouched")
    void moveRules() throws Exception {
        String id = give(template().read("$.id"), today.toString()).read("$.id");
        mvc.perform(patch("/v1/assessments/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dueOn\":\"1900-01-01\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("dueOn")));
        String before = jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :i::uuid", Map.of("i", id), String.class);
        mvc.perform(patch("/v1/assessments/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dueOn\":\"" + today + "\"}"))
                .andExpect(status().isOk());
        assertEquals(before, jdbc.queryForObject("SELECT ctid::text FROM assessment WHERE id = :i::uuid", Map.of("i", id), String.class));
        mvc.perform(patch("/v1/assessments/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"dueOn\":\"" + today.plusDays(5) + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.dueOn").value(today.plusDays(5).toString()));
    }

    @Test
    @DisplayName("skip: an overdue cycle's next is booked no earlier than today; a retried DELETE answers that same next")
    void skipRules() throws Exception {
        String tpl = template().read("$.id");
        String cycle = cycle(tpl, 28, today.minusDays(80).toString()).read("$.id");
        String open = jdbc.queryForObject("SELECT id::text FROM assessment WHERE schedule_id = :s::uuid AND deleted_at IS NULL",
                Map.of("s", cycle), String.class);
        String first = mvc.perform(delete("/v1/assessments/" + open)).andExpect(status().isOk())
                .andExpect(jsonPath("$.next.dueOn").value(today.toString()))      // not 52 days ago
                .andReturn().getResponse().getContentAsString();
        String next = JsonPath.read(first, "$.next.id");
        mvc.perform(delete("/v1/assessments/" + open)).andExpect(status().isOk())
                .andExpect(jsonPath("$.next.id").value(next));                      // the retry names the same one
    }

    private String version(String assessmentId) throws Exception {
        return JsonPath.read(mvc.perform(get("/v1/assessments/" + assessmentId)).andReturn().getResponse().getContentAsString(), "$.version");
    }

    private void bad(String body, String field) throws Exception {
        mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString(field)));
    }

    private com.jayway.jsonpath.DocumentContext template() throws Exception {
        return JsonPath.parse(mvc.perform(post("/v1/assessment-templates").contentType(MediaType.APPLICATION_JSON).content(FORM))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private com.jayway.jsonpath.DocumentContext give(String tpl, String dueOn) throws Exception {
        String due = dueOn == null ? "" : ",\"dueOn\":\"" + dueOn + "\"";
        return JsonPath.parse(mvc.perform(post("/v1/assessments").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\"" + due + "}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private com.jayway.jsonpath.DocumentContext cycle(String tpl, int days, String first) throws Exception {
        return JsonPath.parse(mvc.perform(post("/v1/assessment-schedules").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + meera + "\",\"templateId\":\"" + tpl + "\",\"intervalDays\":" + days
                                + ",\"firstDueOn\":\"" + first + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions entry(String id, String version, String body) throws Exception {
        return mvc.perform(put("/v1/assessments/" + id + "/entry").header("If-Match", "\"" + version + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** A PUT that must succeed; returns the actions for the ETag. */
    private ResultActions saveEntry(String id, String body, String version) throws Exception {
        String v = version != null ? version
                : JsonPath.read(mvc.perform(get("/v1/assessments/" + id)).andReturn().getResponse().getContentAsString(), "$.version");
        return entry(id, v, body).andExpect(status().isOk());
    }

    private int count(String sql, String id) {
        return jdbc.queryForObject(sql, Map.of("id", id), Integer.class);
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        // Consented (22 Nov 2026): ConsentGate refuses a third session, notes, the profile and health data without it.
        // Consented but off the portal, so nothing is sent and every assessment here stays in person — what these
        // tests were written against, before consent became a condition of any assessment.
        jdbc.update("UPDATE client SET membership_status = 'removed', invited_at = now(), accepted_at = now(), removed_at = now(), removed_by = 'trainer' WHERE id = :id::uuid",
                Map.of("id", id.toString()));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, :p FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
