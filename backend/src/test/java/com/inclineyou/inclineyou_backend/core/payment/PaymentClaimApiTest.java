package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.auth.otp.OtpSender;
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

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V50 · "I've paid": the client reports through the portal (pm-a1, pm-a2), the trainer confirms or declines (pc-l1…pc-l4), the
 * client gets a receipt (pm-l3). Through the security chain, both sessions. The suite runs as the schema owner, so what is
 * pinned here is the doors' own guards and the routes' answers; the row-level walls are TenantIsolationTest's.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PaymentClaimApiTest.CapturingSender.class)
@Transactional
class PaymentClaimApiTest {

    private static final String WEB = "X-InclineYou-Client";
    private static final String TRAINER_PHONE = "+919100005001";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private UUID trainer;
    private UUID tenant;
    private String clientPhone;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", TRAINER_PHONE));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", TRAINER_PHONE), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Ravi Kumar') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        trainer = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainer.toString()), String.class));
        jdbc.update("UPDATE trainer SET clients_see_money = true WHERE id = :t::uuid", Map.of("t", trainer.toString()));
        jdbc.update("UPDATE tenant_business SET upi_vpa = 'ravi@okaxis' WHERE tenant_id = :ten::uuid", Map.of("ten", tenant.toString()));
        clientPhone = "+9197" + String.format("%08d", (int) (Math.random() * 100_000_000));
    }

    /* ── the flows ────────────────────────────────────────────────────── */

    @Test
    @DisplayName("part payment: the client reports ₹1,000 with a UTR; the trainer sees it, confirms it; the pack owes ₹2,000; the client has a receipt")
    void reportConfirmReceipt() throws Exception {
        UUID c = client("independent");
        UUID k = pack(c, 3000, false);
        String ct = tokenFor(clientPhone);
        String tt = tokenFor(TRAINER_PHONE);

        get(ct, "/v1/portal/money").andExpect(status().isOk())
                .andExpect(jsonPath("$.payTo").value("ravi@okaxis"))
                .andExpect(jsonPath("$.owed", hasSize(1)))
                .andExpect(jsonPath("$.owed[0].packageId").value(k.toString()))
                .andExpect(jsonPath("$.terms.partPayments").value(true))
                .andExpect(jsonPath("$.terms.collector").value("trainer"));

        UUID id = UUID.randomUUID();
        String report = claimJson(id, k, "1000", LocalDate.now(), "412345678901");
        post(ct, "/v1/portal/payment-claims", report).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.reference").value("412345678901"));
        // a retried tap is the same report
        post(ct, "/v1/portal/payment-claims", report).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        get(ct, "/v1/portal/money").andExpect(jsonPath("$.claims", hasSize(1))).andExpect(jsonPath("$.amountDue").value("3000.00"));

        get(tt, "/v1/payment-claims").andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].clientName").value("Meera Iyer"))
                .andExpect(jsonPath("$.items[0].amount").value("1000.00"));

        String confirmed = body(post(tt, "/v1/payment-claims/" + id + "/confirm", "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.claim.status").value("confirmed"))
                .andExpect(jsonPath("$.payment.method").value("upi"))
                .andExpect(jsonPath("$.payment.reference").value("412345678901"))
                .andExpect(jsonPath("$.package.amountDue").value("2000.00")));
        String paymentId = JsonPath.read(confirmed, "$.payment.id");
        // confirming again answers what the first did
        post(tt, "/v1/payment-claims/" + id + "/confirm", "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.payment.id").value(paymentId));
        get(tt, "/v1/payment-claims").andExpect(jsonPath("$.items", hasSize(0)));

        get(ct, "/v1/portal/payments/" + paymentId + "/receipt").andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value("1000.00"))
                .andExpect(jsonPath("$.reference").value("412345678901"))
                .andExpect(jsonPath("$.business.name").exists())
                .andExpect(jsonPath("$.trainerName").value("Ravi Kumar"));
        get(ct, "/v1/portal/payments/" + UUID.randomUUID() + "/receipt").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("what is left counts other waiting reports; with part payments off, only the whole of it")
    void roomAndWholeOnly() throws Exception {
        UUID c = client("independent");
        UUID k = pack(c, 3000, false);
        String ct = tokenFor(clientPhone);

        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k, "2000", LocalDate.now(), null)).andExpect(status().isCreated());
        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k, "1500", LocalDate.now(), null))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CLAIM_OVER_DUE"));
        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k, "500", LocalDate.now().plusDays(2), null))
                .andExpect(status().isBadRequest());

        UUID k2 = pack(c, 4000, false);
        String tt = tokenFor(TRAINER_PHONE);
        mvc.perform(put("/v1/business/payments").header("Authorization", "Bearer " + tt).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upiVpa\":\"ravi@okaxis\",\"partPayments\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.partPayments").value(false));
        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k2, "1000", LocalDate.now(), null))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CLAIM_WHOLE_ONLY"));
        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k2, "4000", LocalDate.now(), null)).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("paid before a pack: confirm asks for the pack, then records against the one the trainer names")
    void beforeAPack() throws Exception {
        UUID c = client("independent");
        String ct = tokenFor(clientPhone);
        String tt = tokenFor(TRAINER_PHONE);
        UUID id = UUID.randomUUID();
        post(ct, "/v1/portal/payment-claims", claimJson(id, null, "5000", LocalDate.now().minusDays(1), null)).andExpect(status().isCreated());

        post(tt, "/v1/payment-claims/" + id + "/confirm", "{}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CLAIM_NEEDS_PACKAGE"));
        UUID k = pack(c, 5000, false);
        post(tt, "/v1/payment-claims/" + id + "/confirm", "{\"packageId\":\"" + k + "\",\"method\":\"cash\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.claim.packageId").value(k.toString()))
                .andExpect(jsonPath("$.payment.method").value("cash"))
                .andExpect(jsonPath("$.package.amountDue").value("0.00"));
    }

    @Test
    @DisplayName("not received: the client sees the reason; Undo puts it back; the client can take back an open one, not a decided one")
    void declineReopenWithdraw() throws Exception {
        UUID c = client("independent");
        UUID k = pack(c, 3000, false);
        String ct = tokenFor(clientPhone);
        String tt = tokenFor(TRAINER_PHONE);
        UUID id = UUID.randomUUID();
        post(ct, "/v1/portal/payment-claims", claimJson(id, k, "3000", LocalDate.now(), null)).andExpect(status().isCreated());

        post(tt, "/v1/payment-claims/" + id + "/decline", "{\"reason\":\"Not in my account yet\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("declined"));
        get(ct, "/v1/portal/money").andExpect(jsonPath("$.claims[0].declineReason").value("Not in my account yet"));
        mvc.perform(delete("/v1/portal/payment-claims/" + id).header("Authorization", "Bearer " + ct))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLAIM_DECIDED"));

        post(tt, "/v1/payment-claims/" + id + "/reopen", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("open"));
        mvc.perform(delete("/v1/portal/payment-claims/" + id).header("Authorization", "Bearer " + ct)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/portal/payment-claims/" + id).header("Authorization", "Bearer " + ct)).andExpect(status().isNoContent());
        post(tt, "/v1/payment-claims/" + id + "/confirm", "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLAIM_DECIDED"));
    }

    @Test
    @DisplayName("Undo of a confirm is deleting its payment: the report goes back to waiting")
    void undoConfirm() throws Exception {
        UUID c = client("independent");
        UUID k = pack(c, 3000, false);
        String ct = tokenFor(clientPhone);
        String tt = tokenFor(TRAINER_PHONE);
        UUID id = UUID.randomUUID();
        post(ct, "/v1/portal/payment-claims", claimJson(id, k, "1000", LocalDate.now(), null)).andExpect(status().isCreated());
        String paymentId = JsonPath.read(body(post(tt, "/v1/payment-claims/" + id + "/confirm", "{}")), "$.payment.id");

        mvc.perform(delete("/v1/payments/" + paymentId).header("Authorization", "Bearer " + tt)).andExpect(status().isNoContent());
        get(tt, "/v1/payment-claims").andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].paymentId").doesNotExist());
    }

    @Test
    @DisplayName("a gym client pays the gym: no UPI ID offered, and the confirm records a gym-collected payment")
    void gymClient() throws Exception {
        jdbc.update("UPDATE trainer_business SET gym_name = 'Gold''s Gym', training_modes = '[\"gym_floor\"]' WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        UUID c = client("gym");
        UUID k = pack(c, 6000, true);
        String ct = tokenFor(clientPhone);
        String tt = tokenFor(TRAINER_PHONE);

        get(ct, "/v1/portal/money").andExpect(status().isOk())
                .andExpect(jsonPath("$.payTo").doesNotExist())
                .andExpect(jsonPath("$.terms.collector").value("gym"))
                .andExpect(jsonPath("$.terms.gymName").value("Gold's Gym"));

        UUID id = UUID.randomUUID();
        post(ct, "/v1/portal/payment-claims", claimJson(id, k, "6000", LocalDate.now(), "DESK-RECEIPT-77")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.collector").value("gym"));
        post(tt, "/v1/payment-claims/" + id + "/confirm", "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.payment.collectedBy").value("gym"))
                .andExpect(jsonPath("$.payment.method").doesNotExist());
    }

    @Test
    @DisplayName("with money hidden from this client, there is nothing to report against")
    void moneyHidden() throws Exception {
        UUID c = client("independent");
        UUID k = pack(c, 3000, false);
        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", trainer.toString()));
        String ct = tokenFor(clientPhone);
        post(ct, "/v1/portal/payment-claims", claimJson(UUID.randomUUID(), k, "1000", LocalDate.now(), null)).andExpect(status().isNotFound());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM payment_claim WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class));
    }

    @Test
    @DisplayName("the Settings save that no longer sends a UPI ID leaves it alone")
    void settingsSaveKeepsUpi() throws Exception {
        String tt = tokenFor(TRAINER_PHONE);
        mvc.perform(put("/v1/business").header("Authorization", "Bearer " + tt).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ravi Kumar Fitness\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.upiVpa").value("ravi@okaxis"));
        mvc.perform(put("/v1/business").header("Authorization", "Bearer " + tt).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ravi Kumar Fitness\",\"upiVpa\":null}"))
                .andExpect(status().isOk());
        assertNull(jdbc.queryForObject("SELECT upi_vpa FROM tenant_business WHERE tenant_id = :ten::uuid", Map.of("ten", tenant.toString()), String.class));
    }

    /* ── helpers ──────────────────────────────────────────────────────── */

    private static String claimJson(UUID id, UUID pack, String amount, LocalDate on, String ref) {
        return "{\"id\":\"" + id + "\"," + (pack == null ? "" : "\"packageId\":\"" + pack + "\",") + "\"amount\":\"" + amount
                + "\",\"paidOn\":\"" + on + "\"" + (ref == null ? "" : ",\"reference\":\"" + ref + "\"") + "}";
    }

    /**
     * The suite's connection is the schema owner's and is borrowed before any request, so the request's session settings never
     * reach it; the read doors that check {@code app_actor() = 'client'} are given the client's settings here, transaction-local.
     */
    private void asClient(UUID c) {
        jdbc.queryForObject("SELECT set_config('app.actor', 'client', true)", Map.of(), String.class);
        jdbc.queryForObject("SELECT set_config('app.client_ids', :ids, true)", Map.of("ids", "{" + c + "}"), String.class);
    }

    private UUID client(String type) {
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')",
                Map.of("p", clientPhone));
        UUID id = UUID.randomUUID();
        var m = new HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainer.toString()); m.put("ten", tenant.toString()); m.put("p", clientPhone); m.put("ty", type);
        jdbc.update("""
                INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type, membership_status, invited_at, accepted_at)
                VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Meera Iyer', :p, :ty, 'accepted', now(), now())""", m);
        asClient(id);
        return id;
    }

    private UUID pack(UUID client, int amount, boolean gym) {
        UUID id = UUID.randomUUID();
        var m = new HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainer.toString()); m.put("c", client.toString()); m.put("a", amount);
        m.put("share", gym ? 60 : null);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, trainer_share_percent)
                VALUES (:id::uuid, :t::uuid, :c::uuid, '12 sessions', 'floor', 'sessions', 12, 12, :a, 'INR', CURRENT_DATE, CAST(:share AS numeric))""", m);
        return id;
    }

    private ResultActions get(String token, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private ResultActions post(String token, String url, String json) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private String tokenFor(String p) throws Exception {
        String id = JsonPath.read(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/v1/auth/otp/request")
                .contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"" + p + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/v1/auth/otp/verify")
                .header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(p) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender paymentClaimCapturingSender() {
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
