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

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract, Sign in — the whole door, through the real security filter chain:
 * ask for a code, check it, and either walk in as a trainer, become one, or be
 * told a client-only number has nowhere to go.
 *
 * <p>What is worth pinning is the seams the screens branch on: the request id
 * (not a phone number) is what verify takes; a newer request retires the older
 * one; a new number gets a pending token that can claim and do nothing else; the
 * claim is idempotent; and a stale session says which way it went stale.
 *
 * <p>The resend ladder is switched off here so one number can ask twice — its
 * rungs are pinned in {@code OtpSendLimiterTest}.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(SignInFlowTest.CapturingSender.class)
@Transactional
class SignInFlowTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;
    @Autowired SessionStore sessions;
    @Autowired org.springframework.beans.factory.ObjectProvider<RedisOtpStore> redis;

    private MockMvc mvc;
    private String phone;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        // A fresh number each time: the lock and the send window are keyed by it and outlive a rolled-back test in Redis.
        phone = "+91" + (6 + ThreadLocalRandom.current().nextInt(4))
                + String.format("%09d", ThreadLocalRandom.current().nextInt(1_000_000_000));
    }

    /* --------------------------------------------------------------- request */

    @Test
    @DisplayName("a request answers an id with no phone in it, when the code dies, and the resend wait")
    void requestShape() throws Exception {
        mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNumber())
                .andExpect(jsonPath("$.resendAfterSeconds").isNumber());
    }

    @Test
    @DisplayName("a malformed number is PHONE_INVALID, and nothing is sent")
    void badNumber() throws Exception {
        for (String bad : new String[]{"9876543210", "+915876543210", "+91987", ""}) {
            mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"phone\":\"" + bad + "\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("PHONE_INVALID"));
        }
        mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PHONE_INVALID"));
        assertThat(sender.sent).isEmpty();
    }

    @Test
    @DisplayName("delivery status is keyed by the request id: sent once dispatched, 404 for an unknown or malformed id")
    void deliveryStatus() throws Exception {
        String id = requestCode();

        mvc.perform(get("/v1/auth/otp/requests/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deliveryStatus").value("sent"))
                .andExpect(jsonPath("$.deliveryError").doesNotExist())
                .andExpect(jsonPath("$.expiresAt").isNumber());

        mvc.perform(get("/v1/auth/otp/requests/" + UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("OTP_REQUEST_NOT_FOUND"));
        mvc.perform(get("/v1/auth/otp/requests/not-an-id"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("OTP_REQUEST_NOT_FOUND"));
    }

    @Test
    @DisplayName("a newer request retires the older: only the latest id can be verified or polled")
    void supersededRequest() throws Exception {
        String first = requestCode();
        String second = requestCode();

        verify(first, sender.codeFor(phone)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("OTP_REQUEST_NOT_FOUND"));
        mvc.perform(get("/v1/auth/otp/requests/" + first)).andExpect(status().isNotFound());

        verify(second, sender.codeFor(phone)).andExpect(status().isOk());
    }

    /* ---------------------------------------------------------------- verify */

    @Test
    @DisplayName("a new number is pending: a 15-minute token, no trainer, nothing to show yet")
    void newNumberIsPending() throws Exception {
        String id = requestCode();

        verify(id, sender.codeFor(phone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("pending"))
                .andExpect(jsonPath("$.isNewUser").value(true))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.sessionId").doesNotExist())
                .andExpect(jsonPath("$.trainerId").doesNotExist())
                .andExpect(jsonPath("$.setupCompletedAt").doesNotExist())
                .andExpect(jsonPath("$.currentPolicyVersion").value("2026-09"));
    }

    @Test
    @DisplayName("a wrong code is OTP_WRONG with attempts left; the third wrong one locks the NUMBER, a fresh request included")
    void wrongCodeThenLock() throws Exception {
        // The Postgres store counts a wrong guess in its own committed transaction, which cannot see a row this
        // test has not committed; its counting is pinned in JpaOtpStoreTest instead.
        assumeTrue(redis.getIfAvailable() != null && redis.getObject().available(),
                "needs Redis — the Postgres store is covered by JpaOtpStoreTest");
        String id = requestCode();

        verify(id, "000000").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("OTP_WRONG"))
                .andExpect(jsonPath("$.attemptsLeft").value(2));
        verify(id, "000000").andExpect(jsonPath("$.attemptsLeft").value(1));
        verify(id, "000000").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("OTP_LOCKED"))
                .andExpect(jsonPath("$.retryAfterSeconds").isNumber());

        // The lock is the number's, so asking again does not reset it.
        mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("OTP_LOCKED"));
    }

    @Test
    @DisplayName("a request that has aged out is OTP_EXPIRED")
    void expiredRequest() throws Exception {
        String id = requestCode();
        jdbc.update("UPDATE otp_request SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE id = :id::uuid",
                Map.of("id", id));

        verify(id, sender.codeFor(phone)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("OTP_EXPIRED"));
    }

    @Test
    @DisplayName("a code is single-use: the same request cannot be verified twice")
    void singleUse() throws Exception {
        String id = requestCode();
        String code = sender.codeFor(phone);

        verify(id, code).andExpect(status().isOk());
        verify(id, code).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a number that is only a client's is refused and gets no credential")
    void clientOnlyNumber() throws Exception {
        jdbc.update("INSERT INTO app_user (phone, role) VALUES (:p, 'client')", Map.of("p", phone));
        String id = requestCode();

        verify(id, sender.codeFor(phone)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CLIENT_SIGN_IN_UNAVAILABLE"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    /* --------------------------------------------------------- become a trainer */

    @Test
    @DisplayName("pending → POST /v1/trainers: 201 and a revocable session on the web; the pending token can do nothing else")
    void becomeATrainer() throws Exception {
        String pending = pendingToken();

        // The pending token is good for exactly one route.
        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + pending).header(WEB, "web"))
                .andExpect(status().isForbidden());

        String body = signUp(pending, "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("trainer"))
                .andExpect(jsonPath("$.isNewUser").value(true))
                .andExpect(jsonPath("$.trainerId").isNotEmpty())
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andExpect(jsonPath("$.privacyPolicyVersion").value("2026-09"))
                .andExpect(jsonPath("$.currentPolicyVersion").value("2026-09"))
                .andExpect(jsonPath("$.setupCompletedAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String session = JsonPath.read(body, "$.token");
        assertThat(session).startsWith(SessionTokenIssuer.PREFIX);

        // The new session works, and a trainer row, its workspace and a consent date exist.
        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + session).header(WEB, "web"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM trainer t JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :p AND u.privacy_accepted_at IS NOT NULL AND t.home_tenant_id IS NOT NULL",
                Map.of("p", phone), Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("claiming twice is idempotent: the pending token again, or the trainer's own session, answers 200 and makes nothing new")
    void claimIsIdempotent() throws Exception {
        String pending = pendingToken();
        String first = signUp(pending, "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String trainerId = JsonPath.read(first, "$.trainerId");
        String session = JsonPath.read(first, "$.token");

        // A double tap: the browser has not swapped the cookie yet.
        signUp(pending, "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trainerId").value(trainerId));

        // And from the session it was given: the same credential comes back, not a second one.
        signUp(session, "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trainerId").value(trainerId))
                .andExpect(jsonPath("$.token").value(session))
                .andExpect(jsonPath("$.sessionId").value((String) JsonPath.read(first, "$.sessionId")));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM trainer t JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :p",
                Map.of("p", phone), Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("a missing or outdated privacy version is CONSENT_REQUIRED, and nothing is created")
    void consentRequired() throws Exception {
        String pending = pendingToken();

        for (String body : new String[]{"{}", "{\"privacyPolicyVersion\":\"2020-01\"}", "{\"privacyPolicyVersion\":\"\"}"}) {
            signUp(pending, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE phone = :p", Map.of("p", phone), Integer.class))
                .isZero();
    }

    @Test
    @DisplayName("without a live pending token the claim is SESSION_EXPIRED")
    void claimNeedsAToken() throws Exception {
        mvc.perform(post("/v1/trainers").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"privacyPolicyVersion\":\"2026-09\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
    }

    @Test
    @DisplayName("an existing trainer signs back in to a session, with what they accepted and whether setup is done")
    void existingTrainerSignsIn() throws Exception {
        signUp(pendingToken(), "{\"privacyPolicyVersion\":\"2026-09\"}").andExpect(status().isCreated());
        jdbc.update("UPDATE trainer SET setup_completed_at = now() FROM app_user u WHERE u.id = trainer.app_user_id AND u.phone = :p",
                Map.of("p", phone));
        // Sign-in is gated by the resend ladder only; a second request is a second code.
        String id = requestCode();

        String body = verify(id, sender.codeFor(phone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("trainer"))
                .andExpect(jsonPath("$.isNewUser").value(false))
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andExpect(jsonPath("$.setupCompletedAt").isNumber())
                .andExpect(jsonPath("$.privacyPolicyVersion").value("2026-09"))
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.token")).startsWith(SessionTokenIssuer.PREFIX);
    }

    /* ----------------------------------------------------------- stale sessions */

    @Test
    @DisplayName("a signed-out session answers SESSION_REVOKED, a lapsed one SESSION_EXPIRED, an unknown token a bare 401")
    void staleSessions() throws Exception {
        String first = signUp(pendingToken(), "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andReturn().getResponse().getContentAsString();
        String session = JsonPath.read(first, "$.token");

        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + session).header(WEB, "web"))
                .andExpect(status().isOk());

        // Through the store, so the cache in front of it hears about it as it would from Settings.
        sessions.revoke(SessionTokenIssuer.hash(session), Instant.now(), SessionStore.SIGN_OUT);
        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + session))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));

        // A session row that ran out a day ago, for the same person.
        String lapsed = SessionTokenIssuer.PREFIX + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO web_session (token_hash, app_user_id, role, issued_at, last_seen_at, expires_at)
                SELECT :h, id, 'trainer', now() - interval '3 days', now() - interval '2 days', now() - interval '1 day'
                FROM app_user WHERE phone = :p
                """, Map.of("h", SessionTokenIssuer.hash(lapsed), "p", phone));
        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + lapsed))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));

        mvc.perform(get("/v1/me").header("Authorization", "Bearer xs_unknown"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").doesNotExist());
    }

    @Test
    @DisplayName("signing out ends the session: the next call says SESSION_REVOKED")
    void signOut() throws Exception {
        String first = signUp(pendingToken(), "{\"privacyPolicyVersion\":\"2026-09\"}")
                .andReturn().getResponse().getContentAsString();
        String session = JsonPath.read(first, "$.token");

        mvc.perform(delete("/v1/auth/sessions/current").header("Authorization", "Bearer " + session).header(WEB, "web"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/v1/me").header("Authorization", "Bearer " + session))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));
    }

    /* --------------------------------------------------------------- helpers */

    /** Ask for a code for {@link #phone}; returns the request id. */
    private String requestCode() throws Exception {
        String body = mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.requestId");
    }

    private ResultActions verify(String requestId, String otp) throws Exception {
        return mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + requestId + "\",\"otp\":\"" + otp + "\"}"));
    }

    /** Sign in as a number with no account: the token that may claim one. */
    private String pendingToken() throws Exception {
        String body = verify(requestCode(), sender.codeFor(phone)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private ResultActions signUp(String token, String json) throws Exception {
        return mvc.perform(post("/v1/trainers").header("Authorization", "Bearer " + token).header(WEB, "web")
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    /** The WhatsApp seam, captured: what was sent to each number, last one wins. */
    @TestConfiguration
    static class CapturingSender implements OtpSender {

        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender capturingOtpSender() {
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
