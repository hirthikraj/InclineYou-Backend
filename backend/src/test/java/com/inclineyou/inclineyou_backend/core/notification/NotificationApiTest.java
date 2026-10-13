package com.inclineyou.inclineyou_backend.core.notification;

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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
 * api-contract 1.2, tr-b1: the trainer's bell. Pins that each of the six kinds is read from the row that records it, that it is
 * this trainer's clients only and the last fourteen days only, that a deleted or erased client is never drawn, the keys, the
 * order, the unread count against {@code bell_seen_at}, and that marking it read is one idempotent column.
 */
@SpringBootTest
@Transactional
class NotificationApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001901", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001902", "Other");
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
    @DisplayName("nothing has happened: an empty bell, nothing unread, never opened")
    void empty() throws Exception {
        mvc.perform(get("/v1/notifications")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.unreadCount").value(0)).andExpect(jsonPath("$.seenAt").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @DisplayName("all six kinds, each from its own row, newest first, with the client, the session where there is one, and a detail only where it says something")
    void sixKinds() throws Exception {
        UUID joined = client(me, "Priya Nair", "+919841031001");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now() - interval '5 days', accepted_at = now() - interval '6 hours' WHERE id = :c::uuid", Map.of("c", joined.toString()));

        UUID no = client(me, "Declines Age", "+919841031002");
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now() - interval '2 days', declined_at = now() - interval '5 hours' WHERE id = :c::uuid", Map.of("c", no.toString()));
        UUID inv = declinedInvite(no, "+919841031002", "age_requirement", 5);

        UUID left = client(me, "Left Us", "+919841031003");
        jdbc.update("UPDATE client SET membership_status = 'removed', invited_at = now() - interval '9 days', accepted_at = now() - interval '8 days', removed_at = now() - interval '4 hours', removed_by = 'client' WHERE id = :c::uuid", Map.of("c", left.toString()));

        UUID runner = client(me, "Karthik Menon", "+919841031004");
        accept(runner);
        UUID run = selfRun(runner, 3);

        UUID asm = client(me, "Assessed", "+919841031005");
        accept(asm);
        UUID assessment = assessmentByClient(asm, "Weekly check-in", 2);

        UUID tough = client(me, "Hard Day", "+919841031006");
        accept(tough);
        UUID session = session(tough);
        UUID fb = feedback(tough, session, "hard", 1);

        String json = mvc.perform(get("/v1/notifications")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // Somebody who joined eight days ago and left four hours ago has both events: joined is its own row, and appears once.
        assertEquals(List.of("feedback:" + fb, "assessment:" + assessment, "selfrun:" + run, "left:" + left, "declined:" + inv, "joined:" + joined, "joined:" + left),
                JsonPath.<List<String>>read(json, "$.items[*].key"), "newest first");
        assertEquals(List.of("feedback_hard", "assessment_submitted", "client_selfrun_done", "client_left", "client_declined", "client_joined", "client_joined"),
                JsonPath.<List<String>>read(json, "$.items[*].kind"));
        assertEquals("Hard Day", JsonPath.read(json, "$.items[0].client.name"));
        assertEquals(tough.toString(), JsonPath.read(json, "$.items[0].client.id"));
        assertEquals(session.toString(), JsonPath.read(json, "$.items[0].sessionId"));
        assertEquals("Weekly check-in", JsonPath.read(json, "$.items[1].detail"));
        assertEquals(run.toString(), JsonPath.read(json, "$.items[2].sessionId"));
        assertNull(JsonPath.read(json, "$.items[3].detail"), "a client leaving is said plainly, with nothing added");
        assertEquals("age_requirement", JsonPath.read(json, "$.items[4].detail"));
        assertNull(JsonPath.read(json, "$.items[5].sessionId"));
        assertEquals(7, ((Number) JsonPath.read(json, "$.unreadCount")).intValue());
        assertFalse(json.contains("date_of_birth") || json.contains("dateOfBirth"), "an age decline never carries a date");
    }

    @Test
    @DisplayName("what is not news: easy and right feedback, an unfinished or trainer-entered thing, a trainer removing a client, a trainer-run session")
    void notNews() throws Exception {
        UUID c = client(me, "Quiet", "+919841031010");
        accept(c);
        UUID s = session(c);
        feedback(c, s, "easy", 1);
        UUID s2 = session(c);
        feedback(c, s2, "right", 1);
        UUID removed = client(me, "Removed By Trainer", "+919841031011");
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now() - interval '1 hour', removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", removed.toString()));
        jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :c::uuid", Map.of("c", client(me, "Invited Only", "+919841031012").toString()));
        trainerRun(c);
        assessmentByTrainer(c, 1);
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.unreadCount").value(0));
    }

    @Test
    @DisplayName("scope: another trainer's clients, events older than fourteen days, and a deleted or erased client never appear")
    void scope() throws Exception {
        UUID mine = client(me, "Mine", "+919841031020");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now() - interval '20 days', accepted_at = now() - interval '15 days' WHERE id = :c::uuid", Map.of("c", mine.toString()));
        UUID theirs = client(other, "Theirs", "+919841031021");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() - interval '1 hour' WHERE id = :c::uuid", Map.of("c", theirs.toString()));
        UUID gone = client(me, "Deleted", "+919841031022");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() - interval '1 hour', deleted_at = now() WHERE id = :c::uuid", Map.of("c", gone.toString()));
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.unreadCount").value(0));
        jdbc.update("UPDATE client SET accepted_at = now() - interval '13 days' WHERE id = :c::uuid", Map.of("c", mine.toString()));
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].client.name").value("Mine"));
    }

    @Test
    @DisplayName("unread is measured against bell_seen_at: seen clears it, later events count, seen is idempotent")
    void unreadAndSeen() throws Exception {
        UUID a = client(me, "First", "+919841031030");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() - interval '2 hours' WHERE id = :c::uuid", Map.of("c", a.toString()));
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.unreadCount").value(1)).andExpect(jsonPath("$.seenAt").value(org.hamcrest.Matchers.nullValue()));

        mvc.perform(MockMvcRequestBuilders.post("/v1/notifications/seen")).andExpect(status().isNoContent());
        String json = mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.unreadCount").value(0)).andExpect(jsonPath("$.items.length()").value(1)).andReturn().getResponse().getContentAsString();
        assertNotNull(JsonPath.read(json, "$.seenAt"));
        mvc.perform(MockMvcRequestBuilders.post("/v1/notifications/seen")).andExpect(status().isNoContent());

        UUID b = client(me, "Second", "+919841031031");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() + interval '1 minute' WHERE id = :c::uuid", Map.of("c", b.toString()));
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.unreadCount").value(1)).andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(MockMvcRequestBuilders.post("/v1/notifications/seen").contentType("application/json").content("{\"x\":1}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("limit cuts the list but not the count; a bad limit is 400")
    void limit() throws Exception {
        for (int i = 0; i < 5; i++) {
            UUID c = client(me, "C" + i, "+91984103104" + i);
            jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() - CAST(:m AS interval) WHERE id = :c::uuid", Map.of("c", c.toString(), "m", (i + 1) + " hours"));
        }
        mvc.perform(get("/v1/notifications?limit=2")).andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.unreadCount").value(5))
                .andExpect(jsonPath("$.items[0].client.name").value("C0"));
        mvc.perform(get("/v1/notifications?limit=0")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/notifications?limit=101")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/notifications?limit=100")).andExpect(status().isOk());
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private void accept(UUID clientId) {
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now() - interval '30 days', accepted_at = now() - interval '29 days' WHERE id = :c::uuid", Map.of("c", clientId.toString()));
    }

    private UUID declinedInvite(UUID clientId, String phone, String reason, int hoursAgo) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", clientId.toString()); p.put("ph", phone); p.put("r", reason); p.put("h", hoursAgo + " hours");
        jdbc.update("""
                INSERT INTO client_invite (id, trainer_id, client_id, phone, token_hash, status, created_at, expires_at, declined_at, decline_reason)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :ph, md5(random()::text) || md5(random()::text), 'declined',
                        now() - interval '3 days', now() + interval '11 days', now() - CAST(:h AS interval), :r)""", p);
        return id;
    }

    private UUID selfRun(UUID clientId, int hoursAgo) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", clientId.toString()); p.put("h", hoursAgo + " hours");
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, now() - CAST(:h AS interval), 60, now() - CAST(:h AS interval), 'done', 'client',
                        now() - CAST(:h AS interval) - interval '30 minutes', now() - CAST(:h AS interval))""", p);
        return id;
    }

    private int hours = 1;

    /** A session the trainer ran. Each gets its own start time: one client cannot have two sessions starting together. */
    private UUID trainerRun(UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status) VALUES (:id::uuid, :t::uuid, :c::uuid, now() - CAST(:h AS interval), 60, now() - CAST(:h AS interval), 'done')",
                Map.of("id", id.toString(), "t", me.toString(), "c", clientId.toString(), "h", (hours++) + " hours"));
        return id;
    }

    private UUID session(UUID clientId) {
        return trainerRun(clientId);
    }

    private UUID feedback(UUID clientId, UUID sessionId, String effort, int hoursAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout_feedback (id, tenant_id, session_id, client_id, effort, at) VALUES (:id::uuid, :ten::uuid, :s::uuid, :c::uuid, :e, now() - CAST(:h AS interval))",
                Map.of("id", id.toString(), "ten", tenant.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", effort, "h", hoursAgo + " hours"));
        return id;
    }

    private UUID template() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, tenant_id, name) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'T')",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString()));
        return id;
    }

    private UUID assessmentByClient(UUID clientId, String name, int hoursAgo) {
        return assessment(clientId, name, "client", hoursAgo);
    }

    private UUID assessmentByTrainer(UUID clientId, int hoursAgo) {
        return assessment(clientId, "Taken in person", "trainer", hoursAgo);
    }

    private UUID assessment(UUID clientId, String name, String enteredBy, int hoursAgo) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("c", clientId.toString()); p.put("t", me.toString()); p.put("ten", tenant.toString());
        p.put("tpl", template().toString()); p.put("n", name); p.put("by", enteredBy); p.put("h", hoursAgo + " hours");
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, tenant_id, template_id, name, form, due_on, sent_at, completed_at, entered_by)
                VALUES (:id::uuid, :c::uuid, :t::uuid, :ten::uuid, :tpl::uuid, :n, '{"measurements":[],"questions":[]}'::jsonb, CURRENT_DATE,
                        now() - interval '2 days', now() - CAST(:h AS interval), :by)""", p);
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
