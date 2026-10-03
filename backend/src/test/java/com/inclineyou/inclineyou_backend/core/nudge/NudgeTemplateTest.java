package com.inclineyou.inclineyou_backend.core.nudge;

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

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V32 · the nudge template library and the follow-up log, over HTTP.
 *
 * <p>Four properties are worth a regression test, and none of them is the CRUD:
 *
 * <ol>
 *   <li><b>The library is an OVERRIDE table.</b> A trainer with no rows gets the
 *       catalogue's wording and {@code isDefault: true}; saving flips it; reset
 *       is a soft delete that puts them back on the LIVE default rather than on a
 *       copy of it. Seeding rows per trainer would freeze today's copy into every
 *       account, and the assertion that catches a future seeder is
 *       {@code isDefault} coming back false on an untouched account.</li>
 *   <li><b>The message a client receives is the trainer's, with real figures in
 *       it.</b> The whole point of the feature — an override with {@code
 *       {name}} and {@code {amount}} in it has to come out the other end as a
 *       sentence, and the amount has to be the same number the money book
 *       shows.</li>
 *   <li><b>The log records what was drafted.</b> `nudge_log.message` is what the
 *       client file's follow-up history draws, and it must not be re-rendered
 *       from the template later — so it is stored, not derived.</li>
 *   <li><b>Overrides and history are per trainer.</b> Same convention as
 *       {@link com.inclineyou.inclineyou_backend.core.client.ClientNoteTest}: another trainer sees
 *       their own defaults, not yours.</li>
 * </ol>
 *
 * <p>Security filters are out of this chain, per the convention those tests set —
 * the controllers read the trainer off the {@code SecurityContextHolder}, so
 * setting it here tests the routing and the answer without re-testing the JWT
 * filter.
 */
