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
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Today L7 / Business L2 ({@code GET /v1/payments}): the ledger's order, its keyset paging, every filter,
 * {@code includeTotal}, the gym/trainer split, and the refusals.
 */
@SpringBootTest
@Transactional
class PaymentLedgerApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, asha, gymClient, ashaPack, gymPack;
    private UUID paidOld, paidNew, gymPaid, writeOff, pending;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001074', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001074'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        Instant now = Instant.now();
        asha = client("Asha", "independent");
        gymClient = client("Gita", "gym");
        ashaPack = pack(asha, 9000, null);
        gymPack = pack(gymClient, 10000, 60);
        paidOld = pay(ashaPack, "paid", 1000, now.minus(3, ChronoUnit.DAYS));
        paidNew = pay(ashaPack, "paid", 2000, now.minus(2, ChronoUnit.DAYS));
        gymPaid = pay(gymPack, "paid", 5000, now.minus(1, ChronoUnit.DAYS));
        writeOff = pay(ashaPack, "write_off", 500, now.minus(1, ChronoUnit.HOURS));
        pending = pay(ashaPack, "pending", 700, null);   // a pending row counts on created_at: now
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("bookAt order, names, and the split: the gym's and the trainer's part of a gym-desk payment, null otherwise")
    void orderAndSplit() throws Exception {
        mvc.perform(get("/v1/payments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.items[0].id").value(pending.toString()))
                .andExpect(jsonPath("$.items[1].id").value(writeOff.toString()))
                .andExpect(jsonPath("$.items[2].id").value(gymPaid.toString()))
                .andExpect(jsonPath("$.items[3].id").value(paidNew.toString()))
                .andExpect(jsonPath("$.items[4].id").value(paidOld.toString()))
                .andExpect(jsonPath("$.items[2].clientName").value("Gita"))
                .andExpect(jsonPath("$.items[2].packageName").value("Pack"))
                .andExpect(jsonPath("$.items[2].collectedBy").value("gym"))
                .andExpect(jsonPath("$.items[2].split.gym").value("2000.00"))       // 5000, trainer keeps 60 %
                .andExpect(jsonPath("$.items[2].split.trainer").value("3000.00"))
                .andExpect(jsonPath("$.items[3].split").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.total").doesNotExist());
    }

    @Test
    @DisplayName("keyset paging walks the ledger once, newest first; a cursor resumes only its own filters")
    void paging() throws Exception {
        var seen = new ArrayList<String>();
        String cursor = null;
        for (int i = 0; i < 10; i++) {
            var req = get("/v1/payments").param("limit", "2");
            if (cursor != null) req = req.param("cursor", cursor);
            String json = mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            seen.addAll(JsonPath.read(json, "$.items[*].id"));
            cursor = JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(List.of(pending.toString(), writeOff.toString(), gymPaid.toString(), paidNew.toString(), paidOld.toString()), seen);

        String json = mvc.perform(get("/v1/payments").param("limit", "1")).andReturn().getResponse().getContentAsString();
        String first = JsonPath.read(json, "$.nextCursor");
        mvc.perform(get("/v1/payments").param("limit", "1").param("cursor", first)).andExpect(status().isOk());
        mvc.perform(get("/v1/payments").param("status", "paid").param("cursor", first)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/payments").param("clientId", asha.toString()).param("cursor", first)).andExpect(status().isBadRequest());
        // The same filter written in another order is the same query.
        String paid = JsonPath.read(mvc.perform(get("/v1/payments").param("status", "paid,write_off").param("limit", "1"))
                .andReturn().getResponse().getContentAsString(), "$.nextCursor");
        mvc.perform(get("/v1/payments").param("status", "write_off,paid").param("limit", "1").param("cursor", paid))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("every filter narrows, from/to are on bookAt, and includeTotal counts the whole filter, not the page")
    void filters() throws Exception {
        mvc.perform(get("/v1/payments").param("status", "paid")).andExpect(jsonPath("$.items.length()").value(3));
        mvc.perform(get("/v1/payments").param("status", "paid,write_off")).andExpect(jsonPath("$.items.length()").value(4));
        mvc.perform(get("/v1/payments").param("method", "cash")).andExpect(jsonPath("$.items.length()").value(3));
        mvc.perform(get("/v1/payments").param("collectedBy", "gym"))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].id").value(gymPaid.toString()));
        mvc.perform(get("/v1/payments").param("clientType", "gym")).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/payments").param("clientId", asha.toString())).andExpect(jsonPath("$.items.length()").value(4));
        mvc.perform(get("/v1/payments").param("packageId", gymPack.toString())).andExpect(jsonPath("$.items.length()").value(1));
        // Today's own query: paid, from a date — the payment three days ago is before it.
        String twoDaysAgo = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).minusDays(2).toString();
        jdbc.update("UPDATE tenant SET timezone = 'Asia/Kolkata' WHERE id = :id::uuid", Map.of("id", tenant.toString()));
        mvc.perform(get("/v1/payments").param("status", "paid").param("from", twoDaysAgo).param("limit", "20"))
                .andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/v1/payments").param("limit", "1").param("includeTotal", "true"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.total").value(5));
    }

    @Test
    @DisplayName("unknown filter values, a bad limit or id are 400; a client or package that is not yours is 404")
    void refusals() throws Exception {
        for (var q : List.of(Map.of("status", "settled"), Map.of("method", "cheque"), Map.of("collectedBy", "bank"),
                Map.of("clientType", "vip"), Map.of("limit", "0"), Map.of("limit", "201"), Map.of("clientId", "nope"),
                Map.of("packageId", "nope"), Map.of("from", "yesterday"), Map.of("cursor", "bm9wZQ"))) {
            var req = get("/v1/payments");
            for (var e : q.entrySet()) req = req.param(e.getKey(), e.getValue());
            mvc.perform(req).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/v1/payments").param("clientId", UUID.randomUUID().toString())).andExpect(status().isNotFound());
        mvc.perform(get("/v1/payments").param("packageId", UUID.randomUUID().toString())).andExpect(status().isNotFound());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /** A gym client needs the trainer to work at a gym, and buys only packs with the trainer's share on them. */
    private UUID client(String name, String type) {
        if ("gym".equals(type)) {
            jdbc.update("""
                    INSERT INTO trainer_business (trainer_id, gym_name, training_modes) VALUES (:t::uuid, 'Cult', '["gym_floor"]'::jsonb)
                    ON CONFLICT (trainer_id) DO UPDATE SET gym_name = 'Cult', training_modes = '["gym_floor"]'::jsonb""",
                    Map.of("t", me.toString()));
        }
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :ty, 'active')",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "n", name, "ty", type));
        return id;
    }

    private UUID pack(UUID client, int amount, Integer sharePercent) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString()); p.put("a", new BigDecimal(amount));
        p.put("share", sharePercent == null ? null : new BigDecimal(sharePercent));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date, trainer_share_percent)
                VALUES (:id::uuid, :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', 12, 12,
                        :a, 'INR', current_date - 10, current_date + 60, current_date, :share)""", p);
        return id;
    }

    /** A gym client pays at the gym's desk (no method); a trainer-desk row has a method unless it is a write-off. */
    private UUID pay(UUID pkg, String status, int amount, Instant at) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("k", pkg.toString()); p.put("a", new BigDecimal(amount));
        p.put("s", status); p.put("at", at == null ? null : Timestamp.from(at));
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at, written_off_at)
                SELECT :id::uuid, :t::uuid, k.client_id, k.id, :a, 'INR',
                       CASE c.client_type WHEN 'gym' THEN 'gym' ELSE 'trainer' END,
                       CASE WHEN c.client_type = 'independent' AND :s <> 'write_off' THEN 'cash' END, :s,
                       CASE WHEN :s = 'paid' THEN CAST(:at AS timestamptz) END,
                       CASE WHEN :s = 'write_off' THEN CAST(:at AS timestamptz) END
                FROM package k JOIN client c ON c.id = k.client_id WHERE k.id = :k::uuid""", p);
        return id;
    }
}
