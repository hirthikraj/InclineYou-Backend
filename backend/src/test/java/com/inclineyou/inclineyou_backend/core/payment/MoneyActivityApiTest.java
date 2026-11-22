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
import java.time.LocalDate;
import java.time.ZoneId;
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
 * api-contract Business L3 ({@code GET /v1/money/activity}): the four kinds newest first, pending left out, a cancelled
 * single session's sale left out (20 Nov 2026), the keyset across both sides, and the window.
 */
@SpringBootTest
@Transactional
class MoneyActivityApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, asha, pack, paid, writeOff, refund, liveSingle, old, refundPack, refundPaid;
    private Instant now;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001076', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001076'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        jdbc.update("UPDATE tenant SET timezone = 'Asia/Kolkata' WHERE id = :id::uuid", Map.of("id", tenant.toString()));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        now = Instant.now();
        asha = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Asha', 'independent', 'active')",
                Map.of("id", asha.toString(), "t", me.toString(), "ten", tenant.toString()));

        // A transaction's now() is one instant, so every row is given its own.
        // Only a fully paid package can be refunded, so the refund has a 300 pack of its own, paid in full.
        refundPack = pack(null, "active", 300, ago(120));
        refundPaid = pay(refundPack, "paid", 300, ago(110));
        refund = pay(refundPack, "refund", 300, ago(70));
        pack = pack(null, "active", 9000, ago(100));
        paid = pay(pack, "paid", 1000, ago(90));
        writeOff = pay(pack, "write_off", 200, ago(80));
        pay(pack, "pending", 700, null);                           // not an event
        liveSingle = pack(session(1), "active", 800, ago(60));
        pack(session(2), "cancelled", 800, ago(50));             // a cancelled single: not a sale that happened
        old = pay(pack, "paid", 400, now.minus(40, ChronoUnit.DAYS));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("newest first, four kinds, pending and a cancelled single sale left out, names and amounts")
    void feed() throws Exception {
        mvc.perform(get("/v1/money/activity").param("limit", "20")).andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.items[0].kind").value("sold"))
                .andExpect(jsonPath("$.items[0].packageId").value(liveSingle.toString()))
                .andExpect(jsonPath("$.items[1].kind").value("refund"))
                .andExpect(jsonPath("$.items[1].amount").value("300.00"))
                .andExpect(jsonPath("$.items[2].kind").value("write_off"))
                .andExpect(jsonPath("$.items[3].kind").value("paid"))
                .andExpect(jsonPath("$.items[3].method").value("cash"))
                .andExpect(jsonPath("$.items[3].clientName").value("Asha"))
                .andExpect(jsonPath("$.items[4].kind").value("sold"))
                .andExpect(jsonPath("$.items[4].packageId").value(pack.toString()))
                .andExpect(jsonPath("$.items[4].amount").value("9000.00"))
                .andExpect(jsonPath("$.items[5].kind").value("paid"))
                .andExpect(jsonPath("$.items[5].packageId").value(refundPack.toString()))
                .andExpect(jsonPath("$.items[6].kind").value("sold"))
                .andExpect(jsonPath("$.items[6].packageId").value(refundPack.toString()))
                .andExpect(jsonPath("$.items[7].at").value(at(old)))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    @DisplayName("the keyset walks both sides once, in order, two at a time")
    void paging() throws Exception {
        var seen = new ArrayList<Long>();
        String cursor = null;
        for (int i = 0; i < 10; i++) {
            var req = get("/v1/money/activity").param("limit", "2");
            if (cursor != null) req = req.param("cursor", cursor);
            String json = mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            List<Number> ats = JsonPath.read(json, "$.items[*].at");
            ats.forEach(a -> seen.add(a.longValue()));
            cursor = JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        // The feed has no id on the wire; every event here has its own instant, so the instants name them.
        assertEquals(List.of(at(liveSingle), at(refund), at(writeOff), at(paid), at(pack), at(refundPaid),
                at(refundPack), at(old)), seen);
    }

    @Test
    @DisplayName("from/to bound both sides by date in the workspace's zone; the default limit is 8; a bad limit is 400")
    void windowAndLimits() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        mvc.perform(get("/v1/money/activity").param("from", today.minusDays(7).toString()).param("to", today.plusDays(1).toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(7));
        mvc.perform(get("/v1/money/activity").param("to", today.minusDays(7).toString()))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].at").value(at(old)));
        mvc.perform(get("/v1/money/activity").param("limit", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/activity").param("limit", "101")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/money/activity").param("from", "yesterday")).andExpect(status().isBadRequest());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /** An event's instant in epoch ms, as the wire carries it: a package's created_at, a payment's book_at. */
    private long at(UUID id) {
        return jdbc.queryForObject("""
                SELECT floor(extract(epoch FROM coalesce((SELECT book_at FROM payment WHERE id = :id::uuid),
                                                    (SELECT created_at FROM package WHERE id = :id::uuid))) * 1000)::bigint""",
                Map.of("id", id.toString()), Long.class);
    }

    private Instant ago(int minutes) { return now.minus(minutes, ChronoUnit.MINUTES); }

    /** A single session booked n days ahead. */
    private UUID session(int daysAhead) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, billing, price, status)
                VALUES (:s::uuid, :t::uuid, :c::uuid, now() + make_interval(days => :d), 60, now() + make_interval(days => :d) + interval '1 hour',
                        'single', 800, 'scheduled')""",
                Map.of("s", id.toString(), "t", me.toString(), "c", asha.toString(), "d", daysAhead));
        return id;
    }

    private UUID pack(UUID session, String status, int amount, Instant created) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", asha.toString());
        p.put("s", session == null ? null : session.toString()); p.put("a", new BigDecimal(amount));
        p.put("st", status); p.put("at", Timestamp.from(created));
        p.put("name", session == null ? "Pack" : "Single session"); p.put("n", session == null ? 12 : 1);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, session_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, due_date, status, closed_at, created_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, CAST(:s AS uuid), :name, 'floor', 'sessions', :n, :n, :a, 'INR',
                        current_date, current_date, :st, CASE WHEN :st = 'cancelled' THEN now() END, :at)""", p);
        return id;
    }

    private UUID pay(UUID pkg, String status, int amount, Instant at) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", asha.toString()); p.put("k", pkg.toString());
        p.put("a", new BigDecimal(amount)); p.put("s", status); p.put("at", at == null ? null : Timestamp.from(at));
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status,
                                     paid_at, written_off_at, refunded_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :k::uuid, :a, 'INR', 'trainer',
                        CASE WHEN :s = 'write_off' THEN NULL ELSE 'cash' END, :s,
                        CASE WHEN :s = 'paid' THEN CAST(:at AS timestamptz) END,
                        CASE WHEN :s = 'write_off' THEN CAST(:at AS timestamptz) END,
                        CASE WHEN :s = 'refund' THEN CAST(:at AS timestamptz) END)""", p);
        return id;
    }
}
