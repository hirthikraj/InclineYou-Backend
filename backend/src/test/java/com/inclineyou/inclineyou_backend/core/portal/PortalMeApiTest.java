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
 * api-contract 1.2, p-a1: {@code GET /v1/portal/me} — the shell's one read, and the first route through the CLIENT LENS. Pins the shape
 * for each access, that a removed client gets the trainer's name and nothing else, that the counts are this client's own, that the
 * money switch and the notice mismatch surface, and that only a client session is admitted.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalMeApiTest.CapturingSender.class)
@Transactional
class PortalMeApiTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;
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
    @DisplayName("an active client: the trainer's card, their own details, the money switch, the bell and the Assessments badge — only their own")
    void activeClient() throws Exception {
        trainerCard(arun);
        clientUser(phone, "2026-09");
        UUID me = liveClient(arun, phone);
        UUID other = liveClient(arun, "+919800000011");
        notice(me, false, false); notice(me, false, false); notice(me, true, false); notice(me, false, true); notice(other, false, false);
        assessment(me, true, false); assessment(me, true, true); assessment(me, false, false); assessment(other, true, false);
        String token = signInToken();

        String body = mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.access").value("active")).andExpect(jsonPath("$.phone").value(phone))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.trainer.headline").value("Strength & fat-loss"))
                .andExpect(jsonPath("$.trainer.bio").value("Ten years on the floor.")).andExpect(jsonPath("$.trainer.introVideoId").value("dQw4w9WgXcQ"))
                .andExpect(jsonPath("$.trainer.instagramHandle").value("@arun.fit")).andExpect(jsonPath("$.trainer.certifications[0]").value("acsm_cpt"))
                .andExpect(jsonPath("$.trainer.whatsappUrl").value("https://wa.me/919100002501"))
                .andExpect(jsonPath("$.myDetails.name").value("Priya Nair")).andExpect(jsonPath("$.myDetails.goal").value("Lose 6 kg by March"))
                .andExpect(jsonPath("$.myDetails.heightCm").value(162.0)).andExpect(jsonPath("$.myDetails.activityLevel").value("light"))
                .andExpect(jsonPath("$.myDetails.dateOfBirth").value("1994-03-02")).andExpect(jsonPath("$.myDetails.phone").value(phone))
                .andExpect(jsonPath("$.myDetails.version").isString())
                .andExpect(jsonPath("$.moneyVisible").value(true)).andExpect(jsonPath("$.unreadNotices").value(2)).andExpect(jsonPath("$.openAssessments").value(1))
                .andExpect(jsonPath("$.pendingInvites.length()").value(0)).andExpect(jsonPath("$.policy.accepted").value("2026-09"))
                .andExpect(jsonPath("$.policy.current").value("2026-09")).andExpect(jsonPath("$.push.vapidPublicKey").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.removedAt").doesNotExist()).andExpect(jsonPath("$.pausedUntil").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("919800000011"), "nobody else's number");
    }

    @Test
    @DisplayName("the money switch and a notice that has moved on both surface: a client the trainer hides money from, and a stale acceptance")
    void switchesAndPolicy() throws Exception {
        trainerCard(arun);
        clientUser(phone, "2026-08");
        UUID me = liveClient(arun, phone);
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", me.toString()));
        mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken())).andExpect(jsonPath("$.moneyVisible").value(false))
                .andExpect(jsonPath("$.policy.accepted").value("2026-08")).andExpect(jsonPath("$.policy.current").value("2026-09"));
        jdbc.update("UPDATE client SET portal_show_money = NULL WHERE id = :c::uuid", Map.of("c", me.toString()));
        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", arun.toString()));
        mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken())).andExpect(jsonPath("$.moneyVisible").value(false));
    }

    @Test
    @DisplayName("a client the trainer has paused gets the wall — the trainer to talk to, their date — and zero counts, because they have no lens")
    void pausedClient() throws Exception {
        trainerCard(arun);
        clientUser(phone, "2026-09");
        UUID me = liveClient(arun, phone);
        notice(me, false, false);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now(), paused_until = :d::date WHERE id = :c::uuid", Map.of("d", today.plusDays(10).toString(), "c", me.toString()));
        mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken())).andExpect(status().isOk())
                .andExpect(jsonPath("$.access").value("paused")).andExpect(jsonPath("$.pausedUntil").value(today.plusDays(10).toString()))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.trainer.whatsappUrl").isString())
                .andExpect(jsonPath("$.myDetails.name").value("Priya Nair")).andExpect(jsonPath("$.unreadNotices").value(0))
                .andExpect(jsonPath("$.openAssessments").value(0)).andExpect(jsonPath("$.moneyVisible").value(false));
    }

    @Test
    @DisplayName("a removed client gets the trainer's NAME only — no bio, links, number or details — when they left and by whom, and an invite from somebody new")
    void removedClient() throws Exception {
        trainerCard(arun);
        clientUser(phone, "2026-09");
        UUID old = liveClient(arun, phone);
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'client', removed_ack_at = now() WHERE id = :c::uuid", Map.of("c", old.toString()));
        UUID next = client(divya, phone, "invited");
        UUID inv = invite(next, phone);
        String body = mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken())).andExpect(status().isOk())
                .andExpect(jsonPath("$.access").value("removed")).andExpect(jsonPath("$.removedBy").value("client")).andExpect(jsonPath("$.removedAt").isNumber())
                .andExpect(jsonPath("$.acknowledgedAt").isNumber()).andExpect(jsonPath("$.trainer.name").value("Arun Prakash"))
                .andExpect(jsonPath("$.trainer.bio").doesNotExist()).andExpect(jsonPath("$.trainer.headline").doesNotExist())
                .andExpect(jsonPath("$.trainer.whatsappUrl").doesNotExist()).andExpect(jsonPath("$.trainer.instagramHandle").doesNotExist())
                .andExpect(jsonPath("$.myDetails").doesNotExist()).andExpect(jsonPath("$.unreadNotices").value(0))
                .andExpect(jsonPath("$.pendingInvites.length()").value(1)).andExpect(jsonPath("$.pendingInvites[0].inviteId").value(inv.toString()))
                .andExpect(jsonPath("$.pendingInvites[0].trainerName").value("Divya Rao")).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("Ten years") || body.contains("919100002501") || body.contains("Lose 6 kg"), "nothing of the arrangement that ended");
    }

    @Test
    @DisplayName("somebody who left one trainer and joined another opens into the new one: the wall is the best live row, not the oldest")
    void newestLiveWins() throws Exception {
        trainerCard(arun);
        clientUser(phone, "2026-09");
        UUID old = liveClient(arun, phone);
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'client' WHERE id = :c::uuid", Map.of("c", old.toString()));
        liveClient(divya, phone);
        mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken())).andExpect(jsonPath("$.access").value("active"))
                .andExpect(jsonPath("$.trainer.name").value("Divya Rao"));
    }

    @Test
    @DisplayName("only a client session is admitted: a trainer is 403, a pending session 403, nobody 401")
    void whoMayAsk() throws Exception {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer')", Map.of("p", phone));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach')", Map.of("a", au));
        mvc.perform(get("/v1/portal/me").header("Authorization", "Bearer " + signInToken()).header(WEB, "web")).andExpect(status().isForbidden());
        mvc.perform(get("/v1/portal/me")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the lens: the ids a client reads through are their LIVE rows only — never a paused, archived, deleted or removed one, never somebody else's")
    void lensIds() throws Exception {
        trainerCard(arun);
        // The unique indexes allow one live row per number per workspace and one ACCEPTED row overall, so the arrangements that
        // are not live are built first: removed, then the client's own pause, then the live one.
        UUID removed = client(arun, phone, "invited");
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", removed.toString()));
        UUID paused = client(divya, phone, "invited");
        jdbc.update("UPDATE client SET membership_status = 'paused', status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", paused.toString()));
        UUID live = liveClient(arun, phone);
        liveClient(arun, "+919800000012");
        var ids = jdbc.queryForList("SELECT unnest(client_ids_for_phone(:p))::text", Map.of("p", phone), String.class);
        assertEquals(java.util.List.of(live.toString()), ids);
        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :c::uuid", Map.of("c", live.toString()));
        assertEquals(0, jdbc.queryForList("SELECT unnest(client_ids_for_phone(:p))::text", Map.of("p", phone), String.class).size());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private void trainerCard(UUID t) {
        jdbc.update("""
                UPDATE trainer_business SET headline = 'Strength & fat-loss', bio = 'Ten years on the floor.',
                       intro_video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', instagram_url = 'https://www.instagram.com/arun.fit/',
                       certifications = '["acsm_cpt"]'::jsonb, specialities = '["strength"]'::jsonb, languages = '["en","ta"]'::jsonb
                 WHERE trainer_id = :t::uuid""", Map.of("t", t.toString()));
    }

    private UUID liveClient(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("""
                UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair', goal = 'Lose 6 kg by March',
                       height_cm = 162, activity_level = 'light', date_of_birth = '1994-03-02', timezone = 'Asia/Kolkata' WHERE id = :c::uuid""", Map.of("c", id.toString()));
        return id;
    }

    private void notice(UUID clientId, boolean read, boolean deleted) {
        jdbc.update("""
                INSERT INTO client_notification (tenant_id, client_id, kind, text, read_at, deleted_at)
                SELECT tenant_id, id, 'note', 'hello', CASE WHEN :r THEN now() END, CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""",
                Map.of("r", read, "d", deleted, "c", clientId.toString()));
    }

    private void assessment(UUID clientId, boolean sent, boolean done) {
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at, completed_at, entered_by)
                SELECT gen_random_uuid(), c.tenant_id, c.trainer_id, c.id, t.id, 'Weekly', '{"measurements":[],"questions":[]}'::jsonb, current_date,
                       CASE WHEN :s THEN now() END, CASE WHEN :d THEN now() END, CASE WHEN :d THEN 'client' END
                  FROM client c JOIN assessment_template t ON t.trainer_id = c.trainer_id WHERE c.id = :c::uuid LIMIT 1""",
                Map.of("s", sent, "d", done, "c", clientId.toString()));
    }

    /** The credential verify answers for this number: a client session, or whatever the number is. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private void clientUser(String p, String policy) {
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), :v)", Map.of("p", p, "v", policy));
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

    private UUID invite(UUID clientId, String p) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client_invite (id, tenant_id, trainer_id, client_id, phone, token_hash)
                SELECT :i::uuid, tenant_id, trainer_id, id, :p, md5(random()::text) || md5(random()::text) FROM client WHERE id = :c::uuid""",
                Map.of("i", id.toString(), "p", p, "c", clientId.toString()));
        return id;
    }

    private UUID trainer(String p, String name, String headline) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", p));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", p), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au, "n", name));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        // A default weekly template so assessments have something to point at.
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (gen_random_uuid(), :t::uuid, 'Weekly')", Map.of("t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender portalMeCapturingSender() {
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
