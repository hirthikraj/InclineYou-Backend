package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.OtpSender;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, pi-l1 … pi-a2: what the trainer wrote, what they chose to share, and the bell. Through the security chain; the suite runs as
 * the schema owner, so the row-level walls (what a client may read and the one column they may write) are asserted as the request role in
 * {@code TenantIsolationTest}, and every statement here also names the client id.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalInboxApiTest.CapturingSender.class)
@Transactional
class PortalInboxApiTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;
    private UUID me, tenant;
    private int seq = 0;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    private ResultActions get(String token, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private ResultActions postJson(String token, String url, String json) throws Exception {
        return mvc.perform(post(url).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private static Instant ago(int days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    private UUID note(UUID client, String text, boolean shared, boolean deleted, Instant at) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("c", client.toString()); m.put("t", arun.toString()); m.put("b", text); m.put("s", shared); m.put("d", deleted); m.put("at", java.sql.Timestamp.from(at));
        jdbc.update("""
                INSERT INTO client_note (id, tenant_id, client_id, trainer_id, body, shared_with_client, shared_at, created_at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, :b, :s, CASE WHEN :s THEN CAST(:at AS timestamptz) END, CAST(:at AS timestamptz), CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    private UUID notice(UUID client, String kind, String text, Instant at, boolean read, UUID session) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("c", client.toString()); m.put("k", kind); m.put("x", text); m.put("at", java.sql.Timestamp.from(at)); m.put("r", read);
        m.put("s", session == null ? null : session.toString());
        jdbc.update("""
                INSERT INTO client_notification (id, tenant_id, client_id, kind, text, at, read_at, session_id)
                SELECT :id::uuid, tenant_id, id, :k, :x, :at, CASE WHEN :r THEN now() END, CAST(:s AS uuid) FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    @Test
    @DisplayName("messages: only the trainer's lines for this client, newest first with the trainer's name and the session a recap is about; no reply route; deleted and others' never appear")
    void messages() throws Exception {
        UUID c = live();
        UUID s = session(c, null, ago(2), 60, "done", "trainer", ago(2), ago(2).plusSeconds(3000));
        UUID weekly = message(c, "weekly", "Great week.", null, ago(5), false);
        UUID recap = message(c, "recap", "Depth was spot on.", s, ago(2), false);
        UUID line = message(c, "note", "See you Friday.", null, ago(1), false);
        message(c, "note", "Retracted", null, ago(1), true);
        UUID other = liveOther();
        message(other, "note", "Somebody else's", null, ago(1), false);
        String token = tokenFor(phone);

        String page = body(get(token, "/v1/portal/messages?limit=2").andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.items[0].id").value(line.toString())).andExpect(jsonPath("$.items[0].kind").value("note"))
                .andExpect(jsonPath("$.items[0].trainerName").value("Arun Prakash")).andExpect(jsonPath("$.items[0].readAt").value(nullValue())).andExpect(jsonPath("$.items[0].sessionId").value(nullValue()))
                .andExpect(jsonPath("$.items[1].id").value(recap.toString())).andExpect(jsonPath("$.items[1].kind").value("recap")).andExpect(jsonPath("$.items[1].sessionId").value(s.toString()))
                .andExpect(jsonPath("$.nextCursor").isString()));
        get(token, "/v1/portal/messages?limit=2&cursor=" + com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor")).andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].id").value(weekly.toString()))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
        assertFalse(body(get(token, "/v1/portal/messages")).contains("Somebody else"));
        get(token, "/v1/portal/messages?cursor=nonsense").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("reading a message sets read_at once and the trainer's own read of it shows it; a replay moves nothing; another client's or a missing one is 404")
    void readMessage() throws Exception {
        UUID c = live();
        UUID m = message(c, "note", "See you Friday.", null, ago(1), false);
        UUID other = liveOther();
        UUID theirs = message(other, "note", "Theirs", null, ago(1), false);
        String token = tokenFor(phone);

        postJson(token, "/v1/portal/messages/" + m + "/read", "{}").andExpect(status().isNoContent());
        var first = jdbc.queryForObject("SELECT read_at FROM client_message WHERE id = :m::uuid", Map.of("m", m.toString()), java.sql.Timestamp.class);
        assertNotNull(first);
        jdbc.update("UPDATE client_message SET read_at = read_at - interval '2 days' WHERE id = :m::uuid", Map.of("m", m.toString()));
        var backdated = jdbc.queryForObject("SELECT read_at FROM client_message WHERE id = :m::uuid", Map.of("m", m.toString()), java.sql.Timestamp.class);
        postJson(token, "/v1/portal/messages/" + m + "/read", "{}").andExpect(status().isNoContent());
        assertEquals(backdated, jdbc.queryForObject("SELECT read_at FROM client_message WHERE id = :m::uuid", Map.of("m", m.toString()), java.sql.Timestamp.class), "a replay moves nothing");
        get(token, "/v1/portal/messages").andExpect(jsonPath("$.items[0].readAt").isNumber());
        postJson(token, "/v1/portal/messages/" + theirs + "/read", "{}").andExpect(status().isNotFound());
        assertNull(jdbc.queryForObject("SELECT read_at FROM client_message WHERE id = :m::uuid", Map.of("m", theirs.toString()), java.sql.Timestamp.class));
        postJson(token, "/v1/portal/messages/" + UUID.randomUUID() + "/read", "{}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("notes: only what the trainer chose to share, newest first, with who wrote it and when; unsharing removes it from the next read; the private fields are not on the wire")
    void notes() throws Exception {
        UUID c = live();
        UUID older = note(c, "Switch to the 30° bench from Monday.", true, false, ago(5));
        UUID newer = note(c, "Keep the knee tracking over the toes.", true, false, ago(1));
        note(c, "Private to Arun", false, false, ago(2));
        note(c, "Shared then deleted", true, true, ago(3));
        UUID other = liveOther();
        note(other, "Shared with somebody else", true, false, ago(1));
        String token = tokenFor(phone);

        String out = body(get(token, "/v1/portal/notes").andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.items[0].id").value(newer.toString()))
                .andExpect(jsonPath("$.items[0].text").value("Keep the knee tracking over the toes.")).andExpect(jsonPath("$.items[0].authorName").value("Arun Prakash"))
                .andExpect(jsonPath("$.items[0].sharedAt").isNumber()).andExpect(jsonPath("$.items[0].createdAt").isNumber()).andExpect(jsonPath("$.items[1].id").value(older.toString()))
                .andExpect(jsonPath("$.items[0].pinned").doesNotExist()).andExpect(jsonPath("$.nextCursor").value(nullValue())));
        assertFalse(out.contains("Private to Arun") || out.contains("somebody else") || out.contains("deleted"));
        jdbc.update("UPDATE client_note SET shared_with_client = false, shared_at = NULL WHERE id = :n::uuid", Map.of("n", newer.toString()));
        get(token, "/v1/portal/notes").andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].id").value(older.toString()));
        String page = body(get(token, "/v1/portal/notes?limit=1"));
        assertNull(com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor"));
    }

    @Test
    @DisplayName("the bell: the trainer's notices newest first with the unread count over all of them, unread=true narrows the list, an assessment notice rides as 'assessment', and a price only when the client may see money")
    void notices() throws Exception {
        UUID c = live();
        UUID s = session(c, null, ago(0), 60, "scheduled", "trainer", null, null);
        UUID reminder = notice(c, "reminder", "Tomorrow 6:30 am — Lower body A with Arun", Instant.now().minusSeconds(60), false, s);
        UUID asm = notice(c, "checkin", "A new assessment is waiting: Weekly check-in.", ago(1), false, null);
        UUID best = notice(c, "best", "New best: Back squat", ago(2), true, null);
        UUID deleted = notice(c, "note", "Gone", ago(1), false, null);
        jdbc.update("UPDATE client_notification SET deleted_at = now() WHERE id = :n::uuid", Map.of("n", deleted.toString()));
        UUID pack = notice(c, "pack", "Your pack has 2 sessions left", ago(3), false, null);
        jdbc.update("UPDATE client_notification SET amount = 12000 WHERE id = :n::uuid", Map.of("n", pack.toString()));
        UUID other = liveOther();
        notice(other, "note", "Somebody else's", ago(0), false, null);
        String token = tokenFor(phone);

        get(token, "/v1/portal/notices").andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(4))).andExpect(jsonPath("$.items[0].id").value(reminder.toString()))
                .andExpect(jsonPath("$.items[0].kind").value("reminder")).andExpect(jsonPath("$.items[0].sessionId").value(s.toString())).andExpect(jsonPath("$.items[0].readAt").value(nullValue()))
                .andExpect(jsonPath("$.items[1].id").value(asm.toString())).andExpect(jsonPath("$.items[1].kind").value("assessment")).andExpect(jsonPath("$.items[2].id").value(best.toString()))
                .andExpect(jsonPath("$.items[2].readAt").isNumber()).andExpect(jsonPath("$.unreadCount").value(3)).andExpect(jsonPath("$.nextCursor").value(nullValue()));
        get(token, "/v1/portal/notices?unread=true").andExpect(jsonPath("$.items", hasSize(3))).andExpect(jsonPath("$.unreadCount").value(3));
        String page = body(get(token, "/v1/portal/notices?limit=2").andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.nextCursor").isString()));
        get(token, "/v1/portal/notices?limit=2&cursor=" + com.jayway.jsonpath.JsonPath.read(page, "$.nextCursor")).andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.unreadCount").value(3));
        // a price is the trainer's switch: the default is that a client does not see money
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/notices").andExpect(jsonPath("$.items[3].amount").value(nullValue()));
        jdbc.update("UPDATE client SET portal_show_money = true WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/notices").andExpect(jsonPath("$.items[3].amount").value(12000));
    }

    @Test
    @DisplayName("marking notices read: ids or all, once, ignoring what is not theirs or already read without an error; ids and all together, neither, more than 100, or a malformed id are 400")
    void readNotices() throws Exception {
        UUID c = live();
        UUID a = notice(c, "note", "one", ago(1), false, null), b = notice(c, "note", "two", ago(2), false, null), d = notice(c, "note", "three", ago(3), false, null);
        UUID other = liveOther();
        UUID theirs = notice(other, "note", "Theirs", ago(1), false, null);
        String token = tokenFor(phone);

        postJson(token, "/v1/portal/notices/read", "{\"ids\":[\"" + a + "\",\"" + theirs + "\",\"" + UUID.randomUUID() + "\"]}").andExpect(status().isNoContent());
        assertNotNull(jdbc.queryForObject("SELECT read_at FROM client_notification WHERE id = :n::uuid", Map.of("n", a.toString()), java.sql.Timestamp.class));
        assertNull(jdbc.queryForObject("SELECT read_at FROM client_notification WHERE id = :n::uuid", Map.of("n", theirs.toString()), java.sql.Timestamp.class), "somebody else's is not theirs to read");
        jdbc.update("UPDATE client_notification SET read_at = read_at - interval '2 days' WHERE id = :n::uuid", Map.of("n", a.toString()));
        var stamp = jdbc.queryForObject("SELECT read_at FROM client_notification WHERE id = :n::uuid", Map.of("n", a.toString()), java.sql.Timestamp.class);
        postJson(token, "/v1/portal/notices/read", "{\"ids\":[\"" + a + "\"]}").andExpect(status().isNoContent());
        assertEquals(stamp, jdbc.queryForObject("SELECT read_at FROM client_notification WHERE id = :n::uuid", Map.of("n", a.toString()), java.sql.Timestamp.class), "already read: untouched");
        get(token, "/v1/portal/notices?unread=true").andExpect(jsonPath("$.unreadCount").value(2));
        postJson(token, "/v1/portal/notices/read", "{\"all\":true}").andExpect(status().isNoContent());
        get(token, "/v1/portal/notices?unread=true").andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.unreadCount").value(0));
        assertNull(jdbc.queryForObject("SELECT read_at FROM client_notification WHERE id = :n::uuid", Map.of("n", theirs.toString()), java.sql.Timestamp.class));
        // shapes that are not a request
        postJson(token, "/v1/portal/notices/read", "{}").andExpect(status().isBadRequest());
        postJson(token, "/v1/portal/notices/read", "{\"ids\":[\"" + b + "\"],\"all\":true}").andExpect(status().isBadRequest());
        postJson(token, "/v1/portal/notices/read", "{\"ids\":[\"not-an-id\"]}").andExpect(status().isBadRequest());
        String many = java.util.stream.IntStream.range(0, 101).mapToObj(i -> "\"" + UUID.randomUUID() + "\"").collect(java.util.stream.Collectors.joining(","));
        postJson(token, "/v1/portal/notices/read", "{\"ids\":[" + many + "]}").andExpect(status().isBadRequest());
        postJson(token, "/v1/portal/notices/read", "{\"ids\":[\"" + d + "\"],\"x\":1}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on every inbox route, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        UUID m = message(c, "note", "hi", null, ago(1), false);
        String token = tokenFor(phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        for (String u : new String[]{"/v1/portal/messages", "/v1/portal/notes", "/v1/portal/notices"}) {
            get(token, u).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        }
        postJson(token, "/v1/portal/messages/" + m + "/read", "{}").andExpect(status().isForbidden());
        postJson(token, "/v1/portal/notices/read", "{\"all\":true}").andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/messages")).andExpect(status().isUnauthorized());
    }

    private UUID liveOther2() {
        String p = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", p));
        return liveRow(arun, p);
    }

    private String phoneOf(UUID client) {
        return jdbc.queryForObject("SELECT phone FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class);
    }

    private String tokenFor(String p) throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + p + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(p) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private UUID live() {
        trainerOnce();
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", phone));
        return liveRow(arun, phone);
    }

    private UUID liveOther() {
        return liveRow(arun, "+91980000" + String.format("%04d", 1000 + (++seq)));
    }

    private UUID liveRow(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair' WHERE id = :c::uuid", Map.of("c", id.toString()));
        return id;
    }

    private void trainerOnce() {
        me = arun;
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", arun.toString()), String.class));
    }

    private String token() throws Exception {
        return signInToken();
    }

    private UUID program(UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "c", clientId.toString()));
        return id;
    }

    private UUID workout(UUID prog, int week, int day, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, :d, 0, :n)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "p", prog.toString(), "w", week, "d", day, "n", name));
        return id;
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)", Map.of("id", id.toString(), "n", name, "src", "t-" + id));
        return id;
    }

    private UUID workoutExercise(UUID workout, UUID ex, int pos) {
        UUID id = UUID.randomUUID();
        // one exercise row per call would make four exercises; the test wants one exercise with four sets, so reuse the row after the first
        var found = jdbc.queryForList("SELECT id::text FROM workout_exercise WHERE workout_id = :w::uuid AND exercise_id = :e::uuid", Map.of("w", workout.toString(), "e", ex.toString()), String.class);
        if (!found.isEmpty()) return UUID.fromString(found.getFirst());
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, :p)",
                Map.of("id", id.toString(), "ten", tenant.toString(), "w", workout.toString(), "e", ex.toString(), "p", pos));
        return id;
    }

    private void workoutSet(UUID we, int rest) {
        int pos = jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", we.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, load_value, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, :p, 'weight', 'reps', 20, 10, :r)",
                Map.of("ten", tenant.toString(), "w", we.toString(), "p", pos, "r", rest));
    }

    private UUID session(UUID clientId, UUID workoutId, Instant at, int minutes, String status, String loggedBy, Instant started, Instant ended) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("w", workoutId == null ? null : workoutId.toString());
        m.put("at", java.sql.Timestamp.from(at)); m.put("m", minutes); m.put("e", java.sql.Timestamp.from(at.plusSeconds(minutes * 60L))); m.put("s", status); m.put("lb", loggedBy);
        m.put("st", started == null ? null : java.sql.Timestamp.from(started)); m.put("en", ended == null ? null : java.sql.Timestamp.from(ended));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, CAST(:w AS uuid), :at, :m, :e, :s, :lb, :st, :en)""", m);
        return id;
    }

    private void setDone(UUID sessionId, UUID clientId, UUID ex, int load, int reps, Instant at) {
        UUID sx = UUID.fromString(jdbc.queryForList("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid",
                Map.of("s", sessionId.toString(), "e", ex.toString()), String.class).stream().findFirst().orElseGet(() -> {
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                    Map.of("x", id.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", ex.toString()));
            return id.toString();
        }));
        int pos = jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at) VALUES (:x::uuid, :p, false, 'weight', 'reps', :l, :r, :at)",
                Map.of("x", sx.toString(), "p", pos, "l", load, "r", reps, "at", java.sql.Timestamp.from(at)));
    }

    private UUID message(UUID clientId, String kind, String body, UUID sessionId, Instant at, boolean deleted) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("k", kind); m.put("b", body);
        m.put("s", sessionId == null ? null : sessionId.toString()); m.put("at", java.sql.Timestamp.from(at)); m.put("d", deleted);
        jdbc.update("""
                INSERT INTO client_message (id, tenant_id, client_id, trainer_id, session_id, body, kind, at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, CAST(:s AS uuid), :b, :k, :at, CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    private void pack(UUID clientId, int total, int left) {
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', :tot, :left, 12000, 'INR', current_date, current_date + 60)""",
                Map.of("t", arun.toString(), "c", clientId.toString(), "tot", total, "left", left));
    }

    private void milestone(UUID clientId, String kind, String label, Instant at) {
        jdbc.update("INSERT INTO milestone (tenant_id, client_id, kind, label, at) SELECT tenant_id, id, :k, :l, :at FROM client WHERE id = :c::uuid",
                Map.of("k", kind, "l", label, "at", java.sql.Timestamp.from(at), "c", clientId.toString()));
    }

    private void assessment(UUID clientId, boolean sent, java.time.LocalDate due) {
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
                SELECT gen_random_uuid(), c.tenant_id, c.trainer_id, c.id, t.id, 'Weekly check-in', '{"measurements":[],"questions":[]}'::jsonb, :d::date, now()
                  FROM client c JOIN assessment_template t ON t.trainer_id = c.trainer_id WHERE c.id = :c::uuid LIMIT 1""",
                Map.of("d", due.toString(), "c", clientId.toString()));
    }

    /** The credential verify answers for this number. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private UUID client(UUID trainerId, String p, String membership) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("p", p);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', :p, 'independent')", m);
        if ("invited".equals(membership)) jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
        return id;
    }

    private UUID trainer(String p, String name, String headline) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", p));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", p), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au, "n", name));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (gen_random_uuid(), :t::uuid, 'Weekly')", Map.of("t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender portalInboxCapturingSender() {
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
