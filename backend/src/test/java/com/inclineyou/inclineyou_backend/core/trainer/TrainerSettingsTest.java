package com.inclineyou.inclineyou_backend.core.trainer;

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

import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Settings v1.1 — the profile's own wire: ETag and If-Match, strict keys, the consent and setup
 * actions, and the working week's PATCH.
 *
 * <p>What is worth a test is the decision, not the CRUD: a stale write is refused (412) but an
 * unconditional one is not; consent keeps its FIRST date through a retry; setup is stamped once and
 * never un-stamped; a gym cannot outlive the gym floor; and a week edit touches only the weekdays it
 * names.
 */
@SpringBootTest
@Transactional
class TrainerSettingsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties props;

    private MockMvc mvc;
    private UUID me;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100000360");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── ETag / If-Match ──────────────────────────────────────────────────── */

    @Test
    @DisplayName("GET /me carries its version as ETag; the same tag back is a 304")
    void etag() throws Exception {
        String etag = mvc.perform(get("/v1/trainers/me")).andExpect(status().isOk())
                .andExpect(header().exists("ETag")).andExpect(jsonPath("$.version").exists())
                .andReturn().getResponse().getHeader("ETag");
        mvc.perform(get("/v1/trainers/me").header("If-None-Match", etag)).andExpect(status().isNotModified());
    }

    @Test
    @DisplayName("PATCH honours a stale If-Match (412) and goes through without one")
    void ifMatch() throws Exception {
        mvc.perform(patch("/v1/trainers/me").header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceAreas\":[\"Adyar\"]}"))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.code").value("PRECONDITION_FAILED"));

        patchMe("{\"serviceAreas\":[\"Adyar\"]}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("PATCH takes the ETag GET sent back as its If-Match, reach counts and all (20 Nov 2026)")
    void ifMatchTakesTheEtag() throws Exception {
        String etag = mvc.perform(get("/v1/trainers/me")).andReturn().getResponse().getHeader("ETag");
        mvc.perform(patch("/v1/trainers/me").header("If-Match", etag).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceAreas\":[\"Adyar\"]}"))
                .andExpect(status().isOk());
        // A stale tag in the same shape is still a 412 (a later save cannot move updated_at inside this test's one
        // transaction, so the stale one is made by hand).
        mvc.perform(patch("/v1/trainers/me").header("If-Match", "\"1-0-0-0\"").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceAreas\":[\"Besant Nagar\"]}"))
                .andExpect(status().isPreconditionFailed());
        org.junit.jupiter.api.Assertions.assertEquals("\"1790000000000\"",
                TrainerService.versionOfTag("\"1790000000000-3-2-1\""));
        org.junit.jupiter.api.Assertions.assertEquals("W/\"17\"", TrainerService.versionOfTag("W/\"17-0-0-0\""));
        org.junit.jupiter.api.Assertions.assertEquals("\"17\"", TrainerService.versionOfTag("\"17\""));
    }

    @Test
    @DisplayName("a preference is a text of at most 200, a number or true/false — not a nested object or a list (20 Nov 2026)")
    void preferenceValues() throws Exception {
        patchMe("{\"preferences\":{\"restSeconds\":90,\"units\":\"kg\",\"haptics\":true}}").andExpect(status().isOk())
                .andExpect(jsonPath("$.preferences.restSeconds").value(90))
                .andExpect(jsonPath("$.preferences.units").value("kg"));
        patchMe("{\"preferences\":{\"deep\":{\"a\":{\"b\":1}}}}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
        patchMe("{\"preferences\":{\"list\":[1,2,3]}}").andExpect(status().isBadRequest());
        patchMe("{\"preferences\":{\"note\":\"" + "x".repeat(201) + "\"}}").andExpect(status().isBadRequest());
        patchMe("{\"preferences\":{\"note\":\"" + "x".repeat(200) + "\"}}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("acceptPrivacyPolicy and completeSetup are unknown keys on PATCH — an old caller fails loudly")
    void retiredKeys() throws Exception {
        patchMe("{\"acceptPrivacyPolicy\":true}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.errors[0].field").value("acceptPrivacyPolicy"));
        patchMe("{\"completeSetup\":true}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    @DisplayName("headline over 80 and bio over 1200 are PROFILE_TOO_LONG, never truncated")
    void tooLong() throws Exception {
        patchMe("{\"headline\":\"" + "h".repeat(81) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PROFILE_TOO_LONG"));
        patchMe("{\"bio\":\"" + "b".repeat(1201) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PROFILE_TOO_LONG"));
        patchMe("{\"headline\":\"" + "h".repeat(80) + "\"}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("a gym needs gym_floor: dropping the floor clears the gym, naming both is GYM_NEEDS_FLOOR")
    void gymNeedsFloor() throws Exception {
        patchMe("{\"trainingModes\":[\"gym_floor\"],\"gymName\":\"Cult Adyar\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").value("Cult Adyar"));

        patchMe("{\"trainingModes\":[\"online\"]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").value(nullValue()));

        patchMe("{\"trainingModes\":[\"online\"],\"gymName\":\"Cult Adyar\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GYM_NEEDS_FLOOR"));
    }

    /* ── consent ──────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("consent: the notice in force is accepted, a retry keeps the FIRST date, anything else is CONSENT_REQUIRED")
    void consent() throws Exception {
        String inForce = props.getPrivacy().getPolicyVersion();
        mvc.perform(get("/v1/trainers/me")).andExpect(jsonPath("$.privacyAcceptedAt").value(nullValue()));

        mvc.perform(post("/v1/trainers/me/consent").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"policyVersion\":\"old-1999\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        mvc.perform(post("/v1/trainers/me/consent").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));

        String accepted = mvc.perform(post("/v1/trainers/me/consent").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"policyVersion\":\"" + inForce + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.privacyPolicyVersion").value(inForce))
                .andExpect(jsonPath("$.privacyAcceptedAt").isNumber())
                .andReturn().getResponse().getContentAsString();
        Number first = com.jayway.jsonpath.JsonPath.read(accepted, "$.privacyAcceptedAt");

        Thread.sleep(5);
        mvc.perform(post("/v1/trainers/me/consent").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"policyVersion\":\"" + inForce + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.privacyAcceptedAt").value(first.longValue()));
    }

    /* ── setup ────────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("setup/complete stamps once; a second call is 200 with the same instant")
    void setupComplete() throws Exception {
        mvc.perform(get("/v1/trainers/me")).andExpect(jsonPath("$.setupCompletedAt").value(nullValue()));
        String body = mvc.perform(post("/v1/trainers/me/setup/complete")).andExpect(status().isOk())
                .andExpect(jsonPath("$.setupCompletedAt").isNumber())
                .andReturn().getResponse().getContentAsString();
        Number stamp = com.jayway.jsonpath.JsonPath.read(body, "$.setupCompletedAt");
        Thread.sleep(5);
        mvc.perform(post("/v1/trainers/me/setup/complete")).andExpect(status().isOk())
                .andExpect(jsonPath("$.setupCompletedAt").value(stamp.longValue()));
    }

    /* ── the working week ─────────────────────────────────────────────────── */

    @Test
    @DisplayName("PATCH /working-hours replaces only the weekdays it lists; [] is a rest day; same body twice is the same week")
    void workingHoursPartial() throws Exception {
        week("{\"days\":[{\"weekday\":1,\"windows\":[{\"start\":\"06:00\",\"end\":\"11:00\"},{\"start\":\"17:00\",\"end\":\"21:00\"}]},"
                + "{\"weekday\":6,\"windows\":[{\"start\":\"07:00\",\"end\":\"10:00\"}]}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(3));

        // Change Monday only: Saturday must be untouched.
        week("{\"days\":[{\"weekday\":1,\"windows\":[{\"start\":\"05:00\",\"end\":\"09:00\"}]}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
        week("{\"days\":[{\"weekday\":1,\"windows\":[{\"start\":\"05:00\",\"end\":\"09:00\"}]}]}")
                .andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/v1/working-hours")).andExpect(jsonPath("$.items[?(@.weekday==6)].start").value("07:00"));

        // A rest day.
        week("{\"days\":[{\"weekday\":6,\"windows\":[]}]}")
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].weekday").value(1));
    }

    @Test
    @DisplayName("PATCH /working-hours refuses overlaps, backwards windows, bad weekdays and a weekday listed twice — and writes nothing")
    void workingHoursRules() throws Exception {
        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"06:00\",\"end\":\"08:00\"}]}]}").andExpect(status().isOk());

        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"09:00\",\"end\":\"12:00\"},{\"start\":\"11:00\",\"end\":\"13:00\"}]}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"12:00\",\"end\":\"09:00\"}]}]}")
                .andExpect(status().isBadRequest());
        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"09:00\",\"end\":\"09:00\"}]}]}")
                .andExpect(status().isBadRequest());
        week("{\"days\":[{\"weekday\":0,\"windows\":[]}]}").andExpect(status().isBadRequest());
        week("{\"days\":[{\"weekday\":8,\"windows\":[]}]}").andExpect(status().isBadRequest());
        week("{\"days\":[{\"weekday\":3,\"windows\":[]},{\"weekday\":3,\"windows\":[]}]}").andExpect(status().isBadRequest());
        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"6am\",\"end\":\"8am\"}]}]}").andExpect(status().isBadRequest());
        // At most WorkingHoursService.MAX_WINDOWS (8) a day (20 Nov 2026): nine one-hour windows are refused.
        StringBuilder nine = new StringBuilder();
        for (int h = 0; h < 9; h++) nine.append(h == 0 ? "" : ",").append(String.format("{\"start\":\"%02d:00\",\"end\":\"%02d:30\"}", h + 8, h + 8));
        week("{\"days\":[{\"weekday\":2,\"windows\":[" + nine + "]}]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));

        // Touching windows are a split shift, not an overlap — but the earlier refusals changed nothing.
        mvc.perform(get("/v1/working-hours")).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].start").value("06:00"));
        week("{\"days\":[{\"weekday\":2,\"windows\":[{\"start\":\"06:00\",\"end\":\"11:00\"},{\"start\":\"11:00\",\"end\":\"12:00\"}]}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    @DisplayName("GET /working-hours (today-l2): [] for a week never set, then every window as {id, weekday, start, end}, by weekday then start")
    void workingHoursRead() throws Exception {
        // Never answered the hours step: an empty list, not an invented default week.
        mvc.perform(get("/v1/working-hours")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));

        // Saturday listed before Monday, and Monday's evening before its morning: the read must re-sort both.
        week("{\"days\":[{\"weekday\":6,\"windows\":[{\"start\":\"07:00\",\"end\":\"10:00\"}]},"
                + "{\"weekday\":1,\"windows\":[{\"start\":\"17:00\",\"end\":\"21:00\"},{\"start\":\"06:00\",\"end\":\"11:00\"}]}]}")
                .andExpect(status().isOk());

        mvc.perform(get("/v1/working-hours")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].id").isNotEmpty())
                .andExpect(jsonPath("$.items[0].weekday").value(1))
                .andExpect(jsonPath("$.items[0].start").value("06:00"))
                .andExpect(jsonPath("$.items[0].end").value("11:00"))
                .andExpect(jsonPath("$.items[1].weekday").value(1))
                .andExpect(jsonPath("$.items[1].start").value("17:00"))
                .andExpect(jsonPath("$.items[1].end").value("21:00"))
                .andExpect(jsonPath("$.items[2].weekday").value(6))
                .andExpect(jsonPath("$.items[2].start").value("07:00"))
                .andExpect(jsonPath("$.items[2].end").value("10:00"));
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions week(String body) throws Exception {
        return mvc.perform(patch("/v1/working-hours").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :phone",
                Map.of("phone", phone), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }
}
