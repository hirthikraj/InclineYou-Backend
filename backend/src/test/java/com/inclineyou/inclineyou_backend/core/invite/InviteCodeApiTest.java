package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, inv-a2: the code for an invite. Pins that the code goes to the number on the invite and to nothing else, that
 * the age check runs first and changes nothing (so a typo can be corrected), that every dead link is one answer, the order the
 * refusals come in, and that the caller cannot name a number.
 */
@SpringBootTest
@Transactional
class InviteCodeApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc trainerMvc;
    /** No principal at all: the invite page has no session. */
    private MockMvc publicMvc;
    private UUID me, client;
    private final java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        me = trainer("+919100002201", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        trainerMvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        publicMvc = MockMvcBuilders.webAppContextSetup(context).build();
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', '+919841022119', 'independent')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    private static final String PHONE = "+919841022119";

    @Test
    @DisplayName("200: a request id, when it lapses, when to offer a resend — and the code is for the number ON the invite, as an ordinary sign-in code")
    void sendsToTheInvitedNumber() throws Exception {
        String token = mint();
        String body = send(token, dob(30), "2026-09").andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").isString()).andExpect(jsonPath("$.expiresAt").isNumber())
                .andExpect(jsonPath("$.resendAfterSeconds").isNumber()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.requestId");
        var row = jdbc.queryForMap("SELECT phone, purpose FROM otp_request WHERE id = :i::uuid", Map.of("i", id));
        assertEquals(PHONE, row.get("phone"));
        assertEquals("sign_in", row.get("purpose"));
        assertFalse(body.contains("919841022119"), "the number is never echoed");
    }

    @Test
    @DisplayName("sending a code changes nothing about the invite or the client, and the date of birth is not stored")
    void changesNothing() throws Exception {
        String token = mint();
        String before = jdbc.queryForList("SELECT status, updated_at::text u FROM client_invite", Map.of()).toString()
                + jdbc.queryForList("SELECT membership_status, date_of_birth, updated_at::text u FROM client", Map.of()).toString();
        send(token, dob(30), "2026-09").andExpect(status().isOk());
        assertEquals(before, jdbc.queryForList("SELECT status, updated_at::text u FROM client_invite", Map.of()).toString()
                + jdbc.queryForList("SELECT membership_status, date_of_birth, updated_at::text u FROM client", Map.of()).toString());
    }

    @Test
    @DisplayName("under 18 is 422 AGE_REQUIREMENT with no code sent and the invite untouched — a typo can be corrected; exactly 18 today is fine")
    void ageCheckChangesNothing() throws Exception {
        String token = mint();
        int before = otpRows();
        send(token, dob(17), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("AGE_REQUIREMENT"));
        send(token, today.minusYears(18).plusDays(1).toString(), "2026-09").andExpect(status().isUnprocessableEntity());
        assertEquals(before, otpRows(), "no code was sent");
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()), String.class));
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));

        send(token, today.minusYears(18).toString(), "2026-09").andExpect(status().isOk());
        // Resend is this same call again, on sign-in's own ladder: asked again at once it is throttled, not sent twice.
        send(token, dob(30), "2026-09").andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("OTP_THROTTLED"));
    }

    @Test
    @DisplayName("a dead link is 422 INVITE_UNAVAILABLE however it died, and no code is sent: unknown, malformed, replaced, revoked, declined, expired")
    void deadLinks() throws Exception {
        int before = otpRows();
        send("A".repeat(43), dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        send("short", dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));

        String replaced = mint();
        String live = mint();
        send(replaced, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));

        jdbc.update("UPDATE client_invite SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        send(live, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));

        String declined = mint();
        jdbc.update("UPDATE client_invite SET status = 'declined', declined_at = now(), decline_reason = 'not_for_me' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        send(declined, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));

        String revoked = mint();
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        send(revoked, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        assertEquals(before, otpRows(), "not one code went out for any of them");
    }

    @Test
    @DisplayName("a client whose number was changed after the invite was sent has a dead link: the code must not go to the old number")
    void numberChangedIsDead() throws Exception {
        String token = mint();
        jdbc.update("UPDATE client SET phone = '+919841022120' WHERE id = :c::uuid", Map.of("c", client.toString()));
        send(token, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
    }

    @Test
    @DisplayName("the refusals come in a fixed order: a dead link first (whatever else is wrong), then the body, then the notice, then the age")
    void order() throws Exception {
        send("A".repeat(43), dob(10), "old").andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        String token = mint();
        send(token, today.plusDays(1).toString(), "old").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        send(token, dob(10), "old").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        send(token, dob(10), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("AGE_REQUIREMENT"));
    }

    @Test
    @DisplayName("400 VALIDATION: no date, a malformed date, before 1900, a date in the future — and no phone key is accepted at all")
    void validation() throws Exception {
        String token = mint();
        post(token, "{\"policyVersion\":\"2026-09\"}").andExpect(status().isBadRequest());
        post(token, "{\"dateOfBirth\":\"not a date\",\"policyVersion\":\"2026-09\"}").andExpect(status().isBadRequest());
        post(token, "{\"dateOfBirth\":\"1899-12-31\",\"policyVersion\":\"2026-09\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("1900")));
        send(token, today.plusDays(1).toString(), "2026-09").andExpect(status().isBadRequest());
        post(token, "{\"dateOfBirth\":\"" + dob(30) + "\",\"policyVersion\":\"2026-09\",\"phone\":\"+919999999999\"}").andExpect(status().isBadRequest());
        post(token, "{\"dateOfBirth\":\"" + dob(30) + "\"}").andExpect(status().isBadRequest());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private org.springframework.test.web.servlet.ResultActions send(String token, String dateOfBirth, String version) throws Exception {
        return post(token, "{\"dateOfBirth\":\"" + dateOfBirth + "\",\"policyVersion\":\"" + version + "\"}");
    }

    private org.springframework.test.web.servlet.ResultActions post(String token, String json) throws Exception {
        return publicMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/v1/invites/" + token + "/code")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json));
    }

    private String dob(int years) {
        return today.minusYears(years).minusDays(40).toString();
    }

    private int otpRows() {
        return jdbc.queryForObject("SELECT count(*) FROM otp_request", Map.of(), Integer.class);
    }

    private String mint() throws Exception {
        String link = JsonPath.read(trainerMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/v1/clients/" + client + "/invites")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.link");
        return link.substring(link.lastIndexOf('/') + 1);
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
