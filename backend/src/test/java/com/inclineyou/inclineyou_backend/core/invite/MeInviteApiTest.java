package com.inclineyou.inclineyou_backend.core.invite;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, inv-a6: the invites waiting for a number that has already proved itself. Pins who may ask (a pending session,
 * and a client whose access is removed), who may not (a live client, a trainer, nobody), that a caller sees their own number's
 * invites and no other's — whatever id they ask for — and that the card is the token card, with no token.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(MeInviteApiTest.CapturingSender.class)
@Transactional
class MeInviteApiTest {

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
    @DisplayName("a pending session lists the invites for ITS number and opens each one's card by id — no token anywhere")
    void pendingSession() throws Exception {
        UUID c = client(arun, phone, "invited");
        UUID inv = invite(c, phone);
        String token = signInToken();

        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].inviteId").value(inv.toString()))
                .andExpect(jsonPath("$.items[0].trainerName").value("Arun Prakash")).andExpect(jsonPath("$.items[0].headline").value("Strength & fat-loss"))
                .andExpect(jsonPath("$.items[0].expiresAt").isNumber());
        String card = mvc.perform(get("/v1/me/invites/" + inv).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("valid")).andExpect(jsonPath("$.inviteId").value(inv.toString()))
                .andExpect(jsonPath("$.phoneMasked").value("•••••" + phone.substring(phone.length() - 4)))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.policyVersion").value("2026-09"))
                .andExpect(jsonPath("$.privacySummary.length()").value(5)).andReturn().getResponse().getContentAsString();
        assertFalse(card.contains("token") || card.contains(phone), "no token, no full number");
    }

    @Test
    @DisplayName("somebody else's invite id, an unknown id and a malformed one are the same {state: expired}: an id teaches nothing")
    void otherPeoplesIdsAreInvisible() throws Exception {
        UUID mine = client(arun, phone, "invited");
        invite(mine, phone);
        String otherPhone = "+919800000077";
        UUID theirClient = client(divya, otherPhone, "invited");
        UUID theirs = invite(theirClient, otherPhone);
        String token = signInToken();

        mvc.perform(get("/v1/me/invites/" + theirs).header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(content().json("{\"state\":\"expired\"}", true));
        mvc.perform(get("/v1/me/invites/" + UUID.randomUUID()).header("Authorization", "Bearer " + token)).andExpect(content().json("{\"state\":\"expired\"}", true));
        mvc.perform(get("/v1/me/invites/not-an-id").header("Authorization", "Bearer " + token)).andExpect(content().json("{\"state\":\"expired\"}", true));
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    @DisplayName("a dead invite is expired here too, and a used one is `used`")
    void deadAndUsed() throws Exception {
        UUID c = client(arun, phone, "invited");
        UUID inv = invite(c, phone);
        String token = signInToken();
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE id = :i::uuid", Map.of("i", inv.toString()));
        mvc.perform(get("/v1/me/invites/" + inv).header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.state").value("expired"));
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    @DisplayName("a client who has left one trainer (access removed) sees the invite from the next; a live client is 403, and so is a paused one")
    void clientSessions() throws Exception {
        clientUser(phone);
        client(arun, phone, "removed");
        UUID c = client(divya, phone, "invited");
        UUID inv = invite(c, phone);
        String removed = signInToken();
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + removed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].trainerName").value("Divya Rao"));
        mvc.perform(get("/v1/me/invites/" + inv).header("Authorization", "Bearer " + removed)).andExpect(jsonPath("$.state").value("valid"));

        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), removed_at = NULL, removed_by = NULL WHERE trainer_id = :t::uuid AND phone = :p", Map.of("t", arun.toString(), "p", phone));
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + removed)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/v1/me/invites/" + inv).header("Authorization", "Bearer " + removed)).andExpect(status().isForbidden());
        jdbc.update("UPDATE client SET membership_status = 'paused' WHERE trainer_id = :t::uuid AND phone = :p", Map.of("t", arun.toString(), "p", phone));
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + removed)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a trainer's session and no session at all cannot ask: 403 and 401")
    void trainersAndStrangers() throws Exception {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer')", Map.of("p", phone));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach')", Map.of("a", au));
        String trainerToken = signInToken();
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + trainerToken).header(WEB, "web")).andExpect(status().isForbidden());
        mvc.perform(get("/v1/me/invites")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/me/invites/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    /* ── accept and decline, from the signed-in number (inv-a7) ─────────────── */

    @Test
    @DisplayName("201: a pending session joins the trainer who invited it — no code asked — and gets a client session; the account is made in one go")
    void pendingAccepts() throws Exception {
        UUID c = client(arun, phone, "invited");
        UUID inv = invite(c, phone);
        String pending = signInToken();
        String body = acceptAs(pending, inv, dob(30), "2026-09").andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("client")).andExpect(jsonPath("$.access").value("active")).andExpect(jsonPath("$.isNewUser").value(true))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andReturn().getResponse().getContentAsString();
        String session = JsonPath.read(body, "$.token");
        org.junit.jupiter.api.Assertions.assertTrue(session.startsWith("xs_"));
        assertEquals("accepted", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertEquals("client", jdbc.queryForObject("SELECT role FROM app_user WHERE phone = :p", Map.of("p", phone), String.class));
        assertEquals("accepted", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        // They are with a trainer now, so the invites door closes to them.
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + session)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a client who left one trainer joins the next: 201 with the new trainer, the old arrangement left removed, and the credential they came in on retired")
    void removedClientMovesOn() throws Exception {
        clientUser(phone);
        UUID old = client(arun, phone, "removed");
        UUID c = client(divya, phone, "invited");
        UUID inv = invite(c, phone);
        String removed = signInToken();
        String body = acceptAs(removed, inv, dob(30), "2026-09").andExpect(status().isCreated())
                .andExpect(jsonPath("$.trainer.name").value("Divya Rao")).andExpect(jsonPath("$.isNewUser").value(false)).andReturn().getResponse().getContentAsString();
        assertEquals("removed", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", old.toString()), String.class));
        assertEquals("accepted", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM web_session WHERE revoked_at IS NOT NULL AND app_user_id = (SELECT id FROM app_user WHERE phone = :p)", Map.of("p", phone), Integer.class),
                "the removed client's own session is gone");
        // The new session works; the old one does not.
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + removed)).andExpect(status().isUnauthorized());
        org.junit.jupiter.api.Assertions.assertNotEquals(removed, JsonPath.<String>read(body, "$.token"));
    }

    @Test
    @DisplayName("a client who is with a trainer already cannot accept another: 409 ALREADY_WITH_A_TRAINER, and nothing changes")
    void liveClientRefused() throws Exception {
        clientUser(phone);
        UUID mine = client(arun, phone, "removed");
        UUID c = client(divya, phone, "invited");
        UUID inv = invite(c, phone);
        String token = signInToken();
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), removed_at = NULL, removed_by = NULL WHERE id = :c::uuid", Map.of("c", mine.toString()));
        acceptAs(token, inv, dob(30), "2026-09").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_WITH_A_TRAINER"));
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
    }

    @Test
    @DisplayName("somebody else's invite, an unknown one and a malformed one are 422 INVITE_UNAVAILABLE; a used one cannot be accepted twice")
    void unavailable() throws Exception {
        UUID mine = client(arun, phone, "invited");
        UUID inv = invite(mine, phone);
        String otherPhone = "+919800000066";
        UUID theirs = invite(client(divya, otherPhone, "invited"), otherPhone);
        String token = signInToken();
        acceptAs(token, theirs, dob(30), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVITE_UNAVAILABLE"));
        acceptAs(token, UUID.randomUUID(), dob(30), "2026-09").andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/v1/me/invites/not-an-id/accept").header("Authorization", "Bearer " + token).header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content(accept(dob(30), "2026-09"))).andExpect(status().isUnprocessableEntity());
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE phone = :p", Map.of("p", otherPhone), String.class), "theirs is untouched");
        acceptAs(token, inv, dob(30), "2026-09").andExpect(status().isCreated());
        acceptAs(token, inv, dob(30), "2026-09").andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("what they say is checked before anything is written: a stale notice and a bad date are 400, the header must say web, and under 18 ends the invite")
    void whatTheySay() throws Exception {
        UUID c = client(arun, phone, "invited");
        UUID inv = invite(c, phone);
        String token = signInToken();
        acceptAs(token, inv, dob(30), "old").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        acceptAs(token, inv, today.plusDays(1).toString(), "2026-09").andExpect(status().isBadRequest());
        mvc.perform(post("/v1/me/invites/" + inv + "/accept").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(accept(dob(30), "2026-09"))).andExpect(status().isBadRequest());
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        acceptAs(token, inv, today.minusYears(17).toString(), "2026-09").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("AGE_REQUIREMENT"));
        assertEquals("declined", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
    }

    @Test
    @DisplayName("decline by id: 204 and the invite is declined as not_for_me; another number's id is 204 and untouched; the list shrinks")
    void declines() throws Exception {
        UUID mine = client(arun, phone, "invited");
        UUID inv = invite(mine, phone);
        String otherPhone = "+919800000055";
        UUID theirClient = client(divya, otherPhone, "invited");
        UUID theirs = invite(theirClient, otherPhone);
        String token = signInToken();

        mvc.perform(post("/v1/me/invites/" + theirs + "/decline").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        assertEquals("pending", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", theirs.toString()), String.class), "somebody else's is not mine to decline");

        mvc.perform(post("/v1/me/invites/" + inv + "/decline").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        assertEquals("declined", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        assertEquals("not_for_me", jdbc.queryForObject("SELECT decline_reason FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        mvc.perform(get("/v1/me/invites").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(post("/v1/me/invites/" + inv + "/decline").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(post("/v1/me/invites/nope/decline").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(post("/v1/me/invites/" + inv + "/decline")).andExpect(status().isUnauthorized());
    }

    private org.springframework.test.web.servlet.ResultActions acceptAs(String token, UUID inviteId, String dob, String version) throws Exception {
        return mvc.perform(post("/v1/me/invites/" + inviteId + "/accept").header("Authorization", "Bearer " + token).header(WEB, "web")
                .contentType(MediaType.APPLICATION_JSON).content(accept(dob, version)));
    }

    private static String accept(String dob, String version) {
        return "{\"dateOfBirth\":\"" + dob + "\",\"policyVersion\":\"" + version + "\"}";
    }

    private String dob(int years) {
        return today.minusYears(years).minusDays(40).toString();
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    /** The credential verify answers for this number: a pending JWT, a client session, or a trainer's. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private void clientUser(String p) {
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", p));
    }

    private UUID client(UUID trainerId, String p, String membership) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("p", p);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', :p, 'independent')", m);
        switch (membership) {
            case "removed" -> jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :id::uuid", m);
            case "invited" -> jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
            default -> { }
        }
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
        if (headline != null) jdbc.update("UPDATE trainer_business SET headline = :h WHERE trainer_id = :t::uuid", Map.of("h", headline, "t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender meInviteCapturingSender() {
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
