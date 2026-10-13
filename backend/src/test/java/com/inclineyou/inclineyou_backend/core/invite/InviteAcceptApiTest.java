package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.auth.OtpSender;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, inv-a3: "Let me in". Runs through the REAL security chain, because the point of the route is that it is open to
 * somebody with no session — and pins the order that makes that safe: a dead link before the code, the code for the invited
 * number and no other, the account only after both, one transaction, and a replay that is a replay and not a second chance.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(InviteAcceptApiTest.CapturingSender.class)
@Transactional
class InviteAcceptApiTest {

    private static final String PHONE = "+919841022119";
    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc trainerMvc;
    private MockMvc publicMvc;
    private UUID me, client;
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        me = trainer("+919100002301", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        trainerMvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        publicMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        UUID tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = client(me, "Priya Nair", PHONE);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("201: the account is made in one go — client accepted with the date and notice, a client login, prefs, the invite used — and a client web session comes back")
    void letMeIn() throws Exception {
        String token = mint();
        String body = accept(token, codeFor(token), dob(30), "2026-09").andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("client")).andExpect(jsonPath("$.isNewUser").value(true))
                .andExpect(jsonPath("$.access").value("active"))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.pendingInvites.length()").value(0))
                .andExpect(jsonPath("$.sessionId").isString()).andExpect(jsonPath("$.expiresAt").isNumber())
                .andReturn().getResponse().getContentAsString();
        String session = JsonPath.read(body, "$.token");
        assertTrue(session.startsWith("xs_"), "a revocable web session, not a JWT");
        assertFalse(body.contains("919841022119"), "the number is not echoed");
        assertFalse(body.contains(client.toString()), "no client id either: nothing in the portal is addressed by it");

        var c = jdbc.queryForMap("SELECT membership_status, accepted_at IS NOT NULL AS at, date_of_birth::text AS dob, accepted_policy_version AS pv FROM client WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertEquals("accepted", c.get("membership_status"));
        assertEquals(true, c.get("at"));
        assertEquals(dob(30), c.get("dob"));
        assertEquals("2026-09", c.get("pv"));
        assertEquals("client", jdbc.queryForObject("SELECT role FROM app_user WHERE phone = :p", Map.of("p", PHONE), String.class));
        assertEquals(1, count("SELECT count(*) FROM client_prefs WHERE client_id = :c::uuid"));
        assertEquals("accepted", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));

        var s = jdbc.queryForMap("SELECT s.role, u.phone, s.active_tenant_id IS NULL AS no_ws FROM web_session s JOIN app_user u ON u.id = s.app_user_id ORDER BY s.issued_at DESC LIMIT 1", Map.of());
        assertEquals("client", s.get("role"));
        assertEquals(PHONE, s.get("phone"));
        assertEquals(true, s.get("no_ws"), "a client belongs to no workspace");
    }

