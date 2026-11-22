package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
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
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Business L7 ({@code GET /v1/payments/export}): the CSV's rows across pages, the formula guard and the
 * refusals. The one-snapshot rule (20 Nov 2026) cannot be shown from inside a test transaction — the export joins it —
 * so it is pinned on the method instead.
 */
@SpringBootTest
@Transactional
class PaymentExportApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, asha;
    private String from, to;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001075', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001075'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        jdbc.update("UPDATE tenant SET timezone = 'Asia/Kolkata' WHERE id = :id::uuid", Map.of("id", tenant.toString()));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Asha', 'independent', 'active')",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString()));
        asha = id;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        from = today.minusMonths(2).toString();
        to = today.plusDays(1).toString();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("250 payments cross two pages: one header, every row once, newest first, the file named by its window")
    void rowsAcrossPages() throws Exception {
        UUID pack = pack();
        Instant now = Instant.now();
        for (int i = 0; i < 250; i++) pay(pack, now.minus(i + 1, ChronoUnit.MINUTES), "n" + i);

        String csv = mvc.perform(get("/v1/payments/export").param("from", from).param("to", to))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/csv; charset=utf-8"))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"payments-" + from + "-to-" + to + ".csv\""))
                .andReturn().getResponse().getContentAsString();
        var lines = csv.split("\r\n");
        assertEquals("bookAt,date,client,package,status,collectedBy,method,reference,amount,gym,trainer,currency,note", lines[0]);
        assertEquals(251, lines.length);
        var notes = Arrays.stream(lines).skip(1).map(l -> l.substring(l.lastIndexOf(',') + 1)).toList();
        assertEquals(250, new HashSet<>(notes).size());
        assertEquals("n0", notes.get(0));
        assertEquals("n249", notes.get(249));
    }

    @Test
    @DisplayName("a typed cell that starts like a formula — = + - @, a tab or a CR — is written with an apostrophe first")
    void formulaGuard() throws Exception {
        UUID pack = pack();
        Instant now = Instant.now();
        pay(pack, now.minus(1, ChronoUnit.MINUTES), "=HYPERLINK(\"x\")");
        pay(pack, now.minus(2, ChronoUnit.MINUTES), "\t=1+1");
        pay(pack, now.minus(3, ChronoUnit.MINUTES), "\r=1+1");
        pay(pack, now.minus(4, ChronoUnit.MINUTES), "@SUM(A1)");
        pay(pack, now.minus(5, ChronoUnit.MINUTES), "paid in full");

        String csv = mvc.perform(get("/v1/payments/export").param("from", from).param("to", to))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(csv.contains(",\"'=HYPERLINK(\"\"x\"\")\"\r\n"), csv);
        assertTrue(csv.contains(",'\t=1+1\r\n"), csv);
        assertTrue(csv.contains(",\"'\r=1+1\"\r\n"), csv);
        assertTrue(csv.contains(",'@SUM(A1)\r\n"), csv);
        assertTrue(csv.contains(",paid in full\r\n"), csv);

        assertEquals("'\tx", PaymentExportService.cell("\tx"));
        assertEquals("\"'\rx\"", PaymentExportService.cell("\rx"));
        assertEquals("'-5", PaymentExportService.cell("-5"));
        assertEquals("", PaymentExportService.cell(null));
    }

    @Test
    @DisplayName("every page is one snapshot: a read-only REPEATABLE READ transaction around the whole walk")
    void oneSnapshot() throws Exception {
        var m = PaymentExportService.class.getMethod("export", UUID.class, String.class, String.class, String.class,
                String.class, String.class, String.class, String.class, PaymentExportService.Sink.class);
        var tx = m.getAnnotation(Transactional.class);
        assertTrue(tx != null && tx.readOnly());
        assertEquals(Isolation.REPEATABLE_READ, tx.isolation());
    }

    @Test
    @DisplayName("from and to required, to after from, at most 3 years; a bad filter is 400 and another client 404, before any byte")
    void refusals() throws Exception {
        mvc.perform(get("/v1/payments/export").param("from", from)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/payments/export").param("from", to).param("to", from)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/payments/export").param("from", "2020-01-01").param("to", "2024-01-02"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RANGE_TOO_LARGE"));
        mvc.perform(get("/v1/payments/export").param("from", from).param("to", to).param("status", "settled"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/payments/export").param("from", from).param("to", to).param("clientId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/payments/export").param("from", from).param("to", to).param("clientId", asha.toString()))
                .andExpect(status().isOk());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private UUID pack() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (:id::uuid, :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', 12, 12,
                        1000000, 'INR', current_date - 10, current_date + 60, current_date)""",
                Map.of("id", id.toString(), "t", me.toString(), "c", asha.toString()));
        return id;
    }

    private void pay(UUID pkg, Instant at, String note) {
        var p = new HashMap<String, Object>();
        p.put("id", UUID.randomUUID().toString()); p.put("t", me.toString()); p.put("c", asha.toString());
        p.put("k", pkg.toString()); p.put("a", new BigDecimal(100)); p.put("at", Timestamp.from(at)); p.put("n", note);
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at, note)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :k::uuid, :a, 'INR', 'trainer', 'cash', 'paid', :at, :n)""", p);
    }
}
