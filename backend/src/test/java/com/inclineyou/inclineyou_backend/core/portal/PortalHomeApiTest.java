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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, p-a2: {@code GET /v1/portal/home}. One hero by the S-02 rule — a booked session, a self-run day, a rest day, or
 * the first-run state — and the cards under it, every one of them this client's own. Run through the security chain, because the
 * refusals for a paused or removed client are part of the contract.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalHomeApiTest.CapturingSender.class)
@Transactional
class PortalHomeApiTest {

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
    private final java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength & fat-loss");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    @Test
    @DisplayName("nothing yet: the empty hero, no card of any kind, and the trainer to say hello to")
    void emptyState() throws Exception {
        live();
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(status().isOk())
                .andExpect(jsonPath("$.access").value("active")).andExpect(jsonPath("$.trainer.name").value("Arun Prakash"))
                .andExpect(jsonPath("$.timezone").value("Asia/Kolkata")).andExpect(jsonPath("$.now").isNumber())
                .andExpect(jsonPath("$.hero.kind").value("empty")).andExpect(jsonPath("$.hero.session").doesNotExist())
                .andExpect(jsonPath("$.message").doesNotExist()).andExpect(jsonPath("$.package").doesNotExist())
                .andExpect(jsonPath("$.lastRecap").doesNotExist()).andExpect(jsonPath("$.recentMilestone").doesNotExist())
                .andExpect(jsonPath("$.assessments").doesNotExist()).andExpect(jsonPath("$.unreadNotices").value(0))
                .andExpect(jsonPath("$.installEligible").value(false));
    }

