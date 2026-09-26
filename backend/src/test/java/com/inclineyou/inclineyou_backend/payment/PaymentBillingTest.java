package com.inclineyou.inclineyou_backend.payment;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.startsWith;

/**
 * V8 · the three money verbs the redesign added to a payment row: write it off,
 * bill it, and settle it on the day it actually arrived.
 *
 * <p>The properties worth pinning are the ones a refactor would lose:
 * <ul>
 *   <li>a write-off makes the pack's debt DROP (by landing on
 *       {@code package.written_off_amount}), and a second press does not drop it
 *       twice;</li>
 *   <li>an invoice number is minted once per row and consecutively per trainer,
 *       in the {@code INV-<FY>-<NNNN>} shape;</li>
 *   <li>every refusal carries a {@code code} and the sentence the web prints.</li>
 * </ul>
 */
@SpringBootTest
@Transactional
class PaymentBillingTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;
    private UUID client;
    private UUID pack;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), '9100000801', 'B')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of());
        owner = UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = '9100000801'", Map.of(), String.class));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name) VALUES (:id::uuid, :tid::uuid, 'Meera')",
                Map.of("id", client.toString(), "tid", owner.toString()));
        pack = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", pack.toString());
        p.put("tid", owner.toString());
        p.put("cid", client.toString());
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, type, sessions_total,
                    sessions_remaining, amount, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'session_pack', 12, 12, 6000, 'active')
                """, p);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        owner.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── write-off ──────────────────────────────────────────────────────── */

    @Test
    @DisplayName("writing off a pending row drops the pack's debt by its amount, once")
    void writeOffDropsTheDebtOnce() throws Exception {
        String pay = pay("{\"amount\":2000,\"method\":\"cash\",\"collectedBy\":\"trainer\",\"note\":\"March\"}");
        assertEquals(6000, due());

        mvc.perform(patch("/v1/payments/" + pay + "/write-off")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"moved to Pune\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("write_off"))
                .andExpect(jsonPath("$.paidAt").doesNotExist())
                .andExpect(jsonPath("$.amount").value(2000))
                .andExpect(jsonPath("$.note").value("March · moved to Pune"));
        assertEquals(4000, due());

        // A second press answers the same row and forgives nothing more.
        mvc.perform(patch("/v1/payments/" + pay + "/write-off")).andExpect(status().isOk());
        assertEquals(4000, due());
    }

    @Test
    @DisplayName("a collected row cannot be written off — 409 ALREADY_COLLECTED")
    void collectedIsRefused() throws Exception {
        String pay = pay("{\"amount\":2000,\"method\":\"cash\",\"collectedBy\":\"trainer\",\"paidAt\":"
                + System.currentTimeMillis() + "}");
        mvc.perform(patch("/v1/payments/" + pay + "/write-off"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_COLLECTED"));
    }

    @Test
    @DisplayName("somebody else's payment is a 404, not a 403")
    void notMineIs404() throws Exception {
        mvc.perform(patch("/v1/payments/" + UUID.randomUUID() + "/write-off"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PAYMENT_NOT_FOUND"));
    }

    /* ── invoice ────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("a collected row gets INV-<FY>-0001, the next row 0002, and a second press changes nothing")
    void invoiceNumbersAreConsecutiveAndStable() throws Exception {
        String fy = "%04d".formatted(PackageService.financialYear(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"))));
        String first = paid();
        String second = paid();

        mvc.perform(post("/v1/payments/" + first + "/invoice"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoiceNo").value("INV-" + fy + "-0001"))
                .andExpect(jsonPath("$.invoicedAt").isNumber());
        mvc.perform(post("/v1/payments/" + second + "/invoice"))
                .andExpect(jsonPath("$.invoiceNo").value("INV-" + fy + "-0002"));
        mvc.perform(post("/v1/payments/" + first + "/invoice"))
                .andExpect(jsonPath("$.invoiceNo").value("INV-" + fy + "-0001"));

        // …and the package's payment list is what the Payments tab reads.
        mvc.perform(get("/v1/packages/" + pack + "/payments"))
                .andExpect(jsonPath("$[?(@.id == '" + first + "')].invoiceNo").value("INV-" + fy + "-0001"));
    }

    @Test
    @DisplayName("pending, written-off and gym-collected rows are refused, each with its code")
    void invoiceRefusals() throws Exception {
        String pending = pay("{\"amount\":500,\"method\":\"cash\",\"collectedBy\":\"trainer\"}");
        mvc.perform(post("/v1/payments/" + pending + "/invoice"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_PAID"));

        mvc.perform(patch("/v1/payments/" + pending + "/write-off"));
        mvc.perform(post("/v1/payments/" + pending + "/invoice"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WRITTEN_OFF"))
                .andExpect(jsonPath("$.detail").value(startsWith("This one was written off")));

        String gym = pay("{\"amount\":500,\"method\":\"gym_front_office\",\"collectedBy\":\"gym\",\"paidAt\":"
                + System.currentTimeMillis() + "}");
        mvc.perform(post("/v1/payments/" + gym + "/invoice"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GYM_COLLECTED"));
    }

    @Test
    @DisplayName("a year's series is the calendar's: 31 Mar is last year's, 1 Apr is this one's")
    void financialYearTurnsInApril() {
        assertEquals(2526, PackageService.financialYear(java.time.LocalDate.of(2026, 3, 31)));
        assertEquals(2627, PackageService.financialYear(java.time.LocalDate.of(2026, 4, 1)));
        assertEquals(2627, PackageService.financialYear(java.time.LocalDate.of(2026, 9, 23)));
        assertEquals("INV-0910-0042", PackageService.invoiceNumber(910, 42));
    }

    /* ── confirm ────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("confirming honours the day it arrived and learns the method")
    void confirmHonoursPaidAtAndMethod() throws Exception {
        String pay = pay("{\"amount\":2000,\"method\":\"upi_intent\",\"collectedBy\":\"trainer\"}");
        long tuesday = System.currentTimeMillis() - 2 * 86_400_000L;
        mvc.perform(patch("/v1/payments/" + pay + "/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"method\":\"cash\",\"paidAt\":" + tuesday + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("paid"))
                .andExpect(jsonPath("$.method").value("cash"))
                .andExpect(jsonPath("$.paidAt").value(tuesday));
        assertEquals(4000, due());
    }

    @Test
    @DisplayName("a settle date in the future is refused; a written-off row cannot be confirmed")
    void confirmRefusals() throws Exception {
        String pay = pay("{\"amount\":2000,\"method\":\"cash\",\"collectedBy\":\"trainer\"}");
        long nextWeek = System.currentTimeMillis() + 7 * 86_400_000L;
        mvc.perform(patch("/v1/payments/" + pay + "/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paidAt\":" + nextWeek + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));

        mvc.perform(patch("/v1/payments/" + pay + "/write-off"));
        mvc.perform(patch("/v1/payments/" + pay + "/confirm")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WRITTEN_OFF"));
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    private String paid() throws Exception {
        return pay("{\"amount\":1000,\"method\":\"cash\",\"collectedBy\":\"trainer\",\"paidAt\":"
                + System.currentTimeMillis() + "}");
    }

    private String pay(String body) throws Exception {
        String json = mvc.perform(post("/v1/packages/" + pack + "/payments")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private int due() throws Exception {
        String json = mvc.perform(get("/v1/clients/" + client + "/packages"))
                .andReturn().getResponse().getContentAsString();
        Number n = com.jayway.jsonpath.JsonPath.read(json, "$[0].amountDue");
        return n.intValue();
    }
}
