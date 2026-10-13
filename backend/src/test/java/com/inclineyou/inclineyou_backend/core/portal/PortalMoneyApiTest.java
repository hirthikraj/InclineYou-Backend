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
 * api-contract 1.2, pm-l1 and pm-l2: the client's package (sessions and dates, never behind the money switch) and money (what is owed and what
 * was paid, behind it). Through the security chain; the suite runs as the schema owner, so the row-level walls are asserted live as the request
 * role, and every statement here also names the client id.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalMoneyApiTest.CapturingSender.class)
@Transactional
class PortalMoneyApiTest {

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

    private UUID pack(UUID client, String name, String status, int total, int left, int amount, int startDaysAgo, int endDaysAhead) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", client.toString()); m.put("n", name); m.put("st", status); m.put("tot", total); m.put("left", left); m.put("a", amount);
        m.put("s", java.sql.Date.valueOf(java.time.LocalDate.now().minusDays(startDaysAgo))); m.put("e", java.sql.Date.valueOf(java.time.LocalDate.now().plusDays(endDaysAhead)));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date, status, closed_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :n, 'floor', 'sessions', :tot, :left, :a, 'INR', :s, :e, :st, CASE WHEN :st <> 'active' THEN now() - interval '30 days' END)""", m);
        return id;
    }

    private UUID paid(UUID client, UUID pack, int amount, String method, String ref, int daysAgo) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", client.toString()); m.put("p", pack.toString()); m.put("a", amount); m.put("m", method); m.put("r", ref); m.put("d", daysAgo);
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, reference, status, paid_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :p::uuid, :a, 'INR', 'trainer', :m, :r, 'paid', now() - make_interval(days => :d))""", m);
        return id;
    }

    @Test
    @DisplayName("the package: the one being followed with sessions used and left and its dates, the closed ones apart, and the ledger only while the trainer lets this client see money — sessions never go with the switch")
    void pack() throws Exception {
        UUID c = live();
        UUID old = pack(c, "6 sessions", "completed", 6, 0, 6000, 90, -20);
        UUID now = pack(c, "12 sessions", "active", 12, 7, 12000, 40, 50);
        jdbc.update("INSERT INTO package_adjustment (package_id, trainer_id, client_id, kind, days, effective_at) VALUES (:p::uuid, :t::uuid, :c::uuid, 'extend', 14, now() - interval '5 days')", Map.of("p", now.toString(), "t", arun.toString(), "c", c.toString()));
        UUID other = liveOther();
        pack(other, "Somebody else's", "active", 99, 99, 999, 1, 10);
        String token = tokenFor(phone);

        String out = body(get(token, "/v1/portal/package").andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.package.id").value(now.toString())).andExpect(jsonPath("$.package.name").value("12 sessions")).andExpect(jsonPath("$.package.status").value("active"))
                .andExpect(jsonPath("$.package.sessionsTotal").value(12)).andExpect(jsonPath("$.package.sessionsLeft").value(7)).andExpect(jsonPath("$.package.sessionsUsed").value(5))
                .andExpect(jsonPath("$.package.startsOn").isString()).andExpect(jsonPath("$.package.paused").value(false))
                .andExpect(jsonPath("$.past", hasSize(1))).andExpect(jsonPath("$.past[0].id").value(old.toString())).andExpect(jsonPath("$.past[0].status").value("completed"))
                .andExpect(jsonPath("$.past[0].sessionsTotal").value(6)).andExpect(jsonPath("$.past[0].endedOn").isString())
                .andExpect(jsonPath("$.history", hasSize(1))).andExpect(jsonPath("$.history[0].kind").value("extend")).andExpect(jsonPath("$.history[0].days").value(14)).andExpect(jsonPath("$.history[0].sessions").doesNotExist()));
        assertFalse(out.contains("12000") || out.contains("amount") || out.contains("999"), "no price, and nobody else's");

        // the switch off: sessions stay, the ledger goes — the key is absent, not empty
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/package").andExpect(jsonPath("$.package.sessionsLeft").value(7)).andExpect(jsonPath("$.history").doesNotExist()).andExpect(jsonPath("$.past", hasSize(1)));
        // nothing bought yet: package null, no past
        UUID c2 = liveOther2();
        get(tokenFor(phoneOf(c2)), "/v1/portal/package").andExpect(jsonPath("$.package").value(nullValue())).andExpect(jsonPath("$.past", hasSize(0)));
    }

    @Test
    @DisplayName("money: what is owed is the trainer's own ledger sum, and the payments recorded as collected for this client newest first, paged — and exactly {visible:false} when the switch is off")
    void money() throws Exception {
        UUID c = live();
        UUID a = pack(c, "12 sessions", "active", 12, 7, 12000, 40, 50);
        UUID b = pack(c, "6 sessions", "completed", 6, 0, 6000, 90, -20);
        UUID p1 = paid(c, a, 4000, "upi", "UTR 4023", 20);
        UUID p2 = paid(c, a, 5600, "cash", null, 5);
        paid(c, b, 6000, "upi", null, 60);
        UUID pending = UUID.randomUUID();
        jdbc.update("INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status) VALUES (:id::uuid, :t::uuid, :c::uuid, :p::uuid, 1000, 'INR', 'trainer', 'upi', 'pending')",
                Map.of("id", pending.toString(), "t", arun.toString(), "c", c.toString(), "p", a.toString()));
        UUID other = liveOther();
        UUID theirPack = pack(other, "Theirs", "active", 5, 5, 5000, 1, 10);
        paid(other, theirPack, 2000, "upi", null, 1);
        String token = tokenFor(phone);

        String page = body(get(token, "/v1/portal/money?limit=2").andExpect(status().isOk()).andExpect(jsonPath("$.visible").value(true)).andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.amountDue").value("2400.00")).andExpect(jsonPath("$.payments.items", hasSize(2)))
                .andExpect(jsonPath("$.payments.items[0].id").value(p2.toString())).andExpect(jsonPath("$.payments.items[0].amount").value("5600.00")).andExpect(jsonPath("$.payments.items[0].method").value("cash"))
                .andExpect(jsonPath("$.payments.items[0].packageName").value("12 sessions")).andExpect(jsonPath("$.payments.items[0].status").value("paid")).andExpect(jsonPath("$.payments.items[0].paidOn").isString())
                .andExpect(jsonPath("$.payments.items[1].id").value(p1.toString())).andExpect(jsonPath("$.payments.items[1].reference").value("UTR 4023")).andExpect(jsonPath("$.payments.nextCursor").isString()));
        get(token, "/v1/portal/money?limit=2&cursor=" + com.jayway.jsonpath.JsonPath.read(page, "$.payments.nextCursor")).andExpect(jsonPath("$.payments.items", hasSize(1))).andExpect(jsonPath("$.payments.nextCursor").value(nullValue()))
                .andExpect(jsonPath("$.amountDue").value("2400.00"));
        assertFalse(body(get(token, "/v1/portal/money")).contains("2000.00"), "nobody else's payments");
        get(token, "/v1/portal/money?cursor=nonsense").andExpect(status().isBadRequest());
        // a written-off remainder is not owed; a cancelled pack owes nothing
        jdbc.update("INSERT INTO payment (trainer_id, client_id, package_id, amount, currency, collected_by, method, status, written_off_at) VALUES (:t::uuid, :c::uuid, :p::uuid, 2400, 'INR', 'trainer', NULL, 'write_off', now())",
                Map.of("t", arun.toString(), "c", c.toString(), "p", a.toString()));
        get(token, "/v1/portal/money").andExpect(jsonPath("$.amountDue").value("0.00")).andExpect(jsonPath("$.payments.items", hasSize(3)));

        // the switch off, per client: exactly {visible:false}
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", c.toString()));
        assertEquals("{\"visible\":false}", body(get(token, "/v1/portal/money").andExpect(status().isOk())));
        // the trainer's own switch is the default when the client has none
        jdbc.update("UPDATE client SET portal_show_money = NULL WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/money").andExpect(jsonPath("$.visible").value(true));
        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", arun.toString()));
        assertEquals("{\"visible\":false}", body(get(token, "/v1/portal/money")));
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on both routes, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        for (String u : new String[]{"/v1/portal/package", "/v1/portal/money"}) get(token, u).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/package")).andExpect(status().isUnauthorized());
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
        CapturingSender portalMoneyCapturingSender() {
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
