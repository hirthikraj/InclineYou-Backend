package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Business, correcting what the gym has paid: {@code PATCH} and {@code DELETE /v1/trainer-payouts/{id}} over HTTP. The service was
 * covered ({@code GymMoneyTest}); the routes — the ETag, the If-Match, the strict body, the wrong-owner 404 — were not. Pins that a correction and a
 * removal move the settlement's balance at once (nothing stores it), that a payout typed wrong can be removed twice with no harm, and that one
 * trainer can neither change nor remove another's.
 */
@SpringBootTest
@Transactional
class TrainerPayoutApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other;
    private final YearMonth now = YearMonth.now(java.time.ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100001801", "Cult");
        other = trainer("+919100001802", "Gold's");
        as(me);
        // Terms with the gym: a minimum of 15,000 a month, so what has been paid is what moves the balance.
        jdbc.update("""
                INSERT INTO gym_arrangement (id, trainer_id, gym_name, base_kind, base_amount, starts_month, currency)
                VALUES (gen_random_uuid(), :t::uuid, 'Cult', 'minimum', 15000, :m::date, 'INR')""", Map.of("t", me.toString(), "m", now.atDay(1).toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    private UUID trainer(String phone, String gym) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING", Map.of("p", phone));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p", Map.of("p", phone), String.class));
        jdbc.update("UPDATE trainer_business SET gym_name = :g, training_modes = '[\"gym_floor\"]' WHERE trainer_id = :t::uuid", Map.of("g", gym, "t", id.toString()));
        return id;
    }

    private void as(UUID trainer) {
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(trainer.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    private UUID record(String json) throws Exception {
        String out = mvc.perform(post("/v1/trainer-payouts").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(out, "$.id"));
    }

    private ResultActions patchIt(UUID id, String ifMatch, String json) throws Exception {
        var r = patch("/v1/trainer-payouts/" + id).contentType(MediaType.APPLICATION_JSON).content(json);
        if (ifMatch != null) r = r.header("If-Match", "\"" + ifMatch + "\"");
        return mvc.perform(r);
    }

    /** What the settlement shows as paid — read from the money screen, because the balance is a sum over the payouts and nothing stores it. */
    private ResultActions settlement() throws Exception {
        return mvc.perform(get("/v1/money/gym?from=" + now + "&to=" + now)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("PATCH: any subset, the new version as ETag, a stale If-Match is 412 and changes nothing, an unknown key or a bad value is 400, and the balance moves at once")
    void patchCorrectsAPayout() throws Exception {
        UUID id = record("{\"amount\":\"4000.00\",\"method\":\"bank_transfer\",\"reference\":\"NEFT1\"}");
        settlement().andExpect(jsonPath("$.settlement.recentPayouts[0].amount").value("4000.00"));

        String v1 = JsonPath.read(mvc.perform(get("/v1/trainer-payouts")).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(1))).andReturn().getResponse().getContentAsString(), "$.items[0].version");
        patchIt(id, v1, "{\"amount\":\"5500.00\"}").andExpect(status().isOk()).andExpect(header().exists("ETag")).andExpect(jsonPath("$.amount").value("5500.00"))
                .andExpect(jsonPath("$.method").value("bank_transfer")).andExpect(jsonPath("$.reference").value("NEFT1")).andExpect(jsonPath("$.gymName").value("Cult"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM trainer_payout WHERE trainer_id = :t::uuid AND amount = 5500", Map.of("t", me.toString()), Integer.class));
        settlement().andExpect(jsonPath("$.settlement.recentPayouts[0].amount").value("5500.00"));   // the screen reads the corrected amount at once

        // another field alone, a clear, and an empty body that answers as it stands
        patchIt(id, null, "{\"note\":\"part of March\",\"reference\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.note").value("part of March")).andExpect(jsonPath("$.reference").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.amount").value("5500.00"));
        patchIt(id, null, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.amount").value("5500.00"));
        // a stale version: refused, and nothing changed
        patchIt(id, "1", "{\"amount\":\"1.00\"}").andExpect(status().isPreconditionFailed());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM trainer_payout WHERE id = :i::uuid AND amount = 5500", Map.of("i", id.toString()), Integer.class));
        // what is not a payout field, and what is not a value
        patchIt(id, null, "{\"gymName\":\"Somewhere else\"}").andExpect(status().isBadRequest());
        patchIt(id, null, "{\"amount\":\"0\"}").andExpect(status().isBadRequest());
        patchIt(id, null, "{\"amount\":\"-5\"}").andExpect(status().isBadRequest());
        patchIt(id, null, "{\"method\":\"cheque\"}").andExpect(status().isBadRequest());
        patchIt(id, null, "{\"receivedAt\":" + (System.currentTimeMillis() + 3_600_000L) + "}").andExpect(status().isBadRequest());
        patchIt(UUID.randomUUID(), null, "{\"amount\":\"10\"}").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE: 204, a repeat is 204 too, it leaves the list and the settlement, and a removed one cannot be corrected (404)")
    void deleteRemovesAPayout() throws Exception {
        UUID id = record("{\"amount\":\"9000.00\",\"method\":\"upi\"}");
        mvc.perform(get("/v1/trainer-payouts")).andExpect(jsonPath("$.items", hasSize(1)));
        settlement().andExpect(jsonPath("$.settlement.recentPayouts", hasSize(1)));
        mvc.perform(delete("/v1/trainer-payouts/" + id)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/trainer-payouts/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/trainer-payouts")).andExpect(jsonPath("$.items", hasSize(0)));
        settlement().andExpect(jsonPath("$.settlement.recentPayouts", hasSize(0)));
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM trainer_payout WHERE id = :i::uuid", Map.of("i", id.toString()), java.sql.Timestamp.class), "removed softly, never destroyed");
        patchIt(id, null, "{\"amount\":\"1.00\"}").andExpect(status().isNotFound());
        mvc.perform(delete("/v1/trainer-payouts/" + UUID.randomUUID())).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("one trainer can neither correct nor remove another's payout: it is a 404 to change, and a removal leaves it exactly where it was")
    void notSomebodyElses() throws Exception {
        UUID mine = record("{\"amount\":\"7000.00\",\"method\":\"upi\"}");
        as(other);
        jdbc.update("""
                INSERT INTO gym_arrangement (id, trainer_id, gym_name, base_kind, base_amount, starts_month, currency)
                VALUES (gen_random_uuid(), :t::uuid, 'Gold''s', 'minimum', 10000, :m::date, 'INR')""", Map.of("t", other.toString(), "m", now.atDay(1).toString()));
        patchIt(mine, null, "{\"amount\":\"1.00\"}").andExpect(status().isNotFound());
        mvc.perform(delete("/v1/trainer-payouts/" + mine)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/trainer-payouts")).andExpect(jsonPath("$.items", hasSize(0)));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM trainer_payout WHERE id = :i::uuid AND deleted_at IS NULL AND amount = 7000", Map.of("i", mine.toString()), Integer.class));
        as(me);
        mvc.perform(get("/v1/trainer-payouts")).andExpect(jsonPath("$.items", hasSize(1)));
    }
}
