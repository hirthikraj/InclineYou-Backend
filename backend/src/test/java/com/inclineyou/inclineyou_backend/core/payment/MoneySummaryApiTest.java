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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Today L6 / Business L1 ({@code GET /v1/money/summary}): the month figures (billed, the gym's cut,
 * yours, collected, written off, take-home), the trend against the span before, the {@code now} block, and the refusals.
 */
@SpringBootTest
@Transactional
class MoneySummaryApiTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001073', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001073'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        jdbc.update("UPDATE tenant SET timezone = 'Asia/Kolkata' WHERE id = :id::uuid", Map.of("id", tenant.toString()));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        today = LocalDate.now(IST);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("months=2: billed by start_date, the gym's cut and yours, collected and written off by their own dates, take-home, the trend and now")
    void figures() throws Exception {
        YearMonth thisMonth = YearMonth.from(today), lastMonth = thisMonth.minusMonths(1);
        LocalDate thisFirst = thisMonth.atDay(1);

        // This month: a gym pack, trainer keeps 60 %. Sold 10000, so the gym's cut is 4000. Owed past its date.
        UUID gymPack = pack(client("Asha", "gym"), 10000, thisFirst, today.minusDays(30), 60);
        pay(gymPack, "paid", 2000, Instant.now());
        // Last month: an independent pack of 5000, 1000 written off this month, due today (owed, not overdue).
        UUID ownPack = pack(client("Bala", "independent"), 5000, lastMonth.atDay(1), today, null);
        pay(ownPack, "write_off", 1000, Instant.now());
        // The span before (two and three months ago): one pack of 3000, paid in full back then.
        UUID oldPack = pack(client("Chitra", "independent"), 3000, thisMonth.minusMonths(2).atDay(1), thisMonth.minusMonths(2).atDay(1), null);
        pay(oldPack, "paid", 3000, thisMonth.minusMonths(2).atDay(2).atStartOfDay(IST).toInstant());

        mvc.perform(get("/v1/money/summary").param("months", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.months.length()").value(2))
                .andExpect(jsonPath("$.months[0].month").value(lastMonth.toString()))      // oldest first
                .andExpect(jsonPath("$.months[0].billed").value("5000.00"))
                .andExpect(jsonPath("$.months[0].collected").value("0.00"))
                .andExpect(jsonPath("$.months[1].month").value(thisMonth.toString()))
                .andExpect(jsonPath("$.months[1].billed").value("10000.00"))
                .andExpect(jsonPath("$.months[1].gymCut").value("4000.00"))
                .andExpect(jsonPath("$.months[1].yours").value("6000.00"))
                .andExpect(jsonPath("$.months[1].collected").value("2000.00"))
                .andExpect(jsonPath("$.months[1].takeHome").value("1200.00"))              // the gym collected it: the trainer's 60 %
                .andExpect(jsonPath("$.months[1].writtenOff").value("1000.00"))
                .andExpect(jsonPath("$.months[1].packagesSold").value(1))
                .andExpect(jsonPath("$.months[1].paymentsCount").value(1))
                // The span before's payment is not in the span's figures.
                .andExpect(jsonPath("$.total.collected").value("2000.00"))
                .andExpect(jsonPath("$.total.billed").value("15000.00"))
                // 15000 against 3000 billed in the two months before.
                .andExpect(jsonPath("$.total.trendPercent").value(400.0))
                // 8000 owed on the gym pack (overdue), 4000 on the other (due today), 0 on the old one.
                .andExpect(jsonPath("$.now.pending").value("12000.00"))
                .andExpect(jsonPath("$.now.overdue").value("8000.00"))
                .andExpect(jsonPath("$.now.clientsOwing").value(2))
                .andExpect(jsonPath("$.now.clientsOverdue").value(1));

        // Nothing billed in the span before: no trend rather than a division by zero.
        mvc.perform(get("/v1/money/summary").param("from", lastMonth.minusMonths(1).toString()).param("to", lastMonth.minusMonths(1).toString()))
                .andExpect(jsonPath("$.total.trendPercent").doesNotExist());
        // Left out, months is 1: this month alone.
        mvc.perform(get("/v1/money/summary"))
                .andExpect(jsonPath("$.months.length()").value(1))
                .andExpect(jsonPath("$.months[0].month").value(thisMonth.toString()));
    }

    @Test
    @DisplayName("months is 1–24, from/to are yyyy-MM in order, and months cannot be sent with them")
    void refusals() throws Exception {
        mvc.perform(get("/v1/money/summary").param("months", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/summary").param("months", "25")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RANGE_TOO_LARGE"));
        mvc.perform(get("/v1/money/summary").param("from", "2024-12").param("to", "2026-12")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RANGE_TOO_LARGE"));
        mvc.perform(get("/v1/money/summary").param("months", "2").param("from", "2026-01").param("to", "2026-02"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/summary").param("from", "2026-01")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/summary").param("from", "January").param("to", "2026-02")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/summary").param("from", "2026-03").param("to", "2026-02")).andExpect(status().isBadRequest());
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

    private UUID pack(UUID client, int amount, LocalDate start, LocalDate due, Integer sharePercent) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString());
        p.put("a", new BigDecimal(amount)); p.put("start", Date.valueOf(start)); p.put("due", Date.valueOf(due));
        p.put("end", Date.valueOf(start.plusDays(90))); p.put("share", sharePercent == null ? null : new BigDecimal(sharePercent));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date, trainer_share_percent)
                VALUES (:id::uuid, :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', 12, 12,
                        :a, 'INR', :start, :end, :due, :share)""", p);
        return id;
    }

    private void pay(UUID pkg, String status, int amount, Instant at) {
        var p = new HashMap<String, Object>();
        p.put("t", me.toString()); p.put("k", pkg.toString()); p.put("a", new BigDecimal(amount)); p.put("s", status);
        p.put("at", Timestamp.from(at));
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at, written_off_at)
                SELECT gen_random_uuid(), :t::uuid, k.client_id, k.id, :a, 'INR',
                       CASE c.client_type WHEN 'gym' THEN 'gym' ELSE 'trainer' END,   -- a gym client pays at the gym's desk
                       CASE WHEN :s = 'paid' AND c.client_type = 'independent' THEN 'cash' END, :s,
                       CASE WHEN :s = 'paid' THEN CAST(:at AS timestamptz) END, CASE WHEN :s = 'write_off' THEN CAST(:at AS timestamptz) END
                FROM package k JOIN client c ON c.id = k.client_id WHERE k.id = :k::uuid""", p);
    }
}
