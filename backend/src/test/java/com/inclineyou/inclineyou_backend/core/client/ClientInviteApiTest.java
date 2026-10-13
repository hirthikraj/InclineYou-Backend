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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The trainer's side of inviting (api-contract 1.2): {@code POST /v1/clients/{id}/invites} (tr-a1), the personal link a
 * trainer sends from their own WhatsApp, and {@code POST /v1/client-invites} (tr-a2), the same for a selection. Pins that
 * only the token's hash is stored, that a call is a resend which replaces the live link, that nothing is sent, every
 * refusal in the contract, and that a bulk call is one independent result per client.
 */
@SpringBootTest
@Transactional
class ClientInviteApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant, client;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001101", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001102", "Other");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = client(me, "Priya Nair", "+919841022119");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("201: a one-time link, a draft naming both people, a wa.me url — and only the token's hash is stored")
    void invites() throws Exception {
        MvcResult r = invite(client).andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.invite.state").value("pending"))
                .andExpect(jsonPath("$.invite.clientId").value(client.toString()))
                .andExpect(jsonPath("$.client.membershipStatus").value("invited"))
                .andExpect(jsonPath("$.client.name").value("Priya Nair"))
                .andExpect(jsonPath("$.invite.acceptedAt").doesNotExist()).andReturn();
        String json = r.getResponse().getContentAsString();

        String link = JsonPath.read(json, "$.link");
        assertTrue(link.startsWith("http://localhost:3000/invite/"), link);
        String token = link.substring(link.lastIndexOf('/') + 1);
        assertEquals(43, token.length(), "32 bytes, base64url, no padding");
        assertTrue(token.matches("[A-Za-z0-9_-]{43}"));

        var row = jdbc.queryForMap("SELECT token_hash, status, phone, trainer_id::text AS tid, client_id::text AS cid, "
                + "expires_at - created_at AS life FROM client_invite WHERE client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals(ClientInviteServiceTestAccess.hash(token), row.get("token_hash"), "the stored value is the SHA-256 of the token");
        assertNotEquals(token, row.get("token_hash"));
        assertEquals("pending", row.get("status"));
        assertEquals("+919841022119", row.get("phone"));
        assertEquals(me.toString(), row.get("tid"));
        assertTrue(row.get("life").toString().contains("14 days"), row.get("life").toString());
        assertFalse(json.contains(row.get("token_hash").toString()), "the hash is never on the wire");

        String draft = JsonPath.read(json, "$.draft");
        assertTrue(draft.startsWith("Hi Priya, Arun here."), draft);
        assertTrue(draft.endsWith(link), draft);
        String wa = JsonPath.read(json, "$.waUrl");
        assertTrue(wa.startsWith("https://wa.me/919841022119?text="), wa);
        assertEquals(draft, URLDecoder.decode(wa.substring(wa.indexOf("?text=") + 6), StandardCharsets.UTF_8));
        assertFalse(wa.contains("+"), "wa.me takes digits and %20, never a plus");

        var c = jdbc.queryForMap("SELECT membership_status, invited_at IS NOT NULL AS invited FROM client WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertEquals("invited", c.get("membership_status"));
        assertEquals(true, c.get("invited"));
    }

    @Test
    @DisplayName("a trainer who has not finished setup (their name is their number) still sends a message that reads")
    void trainerWithoutAName() throws Exception {
        UUID fresh = trainer("+919100001103", "+919100001103");
        var auth = new UsernamePasswordAuthenticationToken(fresh.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        MockMvc as = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        UUID c = client(fresh, "Karthik Menon", "+919841022130");
        CurrentScope.set(new TenantScope.Scope(null, fresh, tenantOf(fresh), List.of(), false));
        SecurityContextHolder.getContext().setAuthentication(auth);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", fresh.toString()), String.class);
        String draft = JsonPath.read(as.perform(post("/v1/clients/" + c + "/invites")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.draft");
        assertTrue(draft.startsWith("Hi Karthik, Your trainer."), draft);
        assertFalse(draft.contains("+91"), "a phone number is never shown as the trainer's name: " + draft);
    }

    @Test
    @DisplayName("a second call is a resend: a new link, the old one revoked as replaced, never two live")
    void resendReplaces() throws Exception {
        String first = JsonPath.read(invite(client).andReturn().getResponse().getContentAsString(), "$.link");
        String second = JsonPath.read(invite(client).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.link");
        assertNotEquals(first, second);

        var rows = jdbc.queryForList("SELECT status, revoked_reason FROM client_invite WHERE client_id = :c::uuid ORDER BY created_at, id",
                Map.of("c", client.toString()));
        assertEquals(2, rows.size());
        assertEquals(1, rows.stream().filter(x -> "pending".equals(x.get("status"))).count(), "one live link");
        var old = rows.stream().filter(x -> "revoked".equals(x.get("status"))).findFirst().orElseThrow();
        assertEquals("replaced", old.get("revoked_reason"));
    }

    @Test
    @DisplayName("a declined client who is invited again leaves that state")
    void declinedIsInvitedAgain() throws Exception {
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now(), declined_at = now() WHERE id = :c::uuid", Map.of("c", client.toString()));
        invite(client).andExpect(status().isCreated()).andExpect(jsonPath("$.client.membershipStatus").value("invited"));
        assertEquals(true, jdbc.queryForObject("SELECT declined_at IS NULL FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), Boolean.class));
    }

    @Test
    @DisplayName("refusals: no number, already on the portal, archived or left, a trainer's number; a stranger's or missing client is 404")
    void refusals() throws Exception {
        UUID noPhone = client(me, "No Number", null);
        invite(noPhone).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NO_PHONE"));

        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", client.toString()));
        invite(client).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ALREADY_ACCEPTED"));

        UUID archived = client(me, "Archived", "+919841022120");
        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :c::uuid", Map.of("c", archived.toString()));
        invite(archived).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ARCHIVED"));

        UUID left = client(me, "Left", "+919841022121");
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'client' WHERE id = :c::uuid", Map.of("c", left.toString()));
        invite(left).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ARCHIVED"));

        UUID trainersNumber = client(me, "A Trainer's Number", "+919100001102");   // `other` signs in on it
        invite(trainersNumber).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PHONE_IS_TRAINER"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Other"))));

        UUID theirs = client(other, "Theirs", "+919841022122");
        invite(theirs).andExpect(status().isNotFound());
        invite(UUID.randomUUID()).andExpect(status().isNotFound());

        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_invite WHERE client_id IN (:ids)",
                Map.of("ids", List.of(noPhone, client, archived, left, trainersNumber, theirs)), Integer.class), "a refused call writes nothing");
    }

    @Test
    @DisplayName("the body takes no fields, and nothing is sent: the notice table and the nudge log stay empty")
    void noBodyAndNothingSent() throws Exception {
        mvc.perform(post("/v1/clients/" + client + "/invites").contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"+919000000000\"}"))
                .andExpect(status().isBadRequest());
        invite(client).andExpect(status().isCreated());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM nudge_log WHERE client_id = :c::uuid", Map.of("c", client.toString()), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", Map.of("c", client.toString()), Integer.class));
    }

    /* ───────────────────────────────────────────────── tr-a2 · invite several at once ── */

    @Test
    @DisplayName("bulk: one result per client in the order sent, always 200, each refusal named, the others unaffected")
    void bulkMix() throws Exception {
        UUID ok1 = client(me, "Karthik Menon", "+919841023001");
        UUID ok2 = client(me, "Divya Rao", "+919841023002");
        UUID noPhone = client(me, "No Number", null);
        UUID accepted = client(me, "On The Portal", "+919841023003");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", accepted.toString()));
        UUID archived = client(me, "Archived", "+919841023004");
        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :c::uuid", Map.of("c", archived.toString()));
        UUID trainersNumber = client(me, "Trainer Number", "+919100001102");
        UUID theirs = client(other, "Theirs", "+919841023005");
        UUID missing = UUID.randomUUID();
        List<UUID> asked = List.of(ok1, noPhone, accepted, ok2, archived, trainersNumber, theirs, missing);

        MvcResult r = bulk(asked).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.summary.created").value(2)).andExpect(jsonPath("$.summary.skipped").value(6))
                .andExpect(jsonPath("$.results.length()").value(8)).andReturn();
        String json = r.getResponse().getContentAsString();
        List<String> ids = JsonPath.read(json, "$.results[*].clientId");
        assertEquals(asked.stream().map(UUID::toString).toList(), ids, "answered in the order asked");
        assertEquals(List.of("created", "skipped", "skipped", "created", "skipped", "skipped", "skipped", "skipped"),
                JsonPath.<List<String>>read(json, "$.results[*].outcome"));
        assertEquals(java.util.Arrays.asList(null, "NO_PHONE", "ALREADY_ACCEPTED", null, "ARCHIVED", "PHONE_IS_TRAINER", "NOT_FOUND", "NOT_FOUND"),
                readReasons(json));
        // a skipped item is just {clientId, outcome, reason}: no link, no draft, no invite
        for (int i = 0; i < 8; i++) {
            Map<String, Object> item = JsonPath.read(json, "$.results[" + i + "]");
            boolean created = "created".equals(item.get("outcome"));
            assertEquals(created, item.containsKey("link"), "item " + i);
            assertEquals(created, item.containsKey("draft") && item.containsKey("waUrl") && item.containsKey("invite"), "item " + i);
        }

        // exactly the two created ones have a pending invite, and a refused client has none
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM client_invite WHERE status = 'pending'", Map.of(), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_invite WHERE client_id IN (:ids)",
                Map.of("ids", List.of(noPhone, accepted, archived, trainersNumber, theirs)), Integer.class));
    }

    @Test
    @DisplayName("bulk: twenty selected clients produce twenty distinct links and twenty drafts; a pending one is replaced")
    void bulkTwenty() throws Exception {
        invite(client).andExpect(status().isCreated());   // Priya already has a pending invite
        var ids = new java.util.ArrayList<UUID>();
        ids.add(client);
        for (int i = 0; i < 19; i++) ids.add(client(me, "Client " + i, "+9198410231" + String.format("%02d", i)));

        String json = bulk(ids).andExpect(status().isOk()).andExpect(jsonPath("$.summary.created").value(20)).andReturn().getResponse().getContentAsString();
        List<String> links = JsonPath.read(json, "$.results[*].link");
        List<String> drafts = JsonPath.read(json, "$.results[*].draft");
        assertEquals(20, new java.util.HashSet<>(links).size(), "twenty distinct links");
        assertEquals(20, new java.util.HashSet<>(drafts).size(), "twenty distinct drafts");
        assertEquals(20, jdbc.queryForObject("SELECT count(DISTINCT token_hash) FROM client_invite WHERE status = 'pending'", Map.of(), Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client_invite WHERE client_id = :c::uuid AND status = 'revoked' AND revoked_reason = 'replaced'",
                Map.of("c", client.toString()), Integer.class), "Priya's earlier link was replaced");
    }

    @Test
    @DisplayName("bulk: an empty list, more than fifty, the same client twice, a bad id or an unknown key is a 400")
    void bulkValidation() throws Exception {
        for (String body : new String[]{"{\"clientIds\":[]}", "{\"clientIds\":null}", "{}", "{\"clientIds\":[\"nope\"]}",
                "{\"clientIds\":[\"" + client + "\",\"" + client + "\"]}", "{\"clientIds\":[\"" + client + "\"],\"sendNow\":true}"}) {
            mvc.perform(post("/v1/client-invites").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        var fiftyOne = new java.util.ArrayList<UUID>();
        for (int i = 0; i < 51; i++) fiftyOne.add(UUID.randomUUID());
        bulk(fiftyOne).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/client-invites")).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_invite", Map.of(), Integer.class), "a refused batch writes nothing");
        // fifty is the ceiling and is fine
        var fifty = new java.util.ArrayList<UUID>();
        for (int i = 0; i < 50; i++) fifty.add(UUID.randomUUID());
        bulk(fifty).andExpect(status().isOk()).andExpect(jsonPath("$.summary.skipped").value(50));
    }

    private static List<String> readReasons(String json) {
        var out = new java.util.ArrayList<String>();
        for (int i = 0; i < 8; i++) {
            try { out.add(JsonPath.read(json, "$.results[" + i + "].reason")); } catch (Exception e) { out.add(null); }
        }
        return out;
    }

    private org.springframework.test.web.servlet.ResultActions bulk(List<UUID> clientIds) throws Exception {
        String body = "{\"clientIds\":[" + clientIds.stream().map(u -> "\"" + u + "\"").collect(java.util.stream.Collectors.joining(",")) + "]}";
        return mvc.perform(post("/v1/client-invites").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private org.springframework.test.web.servlet.ResultActions invite(UUID clientId) throws Exception {
        return mvc.perform(post("/v1/clients/" + clientId + "/invites"));
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID client(UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
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
