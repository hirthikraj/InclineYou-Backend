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
import org.springframework.http.MediaType;
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
 * api-contract 1.2, inv-a4: "Not for me". Pins that it needs no code and moves exactly one live invite and its one client row,
 * is idempotent, and that every link that is not live — and every link that has already been accepted — answers the same quiet 204
 * and changes nothing, so a stranger holding an old link can neither learn anything nor withdraw a client who has joined.
 */
@SpringBootTest
@Transactional
class InviteDeclineApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc trainerMvc;
    /** No principal at all: the invite page has no session. */
    private MockMvc publicMvc;
    private UUID me, client;
    private final java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        me = trainer("+919100002401", "Arun Prakash");
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

    @Test
    @DisplayName("204: the invite is declined as not_for_me, the client row follows, the link is dead from now on — and the trainer can invite again")
    void declines() throws Exception {
        String token = mint();
        decline(token).andExpect(status().isNoContent());
        var inv = jdbc.queryForMap("SELECT status, decline_reason, declined_at IS NOT NULL AS at FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals("declined", inv.get("status"));
        assertEquals("not_for_me", inv.get("decline_reason"));
        assertEquals(true, inv.get("at"));
        var c = jdbc.queryForMap("SELECT membership_status, declined_at IS NOT NULL AS at FROM client WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertEquals("declined", c.get("membership_status"));
        assertEquals(true, c.get("at"));

        publicMvc.perform(get("/v1/invites/" + token)).andExpect(jsonPath("$.state").value("expired"));
        publicMvc.perform(post("/v1/invites/" + token + "/code").contentType(MediaType.APPLICATION_JSON)
                .content("{\"dateOfBirth\":\"" + today.minusYears(30) + "\",\"policyVersion\":\"2026-09\"}")).andExpect(status().isUnprocessableEntity());

        mint();   // a fresh link: the trainer is free to ask again
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
    }

    @Test
    @DisplayName("idempotent: a second press is 204 and writes nothing, not even a timestamp")
    void idempotent() throws Exception {
        String token = mint();
        decline(token).andExpect(status().isNoContent());
        String before = snapshot();
        decline(token).andExpect(status().isNoContent());
        decline(token).andExpect(status().isNoContent());
        assertEquals(before, snapshot());
    }

    @Test
    @DisplayName("a link that is not live is the same 204 and changes nothing: unknown, malformed, replaced, expired, revoked")
    void deadLinksChangeNothing() throws Exception {
        decline("A".repeat(43)).andExpect(status().isNoContent());
        decline("short").andExpect(status().isNoContent());

        String replaced = mint();
        String live = mint();
        String before = snapshot();
        decline(replaced).andExpect(status().isNoContent());
        assertEquals(before, snapshot(), "a replaced link declines nothing — the live one is untouched");
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()), String.class));

        jdbc.update("UPDATE client_invite SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        before = snapshot();
        decline(live).andExpect(status().isNoContent());
        assertEquals(before, snapshot(), "an expired link declines nothing");

        String revoked = mint();
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        before = snapshot();
        decline(revoked).andExpect(status().isNoContent());
        assertEquals(before, snapshot());
    }

    @Test
    @DisplayName("an accepted link cannot be used to withdraw the client who joined: 204, and they stay accepted")
    void acceptedStaysAccepted() throws Exception {
        String token = mint();
        jdbc.update("UPDATE client_invite SET status = 'accepted', accepted_at = now(), policy_version = '2026-09' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        jdbc.update("UPDATE client SET membership_status = 'accepted', accepted_at = now() WHERE id = :c::uuid", Map.of("c", client.toString()));
        String before = snapshot();
        decline(token).andExpect(status().isNoContent());
        assertEquals(before, snapshot());
        assertEquals("accepted", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
    }

    @Test
    @DisplayName("it needs no session and no body: an empty body and {} are both fine, an unknown key is not")
    void bodyless() throws Exception {
        String token = mint();
        publicMvc.perform(post("/v1/invites/" + token + "/decline")).andExpect(status().isNoContent());
        String again = mint();
        publicMvc.perform(post("/v1/invites/" + again + "/decline").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        String third = mint();
        publicMvc.perform(post("/v1/invites/" + third + "/decline").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"x\"}")).andExpect(status().isBadRequest());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private org.springframework.test.web.servlet.ResultActions decline(String token) throws Exception {
        return publicMvc.perform(post("/v1/invites/" + token + "/decline").contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    private String snapshot() {
        return jdbc.queryForList("SELECT status, updated_at::text u FROM client_invite ORDER BY id", Map.of()).toString()
                + jdbc.queryForList("SELECT membership_status, updated_at::text u FROM client ORDER BY id", Map.of()).toString();
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
