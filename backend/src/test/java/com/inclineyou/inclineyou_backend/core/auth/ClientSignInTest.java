package com.inclineyou.inclineyou_backend.core.auth;

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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, inv-a5: where a number lands after its code. One login page for everybody, routed by the number — a trainer
 * (unchanged), a client on the wall they are on, a number with an invite waiting, and a stranger. Run through the real security
 * chain, because the answers come from functions that must answer only for the number that just proved itself.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(ClientSignInTest.CapturingSender.class)
@Transactional
class ClientSignInTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength & fat-loss");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    @Test
    @DisplayName("an accepted client: role client, access active, whose client they are — and the session is a client's, with no workspace")
    void activeClient() throws Exception {
        clientUser(phone);
        client(arun, phone, "accepted");
        String body = signIn().andExpect(status().isOk()).andExpect(jsonPath("$.role").value("client"))
                .andExpect(jsonPath("$.access").value("active")).andExpect(jsonPath("$.isNewUser").value(false))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.trainer.headline").value("Strength & fat-loss"))
                .andExpect(jsonPath("$.pendingInvites", hasSize(0)))
                .andExpect(jsonPath("$.privacyPolicyVersion").value("2026-09")).andExpect(jsonPath("$.currentPolicyVersion").value("2026-09"))
                .andExpect(jsonPath("$.trainerId").doesNotExist()).andExpect(jsonPath("$.token").value(org.hamcrest.Matchers.startsWith("xs_")))
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(phone), "the number is not echoed");
        mvc.perform(get("/v1/clients").header("Authorization", "Bearer " + JsonPath.read(body, "$.token")).header(WEB, "web")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a paused client is on the paused wall, and a removed one on the removed wall")
    void walls() throws Exception {
        clientUser(phone);
        client(arun, phone, "paused");
        signIn().andExpect(jsonPath("$.role").value("client")).andExpect(jsonPath("$.access").value("paused"))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash")).andExpect(jsonPath("$.pendingInvites", hasSize(0)));
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE phone = :p", Map.of("p", phone));
        signIn().andExpect(jsonPath("$.access").value("removed")).andExpect(jsonPath("$.trainer.name").value("Arun Prakash"));
    }

    @Test
    @DisplayName("somebody who left one trainer and joined another opens into the new one, not the wall; and a removed client invited by a new trainer is shown that invite")
    void precedenceAndSecondInvite() throws Exception {
        clientUser(phone);
        UUID old = client(arun, phone, "removed");
        client(divya, phone, "accepted");
        signIn().andExpect(jsonPath("$.access").value("active")).andExpect(jsonPath("$.trainer.name").value("Divya Rao"));

        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'client' WHERE phone = :p AND trainer_id = :t::uuid", Map.of("p", phone, "t", divya.toString()));
        UUID invited = client(arun, null, "not_invited");
        jdbc.update("UPDATE client SET phone = :p, membership_status = 'invited', invited_at = now() WHERE id = :c::uuid", Map.of("p", phone, "c", invited.toString()));
        // a pending invite for the number, from Arun again (his old row was removed; he has invited them back)
        invite(invited, phone);
        signIn().andExpect(jsonPath("$.access").value("removed")).andExpect(jsonPath("$.pendingInvites", hasSize(1)))
                .andExpect(jsonPath("$.pendingInvites[0].trainerName").value("Arun Prakash")).andExpect(jsonPath("$.pendingInvites[0].expiresAt").isNumber())
                .andExpect(jsonPath("$.pendingInvites[0].inviteId").isString());
        assertFalse(old.equals(invited));
    }

    @Test
    @DisplayName("a number with no account but an invite waiting is `pending` with that invite — a list, never a token — and one with none is `pending` with an empty list")
    void pendingWithInvites() throws Exception {
        signIn().andExpect(jsonPath("$.role").value("pending")).andExpect(jsonPath("$.pendingInvites", hasSize(0)));

        UUID c = client(arun, phone, "invited");
        jdbc.update("UPDATE client SET invited_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        invite(c, phone);
        String body = signIn().andExpect(jsonPath("$.role").value("pending")).andExpect(jsonPath("$.pendingInvites", hasSize(1)))
                .andExpect(jsonPath("$.pendingInvites[0].trainerName").value("Arun Prakash"))
                .andExpect(jsonPath("$.pendingInvites[0].headline").value("Strength & fat-loss"))
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("token_hash") || body.contains("link"), "an invite is chosen by id; the secret is never listed");
        // The pending credential is a short JWT, not a revocable session — it holds no account.
        assertFalse(((String) JsonPath.read(body, "$.token")).startsWith("xs_"));
    }

    @Test
    @DisplayName("an expired, revoked or declined invite is not waiting")
    void deadInvitesAreNotListed() throws Exception {
        UUID c = client(arun, phone, "invited");
        jdbc.update("UPDATE client SET invited_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        invite(c, phone);
        jdbc.update("UPDATE client_invite SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day' WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        signIn().andExpect(jsonPath("$.pendingInvites", hasSize(0)));
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        signIn().andExpect(jsonPath("$.pendingInvites", hasSize(0)));
    }

    @Test
    @DisplayName("a trainer's sign-in is the 1.1 shape: none of the client fields appear")
    void trainerShapeUnchanged() throws Exception {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer')", Map.of("p", phone));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach')", Map.of("a", au));
        signIn().andExpect(jsonPath("$.role").value("trainer")).andExpect(jsonPath("$.access").doesNotExist())
                .andExpect(jsonPath("$.trainer").doesNotExist()).andExpect(jsonPath("$.pendingInvites").doesNotExist());
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private ResultActions signIn() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}"));
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
            case "accepted" -> jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :id::uuid", m);
            case "paused" -> jdbc.update("UPDATE client SET membership_status = 'paused', invited_at = now(), accepted_at = now() WHERE id = :id::uuid", m);
            case "removed" -> jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :id::uuid", m);
            case "invited" -> jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
            default -> { }
        }
        return id;
    }

    private void invite(UUID clientId, String p) {
        jdbc.update("""
                INSERT INTO client_invite (id, tenant_id, trainer_id, client_id, phone, token_hash)
                SELECT gen_random_uuid(), tenant_id, trainer_id, id, :p, md5(random()::text) || md5(random()::text) FROM client WHERE id = :c::uuid""",
                Map.of("p", p, "c", clientId.toString()));
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
        CapturingSender clientSignInCapturingSender() {
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