    @Test
    @DisplayName("a double tap is a replay: 200, a fresh session, nothing made twice — and only for the code that did it, just now")
    void replay() throws Exception {
        String token = mint();
        String req = send(token);
        String code = sender.codeFor(PHONE);
        String first = acceptWith(token, req, code, dob(30), "2026-09").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String second = acceptWith(token, req, code, dob(30), "2026-09").andExpect(status().isOk())
                .andExpect(jsonPath("$.isNewUser").value(false)).andReturn().getResponse().getContentAsString();
        assertNotEquals(JsonPath.<String>read(first, "$.token"), JsonPath.<String>read(second, "$.token"));
        assertEquals(1, count("SELECT count(*) FROM client_prefs WHERE client_id = :c::uuid"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client WHERE membership_status = 'accepted' AND phone = :p", Map.of("p", PHONE), Integer.class));

        // Somebody else holding the used-up link, with a code of their own for the same number, is not a replay.
        // (A used link sends no new code, so the code comes the ordinary sign-in way.)
        publicMvc.perform(MockMvcRequestBuilders.post("/v1/invites/" + token + "/code").contentType(MediaType.APPLICATION_JSON)
                .content("{\"dateOfBirth\":\"" + dob(30) + "\",\"policyVersion\":\"2026-09\"}")).andExpect(status().isUnprocessableEntity());
        String again = JsonPath.read(publicMvc.perform(MockMvcRequestBuilders.post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + PHONE + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        acceptWith(token, again, sender.codeFor(PHONE), dob(30), "2026-09").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        // And the original request, once its two minutes are up, no longer counts either.
        jdbc.update("UPDATE otp_request SET created_at = now() - interval '10 minutes', consumed_at = now() - interval '5 minutes' WHERE id = :i::uuid", Map.of("i", req));
        acceptWith(token, req, code, dob(30), "2026-09").andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("a wrong code is 401 OTP_WRONG with attempts left and makes nothing: no account, no session, the invite still pending")
    void wrongCode() throws Exception {
        String token = mint();
        String req = send(token);
        String right = sender.codeFor(PHONE);
        String wrong = right.equals("000000") ? "111111" : "000000";
        acceptWith(token, req, wrong, dob(30), "2026-09").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("OTP_WRONG")).andExpect(jsonPath("$.attemptsLeft").isNumber());
        assertNothingMade();
        acceptWith(token, req, right, dob(30), "2026-09").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("somebody else's request id is 404 and their code is not looked at: only a code sent to THIS invite's number proves it")
    void otherNumbersRequest() throws Exception {
        String token = mint();
        String theirs = JsonPath.read(publicMvc.perform(MockMvcRequestBuilders.post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"+919876500001\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        acceptWith(token, theirs, sender.codeFor("+919876500001"), dob(30), "2026-09").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("OTP_REQUEST_NOT_FOUND"));
        assertNull(jdbc.queryForObject("SELECT consumed_at::text FROM otp_request WHERE id = :i::uuid", Map.of("i", theirs), String.class), "their code was not spent");
        assertNothingMade();
    }

    @Test
    @DisplayName("a dead link is 422 INVITE_UNAVAILABLE before any code is looked at, so it spends nobody's attempts")
    void deadLinkSpendsNothing() throws Exception {
        String token = mint();
        String req = send(token);
        String code = sender.codeFor(PHONE);
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE client_id = :c::uuid", Map.of("c", client.toString()));
        acceptWith(token, req, "000000", dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        acceptWith("A".repeat(43), req, "000000", dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        acceptWith("short", req, "000000", dob(30), "2026-09").andExpect(status().isUnprocessableEntity());
        assertNull(jdbc.queryForObject("SELECT consumed_at::text FROM otp_request WHERE id = :i::uuid", Map.of("i", req), String.class));
        assertEquals(code, sender.codeFor(PHONE));
    }

    @Test
    @DisplayName("400 before the code is spent: a stale notice, a future or pre-1900 date, a malformed code — and the header must say web")
    void validation() throws Exception {
        String token = mint();
        String req = send(token);
        String code = sender.codeFor(PHONE);
        acceptWith(token, req, code, dob(30), "old").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        acceptWith(token, req, code, today.plusDays(1).toString(), "2026-09").andExpect(status().isBadRequest());
        acceptWith(token, req, code, "1899-12-31", "2026-09").andExpect(status().isBadRequest());
        acceptWith(token, req, "12345", dob(30), "2026-09").andExpect(status().isBadRequest());
        publicMvc.perform(MockMvcRequestBuilders.post("/v1/invites/" + token + "/accept").contentType(MediaType.APPLICATION_JSON)
                .content(json(req, code, dob(30), "2026-09"))).andExpect(status().isBadRequest());
        assertNull(jdbc.queryForObject("SELECT consumed_at::text FROM otp_request WHERE id = :i::uuid", Map.of("i", req), String.class), "none of that spent the code");
        assertNothingMade();
    }

    @Test
    @DisplayName("under 18 at accept is terminal: 422 AGE_REQUIREMENT, the invite declined for the trainer to see, the link dead from now on")
    void underEighteenIsTerminal() throws Exception {
        String token = mint();
        acceptWith(token, send(token), sender.codeFor(PHONE), today.minusYears(17).toString(), "2026-09").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("AGE_REQUIREMENT"));
        assertEquals("declined", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals("age_requirement", jdbc.queryForObject("SELECT decline_reason FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals("declined", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM app_user WHERE phone = :p", Map.of("p", PHONE), Integer.class));
        publicMvc.perform(get("/v1/invites/" + token)).andExpect(jsonPath("$.state").value("expired"));
    }

    @Test
    @DisplayName("one client, one trainer: a number already accepted by another trainer is 409 after the code, and the invite stays pending")
    void alreadyWithATrainer() throws Exception {
        UUID other = trainer("+919100002302", "Other Coach");
        UUID otherClient = client(other, "Priya Elsewhere", PHONE);
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", otherClient.toString()));
        String token = mint();
        acceptWith(token, send(token), sender.codeFor(PHONE), dob(30), "2026-09").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_WITH_A_TRAINER"));
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
    }

    @Test
    @DisplayName("a number that is a trainer's cannot become a client, and the client is not told why: 422 INVITE_UNAVAILABLE")
    void trainerNumber() throws Exception {
        String token = mint();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer')", Map.of("p", PHONE));
        acceptWith(token, send(token), sender.codeFor(PHONE), dob(30), "2026-09").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
    }

    @Test
    @DisplayName("the client session is not a trainer's: it cannot reach a trainer route")
    void sessionIsNotATrainers() throws Exception {
        String token = mint();
        String session = JsonPath.read(accept(token, codeFor(token), dob(30), "2026-09").andReturn().getResponse().getContentAsString(), "$.token");
        publicMvc.perform(get("/v1/clients").header("Authorization", "Bearer " + session).header(WEB, "web")).andExpect(status().isForbidden());
        publicMvc.perform(get("/v1/me").header("Authorization", "Bearer " + session).header(WEB, "web")).andExpect(status().isForbidden());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private ResultActions accept(String token, String requestAndCode, String dob, String version) throws Exception {
        String[] rc = requestAndCode.split("\\|");
        return acceptWith(token, rc[0], rc[1], dob, version);
    }

    private ResultActions acceptWith(String token, String requestId, String code, String dob, String version) throws Exception {
        return publicMvc.perform(MockMvcRequestBuilders.post("/v1/invites/" + token + "/accept").header(WEB, "web")
                .contentType(MediaType.APPLICATION_JSON).content(json(requestId, code, dob, version)));
    }

    private static String json(String requestId, String code, String dob, String version) {
        return "{\"requestId\":\"" + requestId + "\",\"otp\":\"" + code + "\",\"dateOfBirth\":\"" + dob + "\",\"policyVersion\":\"" + version + "\"}";
    }

    /** Sends the invite's code and returns {@code requestId|code}. */
    private String codeFor(String token) throws Exception {
        String req = send(token);
        return req + "|" + sender.codeFor(PHONE);
    }

    private String send(String token) throws Exception {
        return JsonPath.read(publicMvc.perform(MockMvcRequestBuilders.post("/v1/invites/" + token + "/code").contentType(MediaType.APPLICATION_JSON)
                .content("{\"dateOfBirth\":\"" + dob(30) + "\",\"policyVersion\":\"2026-09\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.requestId");
    }

    private void assertNothingMade() {
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM app_user WHERE phone = :p", Map.of("p", PHONE), Integer.class), "no login");
        assertEquals(0, count("SELECT count(*) FROM client_prefs WHERE client_id = :c::uuid"), "no prefs");
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM web_session s JOIN app_user u ON u.id = s.app_user_id WHERE u.phone = :p", Map.of("p", PHONE), Integer.class), "no session");
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Map.of("c", client.toString()), Integer.class);
    }

    private String dob(int years) {
        return today.minusYears(years).minusDays(40).toString();
    }

    private String mint() throws Exception {
        String link = JsonPath.read(trainerMvc.perform(MockMvcRequestBuilders.post("/v1/clients/" + client + "/invites")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.link");
        return link.substring(link.lastIndexOf('/') + 1);
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID client(UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :ph, 'independent')",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenantOf(trainerId).toString(), "n", name, "ph", phone));
        return id;
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }

    /** The WhatsApp seam, captured: the last code sent to each number. */
    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender inviteCapturingOtpSender() {
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
