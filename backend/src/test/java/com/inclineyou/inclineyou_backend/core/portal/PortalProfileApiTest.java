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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, p-a4 and p-a5: {@code PATCH /v1/portal/me}, {@code POST /v1/portal/ack} and {@code POST /v1/portal/consent}. Pins
 * what a client may change and how (absent leaves, null clears, a NOT NULL column cannot be cleared), that the five fields are the only
 * ones, the If-Match rule, that a removed client can acknowledge and nothing else, and that consent writes the person's pair and the
 * client's version once.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalProfileApiTest.CapturingSender.class)
@Transactional
class PortalProfileApiTest {

    private static final String WEB = "X-InclineYou-Client";
    private static final String POLICY = "2026-09";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002601", "Arun Prakash", null);
    }

    @Test
    @DisplayName("a PATCH changes only what was sent: absent is left, null clears a nullable column, and the answer is the new myDetails")
    void patchChangesWhatWasSent() throws Exception {
        clientUser(phone, POLICY);
        UUID me = liveClient(arun, phone);
        String token = signInToken();

        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Priya N  \",\"goal\":null,\"heightCm\":163,\"activityLevel\":\"moderate\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.name").value("Priya N")).andExpect(jsonPath("$.goal").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.heightCm").value(163.0)).andExpect(jsonPath("$.activityLevel").value("moderate"))
                .andExpect(jsonPath("$.timezone").value("Asia/Kolkata")).andExpect(jsonPath("$.dateOfBirth").value("1994-03-02"))
                .andExpect(jsonPath("$.phone").value(phone)).andExpect(jsonPath("$.version").isString());
        var row = jdbc.queryForMap("SELECT name, goal, height_cm, activity_level, timezone FROM client WHERE id = :c::uuid", Map.of("c", me.toString()));
        assertEquals("Priya N", row.get("name"));
        assertNull(row.get("goal"));
        assertEquals("moderate", row.get("activity_level"));

        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"timezone\":\"Asia/Dubai\",\"activityLevel\":null,\"heightCm\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.timezone").value("Asia/Dubai"))
                .andExpect(jsonPath("$.activityLevel").value(org.hamcrest.Matchers.nullValue())).andExpect(jsonPath("$.heightCm").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.name").value("Priya N"));
        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Priya N"));
    }

    @Test
    @DisplayName("what a client may not change is refused as 400 — the trainer's columns, the read-only two, a NOT NULL one cleared, a value out of range")
    void refusals() throws Exception {
        clientUser(phone, POLICY);
        liveClient(arun, phone);
        String token = signInToken();
        for (String body : new String[]{
                "{\"phone\":\"+919800000099\"}", "{\"dateOfBirth\":\"1990-01-01\"}", "{\"status\":\"archived\"}", "{\"portalShowMoney\":true}",
                "{\"name\":null}", "{\"name\":\"   \"}", "{\"timezone\":null}", "{\"timezone\":\"Mars/Olympus\"}",
                "{\"heightCm\":20}", "{\"heightCm\":300}", "{\"activityLevel\":\"extreme\"}", "{\"goal\":\"" + "x".repeat(1001) + "\"}"}) {
            mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        assertEquals("Priya Nair", jdbc.queryForObject("SELECT name FROM client WHERE phone = :p AND membership_status = 'accepted'", Map.of("p", phone), String.class));
    }

    @Test
    @DisplayName("If-Match is honoured when sent: the current version goes through, another is 412 and nothing changes; none is fine")
    void ifMatch() throws Exception {
        clientUser(phone, POLICY);
        UUID me = liveClient(arun, phone);
        String token = signInToken();
        String version = jdbc.queryForObject("SELECT (extract(epoch FROM updated_at) * 1000)::bigint::text FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), String.class);
        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Stale\"}")).andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("PRECONDITION_FAILED"));
        assertEquals("Priya Nair", jdbc.queryForObject("SELECT name FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), String.class));
        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).header("If-Match", "\"" + version + "\"").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Fresh\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Fresh"));
    }

    @Test
    @DisplayName("a paused client may not PATCH or consent (403 PORTAL_PAUSED); a removed one gets 403 PORTAL_REMOVED — and may still acknowledge")
    void walls() throws Exception {
        clientUser(phone, "2026-08");
        UUID me = liveClient(arun, phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", me.toString()));
        String token = signInToken();
        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"goal\":\"x\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        mvc.perform(post("/v1/portal/consent").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"policyVersion\":\"" + POLICY + "\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));

        jdbc.update("UPDATE client SET status = 'active', paused_at = NULL, membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", me.toString()));
        mvc.perform(patch("/v1/portal/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"goal\":\"x\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_REMOVED"));
        assertEquals("Lose 6 kg by March", jdbc.queryForObject("SELECT goal FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), String.class));
    }

    @Test
    @DisplayName("ack: a removed client's first call stamps the date once and the wall shows it; later calls are 200 and move nothing; an active client's is a no-op")
    void ack() throws Exception {
        clientUser(phone, POLICY);
        UUID me = liveClient(arun, phone);
        String token = signInToken();
        mvc.perform(post("/v1/portal/ack").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        assertNull(jdbc.queryForObject("SELECT removed_ack_at FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), java.sql.Timestamp.class), "nothing to acknowledge yet");

        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", me.toString()));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/me").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.acknowledgedAt").doesNotExist());
        mvc.perform(post("/v1/portal/ack").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        var first = jdbc.queryForObject("SELECT removed_ack_at FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), java.sql.Timestamp.class);
        assertNotNull(first);
        jdbc.update("UPDATE client SET removed_ack_at = removed_ack_at - interval '2 days' WHERE id = :c::uuid", Map.of("c", me.toString()));
        var backdated = jdbc.queryForObject("SELECT removed_ack_at FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), java.sql.Timestamp.class);
        mvc.perform(post("/v1/portal/ack").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        assertEquals(backdated, jdbc.queryForObject("SELECT removed_ack_at FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), java.sql.Timestamp.class), "a replay moves nothing");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/me").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.acknowledgedAt").isNumber());
        mvc.perform(post("/v1/portal/ack").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("consent: a stale or missing version is 400 CONSENT_REQUIRED; the one in force is 204 and writes the person's pair and the client's version, keeping the date on a replay")
    void consent() throws Exception {
        clientUser(phone, "2026-08");
        UUID me = liveClient(arun, phone);
        String token = signInToken();
        for (String body : new String[]{"{\"policyVersion\":\"2026-01\"}", "{}", ""}) {
            var req = post("/v1/portal/consent").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON);
            mvc.perform(body.isEmpty() ? req : req.content(body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONSENT_REQUIRED"));
        }
        assertEquals("2026-08", jdbc.queryForObject("SELECT privacy_policy_version FROM app_user WHERE phone = :p", Map.of("p", phone), String.class));

        mvc.perform(post("/v1/portal/consent").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"policyVersion\":\"" + POLICY + "\"}")).andExpect(status().isNoContent());
        assertEquals(POLICY, jdbc.queryForObject("SELECT privacy_policy_version FROM app_user WHERE phone = :p", Map.of("p", phone), String.class));
        assertEquals(POLICY, jdbc.queryForObject("SELECT accepted_policy_version FROM client WHERE id = :c::uuid", Map.of("c", me.toString()), String.class));

        jdbc.update("UPDATE app_user SET privacy_accepted_at = privacy_accepted_at - interval '3 days' WHERE phone = :p", Map.of("p", phone));
        var date = jdbc.queryForObject("SELECT privacy_accepted_at FROM app_user WHERE phone = :p", Map.of("p", phone), java.sql.Timestamp.class);
        mvc.perform(post("/v1/portal/consent").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"policyVersion\":\"" + POLICY + "\"}")).andExpect(status().isNoContent());
        assertEquals(date, jdbc.queryForObject("SELECT privacy_accepted_at FROM app_user WHERE phone = :p", Map.of("p", phone), java.sql.Timestamp.class), "the date is evidence and does not move on a retry");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/me").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.policy.accepted").value(POLICY));
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */


    private UUID liveClient(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("""
                UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair', goal = 'Lose 6 kg by March',
                       height_cm = 162, activity_level = 'light', date_of_birth = '1994-03-02', timezone = 'Asia/Kolkata' WHERE id = :c::uuid""", Map.of("c", id.toString()));
        return id;
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
        CapturingSender portalProfileCapturingSender() {
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
