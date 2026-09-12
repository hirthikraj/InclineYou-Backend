package com.inclineyou.inclineyou_backend.nudge;

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
 *       {@link com.inclineyou.inclineyou_backend.client.ClientNoteTest}: another trainer sees
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
    @Autowired NudgeService nudgeService;

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

    @Test
    @DisplayName("a trainer who has never opened the library gets the catalogue, marked default")
    void defaultsComeFromTheCatalogue() throws Exception {
        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(NudgeTemplateCatalog.all().size()))
                .andExpect(jsonPath("$[0].name").value("renewal"))
                .andExpect(jsonPath("$[0].isDefault").value(true))
                .andExpect(jsonPath("$[0].label").value("Renewal"))
                /* The variables are on the wire because the web holds no copy of
                   them — the editor prints what comes down here. */
                .andExpect(jsonPath("$[0].variables[0].token").value("{name}"));
    }

    @Test
    @DisplayName("saving a body overrides the default; resetting puts the live default back")
    void saveThenReset() throws Exception {
        mvc.perform(put("/v1/nudge-templates/renewal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Oi {name}, {count} left. Another block?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(false))
                .andExpect(jsonPath("$.body").value("Oi {name}, {count} left. Another block?"));

        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(jsonPath("$[0].isDefault").value(false));

        /* A second save is an upsert, not a conflict — the unique index V32
           declares is what makes that true, and a 409 here means it was dropped. */
        mvc.perform(put("/v1/nudge-templates/renewal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Second thoughts, {name}?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("Second thoughts, {name}?"));

        mvc.perform(delete("/v1/nudge-templates/renewal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(true))
                .andExpect(jsonPath("$.body")
                        .value(NudgeTemplateCatalog.find("renewal").body()));
    }

    @Test
    @DisplayName("an empty body is a refusal with a sentence, not a stored empty message")
    void emptyBodyIsRefused() throws Exception {
        mvc.perform(put("/v1/nudge-templates/renewal")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"   \"}"))
                .andExpect(status().isBadRequest())
                /* The sentence has to reach the trainer, not only the log — the
                   reason `NudgeRuleException` exists rather than
                   `ResponseStatusException`. */
                .andExpect(jsonPath("$.code").value("NUDGE_TEMPLATE_EMPTY"))
                .andExpect(jsonPath("$.detail").exists());
    }

    @Test
    @DisplayName("an unknown template name is refused rather than silently stored")
    void unknownTemplateIsRefused() throws Exception {
        mvc.perform(put("/v1/nudge-templates/birthday")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Happy birthday {name}\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NUDGE_TEMPLATE_UNKNOWN"));
    }

    @Test
    @DisplayName("one trainer's wording is invisible to another")
    void overridesArePerTrainer() throws Exception {
        mvc.perform(put("/v1/nudge-templates/check_in")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Yo {name}\"}"))
                .andExpect(status().isOk());

        signedInAs(other);
        mvc.perform(get("/v1/nudge-templates"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("Yo {name}"))));
    }

    /* ───────────────────────────────────────────────────────── the send ─── */

    @Test
    @DisplayName("the sent message is the trainer's wording with the client's real figures in it")
    void rendersTheOverrideWithLiveFigures() throws Exception {
        // ₹12,000 billed, ₹6,000 collected — so ₹6,000 is what the money book
        // would show, and it is what the message must say.
        var pkg = packageFor(client, "12000", 3, 12);
        payment(pkg, "6000", "paid");

        mvc.perform(put("/v1/nudge-templates/payment_reminder")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Hi {name}, {amount} pending on your {package}.\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/v1/clients/%s/nudge".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateName\":\"payment_reminder\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message")
                        .value("Hi Rajalakshmi, ₹6,000 pending on your 12-session pack."))
                /* The number is normalised to the wa.me form. A malformed one
                   opens WhatsApp on an error page, which reads to the trainer as
                   the app being broken — hence the 422 case below. */
                .andExpect(jsonPath("$.whatsappUrl")
                        .value(org.hamcrest.Matchers.startsWith("https://wa.me/919876543210?text=")));
    }

    @Test
    @DisplayName("the drafted message is stored on the log, and read back by the history")
    void theLogRecordsWhatWasDrafted() throws Exception {
        mvc.perform(post("/v1/clients/%s/nudge".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateName\":\"check_in\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/v1/clients/%s/nudges".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].templateName").value("check_in"))
                /* The LABEL is resolved server-side so a renamed template renames
                   every history at once, and the web holds no copy of it. */
                .andExpect(jsonPath("$[0].templateLabel").value("Check-in"))
                .andExpect(jsonPath("$[0].message")
                        .value(org.hamcrest.Matchers.containsString("Rajalakshmi")));

        // …and across the roster, which is the read Today makes.
        mvc.perform(get("/v1/nudges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].clientName").value("Rajalakshmi Venkataraman"));
    }

    @Test
    @DisplayName("another trainer cannot read this trainer's follow-up history")
    void historyIsPerTrainer() throws Exception {
        mvc.perform(post("/v1/clients/%s/nudge".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateName\":\"check_in\"}"))
                .andExpect(status().isOk());

        /* The client row is handed over — the strongest form of the case, the
           same one `ClientNoteTest` makes: every client-level ownership check now
           passes, and only the log's own trainer predicate stands. */
        jdbc.update("UPDATE client SET trainer_id = :tid::uuid WHERE id = :cid::uuid",
                Map.of("tid", other.toString(), "cid", client.toString()));
        signedInAs(other);

        mvc.perform(get("/v1/clients/%s/nudges".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("a client with no number on file is a 422 naming them, not a broken wa.me link")
    void aClientWithNoPhoneIsRefused() throws Exception {
        var noPhone = client(owner, "Irfan Ali", null);

        mvc.perform(post("/v1/clients/%s/nudge".formatted(noPhone))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateName\":\"check_in\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("NUDGE_NO_PHONE"))
                .andExpect(jsonPath("$.detail")
                        .value(org.hamcrest.Matchers.containsString("Irfan Ali")));
    }

    @Test
    @DisplayName("an unknown template name still drafts something rather than failing the button")
    void unknownTemplateOnSendFallsThrough() throws Exception {
        mvc.perform(post("/v1/clients/%s/nudge".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateName\":\"invented_by_a_newer_build\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("Rajalakshmi")));
    }

    /* ──────────────────────────────────────────────────── the formatting ── */

    @Test
    @DisplayName("the teens take 'th' — 11th, 12th, 13th, 111th")
    void ordinalsHandleTheTeens() {
        assertThat(NudgeService.ordinal(1)).isEqualTo("1st");
        assertThat(NudgeService.ordinal(2)).isEqualTo("2nd");
        assertThat(NudgeService.ordinal(3)).isEqualTo("3rd");
        assertThat(NudgeService.ordinal(11)).isEqualTo("11th");
        assertThat(NudgeService.ordinal(12)).isEqualTo("12th");
        assertThat(NudgeService.ordinal(13)).isEqualTo("13th");
        assertThat(NudgeService.ordinal(21)).isEqualTo("21st");
        assertThat(NudgeService.ordinal(100)).isEqualTo("100th");
        assertThat(NudgeService.ordinal(111)).isEqualTo("111th");
    }

    @Test
    @DisplayName("rupees group the Indian way — ₹1,20,000, never ₹120,000")
    void rupeesUseIndianGrouping() {
        assertThat(NudgeService.rupees(new java.math.BigDecimal("6000"))).isEqualTo("₹6,000");
        assertThat(NudgeService.rupees(new java.math.BigDecimal("120000"))).isEqualTo("₹1,20,000");
        assertThat(NudgeService.rupees(new java.math.BigDecimal("0"))).isEqualTo("₹0");
    }

    @Test
    @DisplayName("an unknown token is left as itself rather than blanked")
    void unknownTokensSurvive() {
        var out = NudgeService.interpolate("Hi {nmae}, {name}", Map.of("{name}", "Meera"));
        assertThat(out).isEqualTo("Hi {nmae}, Meera");
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID packageFor(UUID clientId, String amount, Integer remaining, Integer total) {
        var id = UUID.randomUUID();
        var params = new HashMap<String, Object>();
        params.put("id", id.toString());
        params.put("tid", owner.toString());
        params.put("cid", clientId.toString());
        params.put("amount", new java.math.BigDecimal(amount));
        params.put("remaining", remaining);
        params.put("total", total);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, amount, sessions_remaining,
                                     sessions_total, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :amount, :remaining, :total, 'active')
                """, params);
        return id;
    }

    private void payment(UUID packageId, String amount, String status) {
        var params = new HashMap<String, Object>();
        params.put("tid", owner.toString());
        params.put("cid", client.toString());
        params.put("pid", packageId.toString());
        params.put("amount", new java.math.BigDecimal(amount));
        params.put("status", status);
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, status)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :pid::uuid, :amount, :status)
                """, params);
    }

    private UUID client(UUID trainerId, String name, String phone) {
        var id = UUID.randomUUID();
        var params = new HashMap<String, Object>();
        params.put("id", id.toString());
        params.put("tid", trainerId.toString());
        params.put("name", name);
        params.put("phone", phone);
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone)
                VALUES (:id::uuid, :tid::uuid, :name, :phone)
                """, params);
        return id;
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :name)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone, "name", name));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone",
                Map.of("phone", phone), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
