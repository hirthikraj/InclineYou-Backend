package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drafting a nudge ({@code POST /v1/clients/{id}/nudges}) and reading the log ({@code GET /v1/nudges}) on the v1
 * {@code nudge_log}: the trainer's wording with the client's real figures in it, the replay rule, the subject checks
 * the table's own constraint also enforces, the refusals, and who may read what.
 */
@SpringBootTest
@Transactional
class NudgeDraftTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner, other, tenant, client;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("+919100000710", "Anbu Raj");
        other = trainer("+919100000711", "Meera K");
        tenant = tenantOf(owner);
        signedInAs(owner);
        CurrentScope.set(new TenantScope.Scope(null, owner, tenant, List.of(), false));
        client = client(owner, tenant, "Rajalakshmi Venkataraman", "+919876543210");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    private ResultActions draft(UUID clientId, String body) throws Exception {
        return mvc.perform(post("/v1/clients/%s/nudges".formatted(clientId)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    @DisplayName("the drafted message is the trainer's wording with the client's real figures in it, and the link is the wa.me form")
    void rendersTheOverrideWithLiveFigures() throws Exception {
        // ₹12,000 billed, ₹6,000 collected — so ₹6,000 is what the money book would show, and it is what the message must say.
        UUID pkg = packageFor(client, "12000");
        payment(pkg, "6000", "paid");
        mvc.perform(put("/v1/nudge-templates/payment_reminder").header("If-Match", "*").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Hi {name}, {amount} pending on your {package}.\"}"))
                .andExpect(status().isOk());

        draft(client, "{\"template\":\"payment_reminder\",\"packageId\":\"" + pkg + "\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("Hi Rajalakshmi, ₹6,000 pending on your 12 sessions."))
                // The number is normalised to wa.me's form; a malformed one opens WhatsApp on an error page.
                .andExpect(jsonPath("$.whatsappUrl").value(startsWith("https://wa.me/919876543210?text=")));
    }

    @Test
    @DisplayName("the draft is logged with the message and a reason the server derived, and the history reads it back")
    void theLogRecordsWhatWasDrafted() throws Exception {
        draft(client, "{\"template\":\"check_in\"}").andExpect(status().isCreated());

        mvc.perform(get("/v1/nudges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].template").value("check_in"))
                .andExpect(jsonPath("$.items[0].reason").value("lapsed"))
                .andExpect(jsonPath("$.items[0].clientId").value(client.toString()))
                .andExpect(jsonPath("$.items[0].message").doesNotExist())              // opt-in
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(get("/v1/nudges").param("clientId", client.toString()).param("include", "message"))
                .andExpect(jsonPath("$.items[0].message").value(containsString("Rajalakshmi")));
        assertRows(1, "channel = 'whatsapp_manual'");
    }

    @Test
    @DisplayName("a retried id answers 200 from the row it wrote and writes no second one; the same id on another client is a 409")
    void replay() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"template\":\"check_in\"}";
        String first = draft(client, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        draft(client, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.is(jsonField(first, "message"))));
        assertRows(1, "true");

        UUID second = client(owner, tenant, "Irfan Ali", "+919812345678");
        draft(second, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("another trainer cannot read this trainer's follow-up history, even for a client handed over to them")
    void historyIsPerTrainer() throws Exception {
        draft(client, "{\"template\":\"check_in\"}").andExpect(status().isCreated());
        // The client row is handed over — the strongest form of the case: every client-level ownership check now
        // passes, and only the log's own trainer predicate stands.
        jdbc.update("UPDATE client SET trainer_id = :tid::uuid WHERE id = :cid::uuid", Map.of("tid", other.toString(), "cid", client.toString()));
        signedInAs(other);
        mvc.perform(get("/v1/nudges").param("clientId", client.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("a client with no number on file is a 409 CLIENT_NO_PHONE naming them, not a broken wa.me link")
    void aClientWithNoPhoneIsRefused() throws Exception {
        UUID noPhone = client(owner, tenant, "Irfan Ali", null);
        draft(noPhone, "{\"template\":\"check_in\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CLIENT_NO_PHONE"))
                .andExpect(jsonPath("$.detail").value(containsString("Irfan Ali")));
        assertRows(0, "true");
    }

    @Test
    @DisplayName("someone else's client is a 404; an unknown template, a template with no reason yet and a malformed id are 400s")
    void refusals() throws Exception {
        draft(UUID.randomUUID(), "{\"template\":\"check_in\"}").andExpect(status().isNotFound());
        signedInAs(other);
        draft(client, "{\"template\":\"check_in\"}").andExpect(status().isNotFound());
        signedInAs(owner);
        draft(client, "{\"template\":\"invented_by_a_newer_build\"}").andExpect(status().isBadRequest());
        draft(client, "{\"template\":\"session_summary\"}").andExpect(status().isBadRequest());
        draft(client, "{\"template\":\"re_engagement\"}").andExpect(status().isBadRequest());
        draft(client, "{\"id\":\"nope\",\"template\":\"check_in\"}").andExpect(status().isBadRequest());
        assertRows(0, "true");
    }

    @Test
    @DisplayName("a package rides only on a money template and must be this client's; a session only on a session one")
    void subjects() throws Exception {
        UUID pkg = packageFor(client, "9000");
        draft(client, "{\"template\":\"check_in\",\"packageId\":\"" + pkg + "\"}").andExpect(status().isBadRequest());
        draft(client, "{\"template\":\"payment_reminder\",\"sessionId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest());
        UUID theirs = packageFor(client(owner, tenant, "Irfan Ali", "+919812345678"), "9000");
        draft(client, "{\"template\":\"renewal\",\"packageId\":\"" + theirs + "\"}").andExpect(status().isBadRequest());
        draft(client, "{\"template\":\"renewal\",\"packageId\":\"" + pkg + "\"}").andExpect(status().isCreated());
        assertRows(1, "package_id = '" + pkg + "'");
    }

    @Test
    @DisplayName("the figures: no-shows, sessions delivered and days since the last one are each the template's own count")
    void figures() throws Exception {
        session("no_show", 3);
        session("no_show", 5);
        session("done", 9);
        mvc.perform(put("/v1/nudge-templates/missed_session").header("If-Match", "*").contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"{count} missed\"}")).andExpect(status().isOk());
        draft(client, "{\"template\":\"missed_session\"}").andExpect(jsonPath("$.message").value("2 missed"));
        mvc.perform(put("/v1/nudge-templates/check_in").header("If-Match", "*").contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"{days} days\"}")).andExpect(status().isOk());
        draft(client, "{\"template\":\"check_in\"}").andExpect(jsonPath("$.message").value("9 days"));
        // Nothing ever delivered reads as a word, never "0 days".
        draft(client(owner, tenant, "Irfan Ali", "+919812345678"), "{\"template\":\"check_in\"}")
                .andExpect(jsonPath("$.message").value("a few days"));
    }

    @Test
    @DisplayName("the history pages by cursor, newest first, and a window in the future is empty")
    void historyPages() throws Exception {
        for (int i = 0; i < 3; i++) draft(client, "{\"template\":\"check_in\"}").andExpect(status().isCreated());
        String page = mvc.perform(get("/v1/nudges").param("limit", "2")).andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty()).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/v1/nudges").param("limit", "2").param("cursor", jsonField(page, "nextCursor")))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(get("/v1/nudges").param("from", java.time.LocalDate.now().plusDays(2).toString()))
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/v1/nudges").param("include", "everything")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/nudges").param("clientId", "nope")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/nudges").param("from", "yesterday")).andExpect(status().isBadRequest());
    }

    /* ------------------------------------------------------------- fixtures */

    private static String jsonField(String json, String field) {
        var m = java.util.regex.Pattern.compile("\"" + field + "\":\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        if (!m.find()) throw new AssertionError(field + " not in " + json);
        return m.group(1).replace("\\u20b9", "₹");
    }

    private void assertRows(int expected, String where) {
        Integer n = jdbc.queryForObject("SELECT count(*)::int FROM nudge_log WHERE trainer_id = :t::uuid AND " + where,
                Map.of("t", owner.toString()), Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(expected, n);
    }

    private UUID packageFor(UUID clientId, String amount) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (:id::uuid, :t::uuid, :c::uuid, '12 sessions', 'floor', 'sessions', 12, 3,
                        :a, 'INR', current_date, current_date + 60, current_date - 4)""",
                Map.of("id", id.toString(), "t", owner.toString(), "c", clientId.toString(), "a", new BigDecimal(amount)));
        return id;
    }

    private void payment(UUID packageId, String amount, String status) {
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :k::uuid, :a, 'INR', 'trainer', 'cash', :s, CASE WHEN :s = 'paid' THEN now() END)""",
                Map.of("t", owner.toString(), "c", client.toString(), "k", packageId.toString(), "a", new BigDecimal(amount), "s", status));
    }

    private void session(String status, int daysAgo) {
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, cancel_reason)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, now() - make_interval(days => :d), 60, now() - make_interval(days => :d), :s, NULL)""",
                Map.of("t", owner.toString(), "c", client.toString(), "d", daysAgo, "s", status));
    }

    private UUID client(UUID trainerId, UUID tenantId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("t", trainerId.toString());
        p.put("ten", tenantId.toString());
        p.put("n", name);
        p.put("p", phone);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :p, 'independent')", p);
        return id;
    }

    private UUID tenantOf(UUID trainer) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainer.toString()), String.class));
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }

    private void signedInAs(UUID trainerId) {
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", trainerId.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