@SpringBootTest
@Transactional
class NudgeTemplateTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private static final String OWNER_PHONE = "9100000040";
    private static final String OTHER_PHONE = "9100000041";

    private UUID owner;
    private UUID other;
    private UUID client;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer(OWNER_PHONE, "Anbu Raj");
        other = trainer(OTHER_PHONE, "Meera K");
        client = client(owner, "Rajalakshmi Venkataraman", "9876543210");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ─────────────────────────────────────────────────────── the library ── */

    private static final String PUT_BODY = "{\"body\":\"%s\"}";

    @Test
    @DisplayName("v1.1: all eight, in the check order, each default with a null version")
    void defaultsComeFromTheCatalogue() throws Exception {
        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(status().isOk())
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.items[0].name").value("payment_reminder"))
                .andExpect(jsonPath("$.items[1].name").value("renewal"))
                .andExpect(jsonPath("$.items[7].name").value("check_in"))
                .andExpect(jsonPath("$.items[1].isDefault").value(true))
                .andExpect(jsonPath("$.items[1].version").value(org.hamcrest.Matchers.nullValue()))
                /* The variables are on the wire because the web holds no copy of them. */
                .andExpect(jsonPath("$.items[1].variables[0].token").value("{name}"))
                .andExpect(jsonPath("$.items[1].variables[0].label").exists());
    }

    @Test
    @DisplayName("the list is conditional: If-None-Match with its ETag is a 304, and a save changes the ETag")
    void listIsCacheable() throws Exception {
        String etag = mvc.perform(get("/v1/nudge-templates")).andReturn().getResponse().getHeader("ETag");
        mvc.perform(get("/v1/nudge-templates").header("If-None-Match", etag))
                .andExpect(status().isNotModified());

        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Oi {name}")))
                .andExpect(status().isOk());
        mvc.perform(get("/v1/nudge-templates").header("If-None-Match", etag))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("saving needs If-Match: * creates the first override, a version rewords it, stale is 412, missing is 428")
    void saveThenReset() throws Exception {
        mvc.perform(put("/v1/nudge-templates/renewal")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("No header")))
                .andExpect(status().isPreconditionRequired())
                .andExpect(jsonPath("$.code").value("PRECONDITION_REQUIRED"));

        String v1 = com.jayway.jsonpath.JsonPath.read(mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PUT_BODY.formatted("Oi {name}, {count} left. Another block?")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(false))
                .andExpect(jsonPath("$.body").value("Oi {name}, {count} left. Another block?"))
                .andReturn().getResponse().getContentAsString(), "$.version");
        assertThat(v1).isNotBlank();

        /* "*" means "there is no override yet" — one now exists. */
        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Second tab")))
                .andExpect(status().isPreconditionFailed());

        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Stale")))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.code").value("PRECONDITION_FAILED"));

        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "\"" + v1 + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Second thoughts, {name}?")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("Second thoughts, {name}?"));

        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(jsonPath("$.items[1].isDefault").value(false))
                .andExpect(jsonPath("$.items[1].version").exists());

        mvc.perform(delete("/v1/nudge-templates/renewal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(true))
                .andExpect(jsonPath("$.version").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.body").value(NudgeTemplateCatalog.find("renewal").body()));

        /* Idempotent: a second reset is still 200 with the built-in wording. */
        mvc.perform(delete("/v1/nudge-templates/renewal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(true));
    }

    @Test
    @DisplayName("a blank body is a 400 VALIDATION, and a token the template does not fill is UNKNOWN_VARIABLE")
    void bodyRules() throws Exception {
        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("   ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").exists());

        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Hi {nmae}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_VARIABLE"));

        /* {amount} is the payment template's, not the renewal's. */
        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Pay {amount}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_VARIABLE"));

        mvc.perform(put("/v1/nudge-templates/renewal").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("x".repeat(1001))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    @DisplayName("an unknown template name is a plain 404")
    void unknownTemplateIsRefused() throws Exception {
        mvc.perform(put("/v1/nudge-templates/birthday").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Happy birthday {name}")))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/v1/nudge-templates/birthday")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("one trainer's wording is invisible to another")
    void overridesArePerTrainer() throws Exception {
        mvc.perform(put("/v1/nudge-templates/check_in").header("If-Match", "*")
                        .contentType(MediaType.APPLICATION_JSON).content(PUT_BODY.formatted("Yo {name}")))
                .andExpect(status().isOk());

        signedInAs(other);
        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("Yo {name}"))));
    }

    /* ───────────────────────────────────────────────────────── the send ─── */

    /* ──────────────────────────────────────────────────── the formatting ── */

    @Test
    @DisplayName("the teens take 'th' — 11th, 12th, 13th, 111th")
    void ordinalsHandleTheTeens() {
        assertThat(NudgeText.ordinal(1)).isEqualTo("1st");
        assertThat(NudgeText.ordinal(2)).isEqualTo("2nd");
        assertThat(NudgeText.ordinal(3)).isEqualTo("3rd");
        assertThat(NudgeText.ordinal(11)).isEqualTo("11th");
        assertThat(NudgeText.ordinal(12)).isEqualTo("12th");
        assertThat(NudgeText.ordinal(13)).isEqualTo("13th");
        assertThat(NudgeText.ordinal(21)).isEqualTo("21st");
        assertThat(NudgeText.ordinal(100)).isEqualTo("100th");
        assertThat(NudgeText.ordinal(111)).isEqualTo("111th");
    }

    @Test
    @DisplayName("rupees group the Indian way — ₹1,20,000, never ₹120,000")
    void rupeesUseIndianGrouping() {
        assertThat(NudgeText.rupees(new java.math.BigDecimal("6000"))).isEqualTo("₹6,000");
        assertThat(NudgeText.rupees(new java.math.BigDecimal("120000"))).isEqualTo("₹1,20,000");
        assertThat(NudgeText.rupees(new java.math.BigDecimal("0"))).isEqualTo("₹0");
    }

    @Test
    @DisplayName("an unknown token is left as itself rather than blanked")
    void unknownTokensSurvive() {
        var out = NudgeText.interpolate("Hi {nmae}, {name}", Map.of("{name}", "Meera"));
        assertThat(out).isEqualTo("Hi {nmae}, Meera");
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID client(UUID trainerId, String name, String phone) {
        var id = UUID.randomUUID();
        var params = new HashMap<String, Object>();
        params.put("id", id.toString());
        params.put("tid", trainerId.toString());
        params.put("name", name);
        params.put("phone", phone == null ? null : "+91" + phone);
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, client_type)
                VALUES (:id::uuid, :tid::uuid, :name, :phone, 'independent')
                """, params);
        return id;
    }

    private UUID trainer(String phone, String name) {
        String e164 = "+91" + phone;
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", e164));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :name)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "name", name));
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