    @Test
    @DisplayName("a session today that has not ended is the hero, with its place and a WhatsApp draft naming it — and never a Start; one that has ended is not")
    void sessionHero() throws Exception {
        UUID c = live();
        jdbc.update("UPDATE trainer_business SET gym_name = 'Cult Koramangala', training_modes = '[\"gym_floor\"]'::jsonb WHERE trainer_id = :t::uuid", Map.of("t", arun.toString()));
        UUID w = workout(program(c), 1, 1, "Lower body A");
        Instant start = Instant.now().plusSeconds(60);   // a minute out: still today in any zone the test runs in
        UUID s = session(c, w, start, 60, "scheduled", "trainer", null, null);
        UUID later = session(c, null, Instant.now().plusSeconds(200), 60, "scheduled", "trainer", null, null);   // a later one today: not this card
        session(c, null, Instant.now().plus(2, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);
        // somebody else's session today must never be the hero
        UUID other = liveOther();
        session(other, null, Instant.now().plusSeconds(30), 45, "scheduled", "trainer", null, null);

        String body = mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(status().isOk())
                .andExpect(jsonPath("$.hero.kind").value("session")).andExpect(jsonPath("$.hero.session.id").value(s.toString()))
                .andExpect(jsonPath("$.hero.session.durationMinutes").value(60)).andExpect(jsonPath("$.hero.session.workoutName").value("Lower body A"))
                .andExpect(jsonPath("$.hero.session.place").value("Cult Koramangala"))
                .andExpect(jsonPath("$.hero.session.rescheduleUrl").value(org.hamcrest.Matchers.startsWith("https://wa.me/919100002501?text=Hi%20Arun%2C%20can%20we%20move%20my%20session")))
                .andExpect(jsonPath("$.hero.workout").doesNotExist()).andExpect(jsonPath("$.hero.resume").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("start"), "a booked session is never started by the client");

        jdbc.update("DELETE FROM scheduled_session WHERE id = :s::uuid", Map.of("s", later.toString()));
        jdbc.update("UPDATE scheduled_session SET scheduled_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' WHERE id = :s::uuid", Map.of("s", s.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.hero.kind").value("rest"))
                .andExpect(jsonPath("$.hero.nextSession.id").isString());
    }

    @Test
    @DisplayName("a self-run day: the first program day with no done session that the trainer has not booked this week — with its size, and a resume when one was started")
    void selfRun() throws Exception {
        UUID c = live();
        UUID prog = program(c);
        UUID d1 = workout(prog, 1, 1, "Day A");
        UUID d2 = workout(prog, 1, 2, "Day B");
        UUID d3 = workout(prog, 1, 3, "Day C");
        UUID ex = exercise("Goblet squat");
        for (int i = 0; i < 4; i++) workoutSet(workoutExercise(d3, ex, i), 90);
        session(c, d1, Instant.now().minus(3, ChronoUnit.DAYS), 60, "done", "trainer", Instant.now().minus(3, ChronoUnit.DAYS), Instant.now().minus(3, ChronoUnit.DAYS).plusSeconds(3000));
        session(c, d2, Instant.now().plus(3, ChronoUnit.DAYS), 60, "scheduled", "trainer", null, null);   // booked to the trainer this week: skipped

        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(status().isOk())
                .andExpect(jsonPath("$.hero.kind").value("selfRun")).andExpect(jsonPath("$.hero.workout.id").value(d3.toString()))
                .andExpect(jsonPath("$.hero.workout.name").value("Day C")).andExpect(jsonPath("$.hero.workout.week").value(1)).andExpect(jsonPath("$.hero.workout.day").value(3))
                .andExpect(jsonPath("$.hero.workout.exerciseCount").value(1)).andExpect(jsonPath("$.hero.workout.estimatedMinutes").value(10))
                .andExpect(jsonPath("$.hero.resume").doesNotExist());

        UUID started = session(c, d3, Instant.now().minusSeconds(600), 45, "scheduled", "client", Instant.now().minusSeconds(600), null);
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.hero.kind").value("selfRun"))
                .andExpect(jsonPath("$.hero.resume.sessionId").value(started.toString()));

        // Once the booked day has come and been done, the next one up is B again.
        jdbc.update("DELETE FROM scheduled_session WHERE id = :s::uuid", Map.of("s", started.toString()));
    }

    @Test
    @DisplayName("rest: a session of either kind finished today, or nothing left in the program this cycle — with the next session when there is one")
    void rest() throws Exception {
        UUID c = live();
        UUID prog = program(c);
        UUID d1 = workout(prog, 1, 1, "Day A");
        Instant next = Instant.now().plus(2, ChronoUnit.DAYS);
        session(c, null, next, 60, "scheduled", "trainer", null, null);
        // the only day is done, and it was done today
        session(c, d1, Instant.now().minusSeconds(1800), 30, "done", "client", Instant.now().minusSeconds(1800), Instant.now().minusSeconds(60));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.hero.kind").value("rest"))
                .andExpect(jsonPath("$.hero.nextSession.scheduledAt").value(next.toEpochMilli()))
                .andExpect(jsonPath("$.installEligible").value(true));
        // done yesterday instead: nothing left in the program, still a rest
        jdbc.update("UPDATE scheduled_session SET scheduled_at = now() - interval '30 hours', started_at = now() - interval '30 hours', ended_at = now() - interval '29 hours' WHERE workout_id = :w::uuid", Map.of("w", d1.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.hero.kind").value("rest"));
        // no program, a session ahead: rest, not empty
        jdbc.update("UPDATE program SET status = 'completed' WHERE id = :p::uuid", Map.of("p", prog.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.hero.kind").value("rest"))
                .andExpect(jsonPath("$.hero.nextSession.id").isString());
    }

    @Test
    @DisplayName("the cards: the newest general line (never a recap), the package balance with no price, the last session's recap with a personal best and the trainer's note, a recent milestone, and the assessment due")
    void cards() throws Exception {
        UUID c = live();
        message(c, "note", "Older word.", null, Instant.now().minus(5, ChronoUnit.DAYS), false);
        UUID newest = message(c, "weekly", "Big week ahead — keep the protein up.", null, Instant.now().minus(1, ChronoUnit.DAYS), false);
        message(c, "note", "Deleted.", null, Instant.now(), true);
        pack(c, 12, 7);

        UUID ex = exercise("Back squat");
        Instant before = Instant.now().minus(9, ChronoUnit.DAYS);
        UUID s0 = session(c, null, before, 60, "done", "trainer", before, before.plusSeconds(3000));
        setDone(s0, c, ex, 70, 5, before.plusSeconds(600));
        Instant at = Instant.now().minus(1, ChronoUnit.DAYS);
        UUID s1 = session(c, null, at, 60, "done", "trainer", at, at.plusSeconds(3000));
        setDone(s1, c, ex, 80, 5, at.plusSeconds(600));
        setDone(s1, c, ex, 60, 10, at.plusSeconds(900));
        UUID recap = message(c, "recap", "Depth was spot on today.", s1, at.plusSeconds(4000), false);
        message(c, "recap", "A note about an older session.", s0, before.plusSeconds(4000), false);
        milestone(c, "sessions_50", "50th session", Instant.now().minusSeconds(3600));
        milestone(c, "old", "Old news", Instant.now().minus(5, ChronoUnit.DAYS));
        assessment(c, true, today.minusDays(2));
        assessment(c, true, today.plusDays(3));
        // another client's everything, to be sure none of it surfaces
        UUID other = liveOther();
        message(other, "note", "FOR SOMEBODY ELSE", null, Instant.now(), false);
        pack(other, 99, 98);

        String body = mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(status().isOk())
                .andExpect(jsonPath("$.message.id").value(newest.toString())).andExpect(jsonPath("$.message.kind").value("weekly"))
                .andExpect(jsonPath("$.message.body").value("Big week ahead — keep the protein up.")).andExpect(jsonPath("$.message.trainerName").value("Arun Prakash"))
                .andExpect(jsonPath("$.message.readAt").doesNotExist())
                .andExpect(jsonPath("$.package.sessionsLeft").value(7)).andExpect(jsonPath("$.package.sessionsTotal").value(12)).andExpect(jsonPath("$.package.paused").value(false))
                .andExpect(jsonPath("$.package.expiresOn").isString())
                .andExpect(jsonPath("$.lastRecap.sessionId").value(s1.toString())).andExpect(jsonPath("$.lastRecap.setsDone").value(2))
                .andExpect(jsonPath("$.lastRecap.volumeKg").value(1000.0))
                .andExpect(jsonPath("$.lastRecap.newBests.length()").value(1)).andExpect(jsonPath("$.lastRecap.newBests[0].name").value("Back squat"))
                .andExpect(jsonPath("$.lastRecap.newBests[0].loadValue").value(80)).andExpect(jsonPath("$.lastRecap.newBests[0].effortValue").value(5))
                .andExpect(jsonPath("$.lastRecap.message.id").value(recap.toString())).andExpect(jsonPath("$.lastRecap.message.body").value("Depth was spot on today."))
                .andExpect(jsonPath("$.recentMilestone.kind").value("sessions_50")).andExpect(jsonPath("$.recentMilestone.label").value("50th session"))
                .andExpect(jsonPath("$.assessments.open").value(2)).andExpect(jsonPath("$.assessments.late").value(1))
                .andExpect(jsonPath("$.assessments.next.dueOn").value(today.minusDays(2).toString()))
                .andExpect(jsonPath("$.installEligible").value(true)).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("FOR SOMEBODY ELSE") || body.contains("amount") || body.contains("price"), "nobody else's, and never a price");

        // The package does not depend on the trainer's money switch: the balance is not money.
        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", arun.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(jsonPath("$.package.sessionsLeft").value(7));
    }

    @Test
    @DisplayName("a paused client is 403 PORTAL_PAUSED and a removed one 403 PORTAL_REMOVED — a refusal that names the wall, not an empty page; a trainer 403, nobody 401")
    void walls() throws Exception {
        UUID c = live();
        String paused = token();
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + paused)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        jdbc.update("UPDATE client SET membership_status = 'removed', status = 'active', paused_at = NULL, removed_at = now(), removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", c.toString()));
        mvc.perform(get("/v1/portal/home").header("Authorization", "Bearer " + token())).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_REMOVED"));
        mvc.perform(get("/v1/portal/home")).andExpect(status().isUnauthorized());
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
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, 0)",
                Map.of("id", id.toString(), "ten", tenant.toString(), "w", workout.toString(), "e", ex.toString()));
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
        CapturingSender portalHomeCapturingSender() {
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
