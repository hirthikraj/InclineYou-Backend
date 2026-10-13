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

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/client-invites} (api-contract 1.2, tr-a3): the Invitations view. Pins the default (what needs the trainer),
 * that {@code expired} is derived and never stored, the five-way filter, the counts, the client filter, keyset paging, that
 * another trainer's invites and a deleted client's never show, and that no secret is on the wire.
 */
/**
 * api-contract 1.2, tr-a5: the portal on the client reads, the two new PATCH fields, a changed number, and what archive,
 * unarchive and delete do to an invitation. Pins that {@code expired} is derived, that a client at the start has no dates,
 * that the roster stays small while the single read adds the Access panel's fields, that the effective "shows money"
 * answer is the override or else the trainer's setting, and that nobody's sign-in number moves from under them.
 */
@SpringBootTest
@Transactional
class ClientPortalApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001401", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
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
    @DisplayName("the roster: every client carries a portal block, expired is derived, and a client at the start has no dates")
    void rosterStates() throws Exception {
        UUID fresh = client(me, "Fresh", "+919841026001");
        UUID live = client(me, "Live", "+919841026002");
        invited(live); invite(live, "+919841026002", "pending", 1, -13);
        UUID lapsed = client(me, "Lapsed", "+919841026003");
        invited(lapsed); invite(lapsed, "+919841026003", "pending", 20, 6);
        UUID joined = client(me, "Joined", "+919841026004");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now() - interval '3 days', accepted_at = now() - interval '2 days', last_portal_seen_at = now() - interval '1 hour' WHERE id = :c::uuid", Map.of("c", joined.toString()));
        UUID said_no = client(me, "Declined", "+919841026005");
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now(), declined_at = now() WHERE id = :c::uuid", Map.of("c", said_no.toString()));
        UUID earlier = client(me, "Earlier", "+919841026006");   // withdrawn: dates left in the columns, state back at the start
        jdbc.update("UPDATE client SET invited_at = now() - interval '5 days' WHERE id = :c::uuid", Map.of("c", earlier.toString()));

        String json = mvc.perform(get("/v1/clients?status=all")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("not_invited", portal(json, fresh, "state"));
        assertNull(portal(json, fresh, "invitedAt"));
        assertEquals("invited", portal(json, live, "state"));
        assertNotNull(portal(json, live, "invitedAt"));
        assertEquals("expired", portal(json, lapsed, "state"));
        assertEquals("invited", member(json, lapsed), "membershipStatus is unchanged: expired is the portal block's alone");
        assertEquals("accepted", portal(json, joined, "state"));
        assertNotNull(portal(json, joined, "acceptedAt"));
        assertNotNull(portal(json, joined, "lastSeenAt"));
        assertEquals("declined", portal(json, said_no, "state"));
        assertEquals("not_invited", portal(json, earlier, "state"));
        assertNull(portal(json, earlier, "invitedAt"), "an earlier arrangement's date is not shown against a fresh one");
        // the roster is not the Access panel
        assertFalse(json.contains("\"inviteId\""));
        assertFalse(json.contains("recentReminders"));
        assertFalse(json.contains("remindersExcluded"));
    }

    @Test
    @DisplayName("lastSelfRunAt is the end of the latest finished self-run, and a trainer-run session never counts")
    void selfRun() throws Exception {
        UUID c = client(me, "Runner", "+919841026010");
        UUID none = client(me, "Never", "+919841026011");
        Instant at = Instant.now().minusSeconds(86_400);
        selfRun(c, at.minusSeconds(86_400 * 3), "done");
        selfRun(c, at, "done");
        selfRun(c, Instant.now().minusSeconds(60), "scheduled");   // not finished
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status) VALUES (gen_random_uuid(), :t::uuid, :c::uuid, now(), 60, now(), 'done')",
                Map.of("t", me.toString(), "c", c.toString()));
        String json = mvc.perform(get("/v1/clients?status=all")).andReturn().getResponse().getContentAsString();
        assertEquals(at.plusSeconds(1800).toEpochMilli(), Long.parseLong(portal(json, c, "lastSelfRunAt")));
        assertNull(portal(json, none, "lastSelfRunAt"));
    }

    @Test
    @DisplayName("the single read adds the Access panel: live invite, effective shows-money, overrides, the last three reminders")
    void detailExtras() throws Exception {
        UUID c = client(me, "Panel", "+919841026020");
        invited(c);
        UUID inv = invite(c, "+919841026020", "pending", 1, -13);

        String json = mvc.perform(get("/v1/clients/" + c)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(inv.toString(), JsonPath.read(json, "$.portal.inviteId"));
        assertNotNull(JsonPath.read(json, "$.portal.inviteExpiresAt"));
        assertEquals(Boolean.FALSE, JsonPath.read(json, "$.portal.remindersExcluded"));
        assertEquals(Boolean.TRUE, JsonPath.read(json, "$.portal.showMoney"), "follows the trainer's setting, which ships true");
        assertNull(JsonPath.read(json, "$.portal.showMoneyOverride"));
        assertNull(JsonPath.read(json, "$.portal.removedBy"));
        assertEquals(0, ((List<?>) JsonPath.read(json, "$.portal.recentReminders")).size());

        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", me.toString()));
        assertEquals(Boolean.FALSE, JsonPath.read(read(c), "$.portal.showMoney"), "no override: the trainer's setting");
        jdbc.update("UPDATE client SET portal_show_money = true WHERE id = :c::uuid", Map.of("c", c.toString()));
        json = read(c);
        assertEquals(Boolean.TRUE, JsonPath.read(json, "$.portal.showMoney"), "the override wins over the setting");
        assertEquals(Boolean.TRUE, JsonPath.read(json, "$.portal.showMoneyOverride"));

        // four reminders, three come back, newest first, with what became of each
        UUID s1 = session(c, 5), s2 = session(c, 4), s3 = session(c, 3), s4 = session(c, 2);
        reminder(c, s1, "delivered", null, 5);
        reminder(c, s2, "skipped", "client_excluded", 4);
        reminder(c, s3, "failed", null, 3);
        reminder(c, s4, "delivered", null, 2);
        json = read(c);
        assertEquals(List.of(s4.toString(), s3.toString(), s2.toString()), JsonPath.<List<String>>read(json, "$.portal.recentReminders[*].sessionId"));
        assertEquals(List.of("delivered", "failed", "skipped"), JsonPath.<List<String>>read(json, "$.portal.recentReminders[*].status"));
        assertEquals("client_excluded", JsonPath.read(json, "$.portal.recentReminders[2].skipReason"));
        assertNotNull(JsonPath.read(json, "$.portal.recentReminders[0].sentAt"));
        assertNull(JsonPath.read(json, "$.portal.recentReminders[2].sentAt"));
    }

    @Test
    @DisplayName("PATCH remindersExcluded and portalShowMoney: set, clear the override with null, refuse the wrong types")
    void patchPrefs() throws Exception {
        UUID c = client(me, "Prefs", "+919841026030");
        send(c, "{\"remindersExcluded\":true,\"portalShowMoney\":false}").andExpect(status().isOk());
        String json = read(c);
        assertEquals(Boolean.TRUE, JsonPath.read(json, "$.portal.remindersExcluded"));
        assertEquals(Boolean.FALSE, JsonPath.read(json, "$.portal.showMoneyOverride"));
        assertEquals(Boolean.FALSE, JsonPath.read(json, "$.portal.showMoney"));

        send(c, "{\"portalShowMoney\":null}").andExpect(status().isOk());
        json = read(c);
        assertNull(JsonPath.read(json, "$.portal.showMoneyOverride"), "null follows the trainer's setting again");
        assertEquals(Boolean.TRUE, JsonPath.read(json, "$.portal.remindersExcluded"), "the other field was not sent, so it was left");

        send(c, "{\"remindersExcluded\":false}").andExpect(status().isOk());
        assertEquals(Boolean.FALSE, JsonPath.read(read(c), "$.portal.remindersExcluded"));

        send(c, "{\"remindersExcluded\":\"yes\"}").andExpect(status().isBadRequest());
        send(c, "{\"portalShowMoney\":\"no\"}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a new number withdraws the pending invitation and starts the client over; the same number changes nothing")
    void numberChange() throws Exception {
        UUID c = client(me, "Mover", "+919841026040");
        invited(c);
        UUID inv = invite(c, "+919841026040", "pending", 1, -13);

        send(c, "{\"phone\":\"+919841026040\"}").andExpect(status().isOk());
        assertEquals("pending", inviteStatus(inv), "re-saving the same number is not a change");
        assertEquals("invited", membership(c));

        send(c, "{\"phone\":\"+919841026041\"}").andExpect(status().isOk()).andExpect(jsonPath("$.portal.state").value("not_invited"));
        assertEquals("revoked/number_changed", jdbc.queryForObject("SELECT status || '/' || revoked_reason FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        assertEquals("not_invited", membership(c));

        mvc.perform(post("/v1/clients/" + c + "/invites")).andExpect(status().isCreated());
        assertEquals("+919841026041", jdbc.queryForObject("SELECT phone FROM client_invite WHERE client_id = :c::uuid AND status = 'pending'", Map.of("c", c.toString()), String.class),
                "the new invitation is to the new number");

        // a declined client who is given a new number is not still declined
        UUID d = client(me, "Declined", "+919841026042");
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now(), declined_at = now() WHERE id = :c::uuid", Map.of("c", d.toString()));
        send(d, "{\"phone\":\"+919841026043\"}").andExpect(status().isOk());
        assertEquals("not_invited", membership(d));
    }

    @Test
    @DisplayName("an accepted client's number is their sign-in: changing or clearing it is 409, re-saving it is fine")
    void acceptedNumberIsTheirs() throws Exception {
        UUID c = client(me, "On The Portal", "+919841026050");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));

        send(c, "{\"phone\":\"+919841026051\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ALREADY_ACCEPTED"));
        send(c, "{\"phone\":null}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ALREADY_ACCEPTED"));
        assertEquals("+919841026050", jdbc.queryForObject("SELECT phone FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        send(c, "{\"phone\":\"+919841026050\",\"goal\":\"Run 10k\"}").andExpect(status().isOk());
        send(c, "{\"goal\":\"Run 5k\"}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("archive: the pending invitation is withdrawn by the trainer and the removal is the trainer's; unarchive clears it")
    void archiveAndUnarchive() throws Exception {
        UUID c = client(me, "Leaver", "+919841026060");
        invited(c);
        UUID inv = invite(c, "+919841026060", "pending", 1, -13);

        mvc.perform(post("/v1/clients/" + c + "/archive").contentType("application/json").content("{\"reason\":\"moved_away\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.client.portal.state").value("removed"));
        assertEquals("revoked/trainer", jdbc.queryForObject("SELECT status || '/' || revoked_reason FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        assertEquals("trainer", jdbc.queryForObject("SELECT removed_by FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertEquals("trainer", JsonPath.read(read(c), "$.portal.removedBy"));
        assertNull(JsonPath.read(read(c), "$.portal.inviteId"));

        mvc.perform(post("/v1/clients/" + c + "/unarchive")).andExpect(status().isOk()).andExpect(jsonPath("$.client.portal.state").value("not_invited"));
        assertNull(jdbc.queryForObject("SELECT removed_by FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertNull(JsonPath.read(read(c), "$.portal.removedBy"));
        mvc.perform(post("/v1/clients/" + c + "/invites")).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("delete withdraws the pending invitation too: nobody can open a link to a client who is gone")
    void deleteWithdraws() throws Exception {
        UUID c = client(me, "Gone", "+919841026070");
        invited(c);
        UUID inv = invite(c, "+919841026070", "pending", 1, -13);
        mvc.perform(post("/v1/clients/" + c + "/delete").contentType("application/json").content("{\"confirmName\":\"Gone\"}")).andExpect(status().isOk());
        assertEquals("revoked/trainer", jdbc.queryForObject("SELECT status || '/' || revoked_reason FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private org.springframework.test.web.servlet.ResultActions send(UUID client, String body) throws Exception {
        return mvc.perform(patch("/v1/clients/" + client).contentType("application/json").content(body));
    }

    private String read(UUID client) throws Exception {
        return mvc.perform(get("/v1/clients/" + client)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static String portal(String json, UUID client, String key) {
        Object v = JsonPath.read(json, "$.items[?(@.id=='" + client + "')].portal." + key);
        return v instanceof List<?> l ? (l.isEmpty() || l.get(0) == null ? null : String.valueOf(l.get(0))) : (v == null ? null : String.valueOf(v));
    }

    private static String member(String json, UUID client) {
        return ((List<String>) JsonPath.<List<String>>read(json, "$.items[?(@.id=='" + client + "')].membershipStatus")).get(0);
    }

    private String inviteStatus(UUID invite) {
        return jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", invite.toString()), String.class);
    }

    private String membership(UUID clientId) {
        return jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", clientId.toString()), String.class);
    }

    private void invited(UUID clientId) {
        jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :c::uuid", Map.of("c", clientId.toString()));
    }

    private UUID selfRun(UUID clientId, Instant at, String status) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", clientId.toString());
        p.put("at", Timestamp.from(at)); p.put("s", status);
        p.put("ended", "done".equals(status) ? Timestamp.from(at.plusSeconds(1800)) : null);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :at, 60, :at, :s, 'client', :at, :ended)""", p);
        return id;
    }

    private UUID session(UUID clientId, int daysAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status) VALUES (:id::uuid, :t::uuid, :c::uuid, now() - CAST(:d AS interval), 60, now() - CAST(:d AS interval), 'done')",
                Map.of("id", id.toString(), "t", me.toString(), "c", clientId.toString(), "d", daysAgo + " days"));
        return id;
    }

    private void reminder(UUID clientId, UUID sessionId, String whatsapp, String skip, int daysAgo) {
        var p = new HashMap<String, Object>();
        p.put("c", clientId.toString()); p.put("s", sessionId.toString()); p.put("w", whatsapp); p.put("skip", skip);
        p.put("d", daysAgo + " days"); p.put("mid", "delivered".equals(whatsapp) ? "wamid." + UUID.randomUUID() : null);
        jdbc.update("""
                INSERT INTO client_notification (tenant_id, client_id, kind, text, session_id, whatsapp_status, whatsapp_skip_reason,
                                                 whatsapp_message_id, whatsapp_sent_at, at)
                VALUES (:ten::uuid, :c::uuid, 'reminder', 'Session tomorrow', :s::uuid, :w, :skip, :mid,
                        CASE WHEN :w = 'delivered' THEN now() - CAST(:d AS interval) END, now() - CAST(:d AS interval))""",
                withTenant(p));
    }

    private HashMap<String, Object> withTenant(HashMap<String, Object> p) {
        p.put("ten", tenant.toString());
        return p;
    }

    private UUID invite(UUID clientId, String phone, String status, int createdDaysAgo, int expiresInDays) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", clientId.toString()); p.put("ph", phone); p.put("st", status);
        p.put("created", createdDaysAgo + " days"); p.put("exp", expiresInDays + " days");
        jdbc.update("""
                INSERT INTO client_invite (id, trainer_id, client_id, phone, token_hash, status, created_at, expires_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :ph, md5(random()::text) || md5(random()::text), :st,
                        now() - CAST(:created AS interval), now() + CAST(:exp AS interval) * -1 + interval '0 days')""", p);
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
