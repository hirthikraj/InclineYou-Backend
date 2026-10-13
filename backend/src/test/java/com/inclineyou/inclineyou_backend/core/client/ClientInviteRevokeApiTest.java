package com.inclineyou.inclineyou_backend.core.client;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/client-invites} (api-contract 1.2, tr-a3): the Invitations view. Pins the default (what needs the trainer),
 * that {@code expired} is derived and never stored, the five-way filter, the counts, the client filter, keyset paging, that
 * another trainer's invites and a deleted client's never show, and that no secret is on the wire.
 */
/**
 * {@code POST /v1/client-invites/{id}/revoke} (api-contract 1.2, tr-a4): withdraw an invitation. Pins that a pending one
 * (live or lapsed) becomes revoked by the trainer and frees the client, that revoking twice or a declined one is a 200 that
 * changes nothing, that an accepted one is 409 and leaves the client on the portal, that a stranger's and a missing id are
 * 404, and that the withdrawn link then shows in the Invitations view and a fresh invite works again.
 */
@SpringBootTest
@Transactional
class ClientInviteRevokeApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001301", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001302", "Other");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a pending invite is withdrawn: revoked by the trainer, the client back to not invited")
    void withdrawsPending() throws Exception {
        UUID c = client(me, "Pen Client", "+919841025001");
        invited(c);
        UUID i = invite(me, c, "+919841025001", "pending", 1, -13);

        String json = revoke(i).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("revoked", JsonPath.read(json, "$.state"));
        assertEquals("trainer", JsonPath.read(json, "$.revokedReason"));
        assertEquals(i.toString(), JsonPath.read(json, "$.id"));
        org.junit.jupiter.api.Assertions.assertNotNull(JsonPath.read(json, "$.revokedAt"));
        assertEquals("revoked/trainer", jdbc.queryForObject("SELECT status || '/' || revoked_reason FROM client_invite WHERE id = :i::uuid", Map.of("i", i.toString()), String.class));
        assertEquals("not_invited", membership(c));
        // the withdrawn link shows under withdrawn, and no longer under what is waiting
        mvc.perform(get("/v1/client-invites?state=revoked")).andExpect(jsonPath("$.items[0].id").value(i.toString()));
        mvc.perform(get("/v1/client-invites")).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("a lapsed invite (still stored as pending) is withdrawn the same way")
    void withdrawsExpired() throws Exception {
        UUID c = client(me, "Exp Client", "+919841025002");
        invited(c);
        UUID i = invite(me, c, "+919841025002", "pending", 20, 6);
        revoke(i).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("revoked"));
        assertEquals("not_invited", membership(c));
    }

    @Test
    @DisplayName("twice is harmless: 200, nothing rewritten; a declined invite is left declined and so is its client")
    void idempotent() throws Exception {
        UUID c = client(me, "Pen Client", "+919841025003");
        invited(c);
        UUID i = invite(me, c, "+919841025003", "pending", 1, -13);
        String first = revoke(i).andReturn().getResponse().getContentAsString();
        String again = revoke(i).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("revoked")).andReturn().getResponse().getContentAsString();
        assertEquals(JsonPath.<Object>read(first, "$.revokedAt"), JsonPath.<Object>read(again, "$.revokedAt"), "the date of the first withdrawal stands");

        UUID d = client(me, "Dec Client", "+919841025004");
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now(), declined_at = now() WHERE id = :c::uuid", Map.of("c", d.toString()));
        UUID di = invite(me, d, "+919841025004", "declined", 5, -9);
        revoke(di).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("declined")).andExpect(jsonPath("$.revokedReason").doesNotExist());
        assertEquals("declined", membership(d));

        // a link replaced by a resend is already revoked ('replaced'): the reason is not overwritten
        UUID r = client(me, "Rep Client", "+919841025005");
        UUID ri = invite(me, r, "+919841025005", "revoked", 5, -9);
        revoke(ri).andExpect(status().isOk()).andExpect(jsonPath("$.revokedReason").value("replaced"));
    }

    @Test
    @DisplayName("accepted is 409 INVITE_ACCEPTED and the client stays on the portal")
    void acceptedRefused() throws Exception {
        UUID c = client(me, "On The Portal", "+919841025006");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        UUID i = invite(me, c, "+919841025006", "accepted", 5, -9);
        revoke(i).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_ACCEPTED"));
        assertEquals("accepted", membership(c));
        assertEquals("accepted", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", i.toString()), String.class));
    }

    @Test
    @DisplayName("another trainer's invite and an id that does not exist are both 404, and the first is untouched")
    void notYours() throws Exception {
        UUID theirs = client(other, "Theirs", "+919841025007");
        invited(theirs);
        UUID i = invite(other, theirs, "+919841025007", "pending", 1, -13);
        revoke(i).andExpect(status().isNotFound());
        revoke(UUID.randomUUID()).andExpect(status().isNotFound());
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", i.toString()), String.class));
        assertEquals("invited", membership(theirs));
        mvc.perform(post("/v1/client-invites/not-a-uuid/revoke")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("after a withdrawal the client can be invited again, and gets a new link")
    void inviteAgain() throws Exception {
        UUID c = client(me, "Pen Client", "+919841025008");
        invited(c);
        UUID i = invite(me, c, "+919841025008", "pending", 1, -13);
        revoke(i).andExpect(status().isOk());
        mvc.perform(post("/v1/clients/" + c + "/invites")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.invite.state").value("pending")).andExpect(jsonPath("$.link").exists());
        assertEquals("invited", membership(c));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions revoke(UUID id) throws Exception {
        return mvc.perform(post("/v1/client-invites/" + id + "/revoke"));
    }

    private String membership(UUID clientId) {
        return jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", clientId.toString()), String.class);
    }

    private void invited(UUID clientId) {
        jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :c::uuid", Map.of("c", clientId.toString()));
    }

    private UUID invite(UUID trainerId, UUID clientId, String phone, String status, int createdDaysAgo, int expiresInDays) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("c", clientId.toString()); p.put("ph", phone); p.put("st", status);
        p.put("created", createdDaysAgo + " days"); p.put("exp", expiresInDays + " days");
        jdbc.update("""
                INSERT INTO client_invite (id, trainer_id, client_id, phone, token_hash, status, created_at, expires_at,
                                           accepted_at, policy_version, declined_at, decline_reason, revoked_at, revoked_reason)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :ph, md5(random()::text) || md5(random()::text), :st,
                        now() - CAST(:created AS interval), now() + CAST(:exp AS interval) * -1 + interval '0 days',
                        CASE WHEN :st = 'accepted' THEN now() END, CASE WHEN :st = 'accepted' THEN '2026-09' END,
                        CASE WHEN :st = 'declined' THEN now() END, CASE WHEN :st = 'declined' THEN 'not_for_me' END,
                        CASE WHEN :st = 'revoked' THEN now() END, CASE WHEN :st = 'revoked' THEN 'replaced' END)
                """, p);
        return id;
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID client(UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantOf(trainerId).toString());
        p.put("n", name); p.put("ph", phone);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :ph, 'independent')", p);
        return id;
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
