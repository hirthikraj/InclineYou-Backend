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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/client-invites} (api-contract 1.2, tr-a3): the Invitations view. Pins the default (what needs the trainer),
 * that {@code expired} is derived and never stored, the five-way filter, the counts, the client filter, keyset paging, that
 * another trainer's invites and a deleted client's never show, and that no secret is on the wire.
 */
@SpringBootTest
@Transactional
class ClientInviteListApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant;
    private UUID pendingC, expiredC, acceptedC, declinedC, revokedC;
    private UUID pendingI, expiredI, acceptedI, declinedI, revokedI;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001201", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001202", "Other");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        // one client per state; created oldest to newest so the order is known: revoked < declined < accepted < expired < pending
        revokedC = client(me, "Rev Client", "+919841024001");
        declinedC = client(me, "Dec Client", "+919841024002");
        acceptedC = client(me, "Acc Client", "+919841024003");
        expiredC = client(me, "Exp Client", "+919841024004");
        pendingC = client(me, "Pen Client", "+919841024005");
        revokedI = invite(revokedC, "+919841024001", "revoked", 50, 36);
        declinedI = invite(declinedC, "+919841024002", "declined", 40, 26);
        acceptedI = invite(acceptedC, "+919841024003", "accepted", 30, 16);
        expiredI = invite(expiredC, "+919841024004", "pending", 20, 6);      // pending and past its date: derived 'expired'
        pendingI = invite(pendingC, "+919841024005", "pending", 1, -13);      // 14 days from a day ago
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("default: what needs the trainer — pending and expired — newest first, with the client; counts only when asked")
    void defaultList() throws Exception {
        String json = list("").andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.counts").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").value(org.hamcrest.Matchers.nullValue())).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(pendingI.toString(), expiredI.toString()), JsonPath.<List<String>>read(json, "$.items[*].id"));
        assertEquals(List.of("pending", "expired"), JsonPath.<List<String>>read(json, "$.items[*].state"));
        assertEquals("Pen Client", JsonPath.read(json, "$.items[0].client.name"));
        assertEquals("+919841024005", JsonPath.read(json, "$.items[0].client.phone"));
        assertEquals(pendingC.toString(), JsonPath.read(json, "$.items[0].client.id"));
        assertEquals(pendingC.toString(), JsonPath.read(json, "$.items[0].clientId"));
    }

    @Test
    @DisplayName("expired is derived from the date and never stored; the other three are the stored status")
    void stateIsDerived() throws Exception {
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :id::uuid", Map.of("id", expiredI.toString()), String.class),
                "the row still says pending: nothing swept it");
        assertEquals(List.of(expiredI.toString()), ids(list("?state=expired")));
        assertEquals(List.of(pendingI.toString()), ids(list("?state=pending")));
        assertEquals(List.of(acceptedI.toString()), ids(list("?state=accepted")));
        assertEquals(List.of(declinedI.toString()), ids(list("?state=declined")));
        assertEquals(List.of(revokedI.toString()), ids(list("?state=revoked")));
        assertEquals(List.of(declinedI.toString(), revokedI.toString()), ids(list("?state=revoked,declined")), "a comma list, newest first");
        assertEquals(5, ids(list("?state=all")).size());
        assertEquals(5, ids(list("?state=pending,expired,accepted,declined,revoked")).size());

        assertEquals("not_for_me", JsonPath.read(list("?state=declined").andReturn().getResponse().getContentAsString(), "$.items[0].declineReason"));
        assertEquals("replaced", JsonPath.read(list("?state=revoked").andReturn().getResponse().getContentAsString(), "$.items[0].revokedReason"));
    }

    @Test
    @DisplayName("include=counts: all five headings over every invite, whatever the state filter; clientId narrows them")
    void counts() throws Exception {
        for (String q : new String[]{"?include=counts", "?include=counts&state=accepted", "?include=counts&state=all&limit=1"}) {
            list(q).andExpect(status().isOk())
                    .andExpect(jsonPath("$.counts.pending").value(1)).andExpect(jsonPath("$.counts.expired").value(1))
                    .andExpect(jsonPath("$.counts.accepted").value(1)).andExpect(jsonPath("$.counts.declined").value(1))
                    .andExpect(jsonPath("$.counts.revoked").value(1));
        }
        list("?include=counts&clientId=" + acceptedC).andExpect(jsonPath("$.counts.accepted").value(1))
                .andExpect(jsonPath("$.counts.pending").value(0)).andExpect(jsonPath("$.counts.revoked").value(0));
        // a replaced link is a revoked row too, so a resend shows in the headings
        invite(pendingC, "+919841024005", "revoked", 3, -11);
        list("?include=counts").andExpect(jsonPath("$.counts.revoked").value(2));
    }

    @Test
    @DisplayName("clientId narrows the list; another trainer's invites and a deleted client's never show")
    void scope() throws Exception {
        assertEquals(List.of(acceptedI.toString()), ids(list("?state=all&clientId=" + acceptedC)));

        UUID theirs = client(other, "Theirs", "+919841024009");
        invite(other, theirs, "+919841024009", "pending", 1, -13);
        assertEquals(5, ids(list("?state=all")).size(), "Other's invite is not listed");
        assertEquals(0, ids(list("?state=all&clientId=" + theirs)).size(), "not even by asking for their client");

        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :c::uuid", Map.of("c", pendingC.toString()));
        assertEquals(4, ids(list("?state=all")).size());
        list("?include=counts").andExpect(jsonPath("$.counts.pending").value(0));
    }

    @Test
    @DisplayName("keyset paging walks the list once, newest first; limit and cursor are checked")
    void paging() throws Exception {
        var seen = new ArrayList<String>();
        String cursor = null;
        for (int i = 0; i < 6; i++) {
            String json = list("?state=all&limit=2" + (cursor == null ? "" : "&cursor=" + cursor)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(json, "$.items[*].id"));
            cursor = JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(List.of(pendingI, expiredI, acceptedI, declinedI, revokedI).stream().map(UUID::toString).toList(), seen);

        for (String bad : new String[]{"?limit=0", "?limit=201", "?cursor=nope", "?state=sent", "?state=pending,gone", "?include=totals", "?clientId=nope"}) {
            list(bad).andExpect(status().isBadRequest());
        }
        list("?limit=200").andExpect(status().isOk());
    }

    @Test
    @DisplayName("no secret on the wire: no token, no hash, no link")
    void noSecrets() throws Exception {
        String json = list("?state=all&include=counts").andReturn().getResponse().getContentAsString();
        String hash = jdbc.queryForObject("SELECT token_hash FROM client_invite WHERE id = :id::uuid", Map.of("id", pendingI.toString()), String.class);
        assertFalse(json.contains(hash));
        for (String k : new String[]{"token", "tokenHash", "token_hash", "link", "draft", "waUrl"}) assertFalse(json.contains("\"" + k + "\""), k);
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions list(String query) throws Exception {
        return mvc.perform(get("/v1/client-invites" + query));
    }

    private static List<String> ids(ResultActions r) throws Exception {
        return JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.items[*].id");
    }

    /** A row written directly, so every state exists without driving the (unbuilt) accept and decline routes. */
    private UUID invite(UUID clientId, String phone, String status, int createdDaysAgo, int expiresInDays) {
        return invite(me, clientId, phone, status, createdDaysAgo, expiresInDays);
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
