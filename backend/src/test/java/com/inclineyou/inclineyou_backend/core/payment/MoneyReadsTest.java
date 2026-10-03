package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** api-contract Business — the money activity feed, the CSV export, the practice report and takeHome. */
@SpringBootTest
@Transactional
class MoneyReadsTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackageLedgerService ledger;
    @Autowired MoneyActivityService activity;
    @Autowired PaymentExportController export;
    @Autowired PracticeReportService practice;
    @Autowired MoneySummaryService summary;

    private UUID trainer;
    private UUID client;
    private UUID pack;

    @BeforeEach
    void setUp() {
        String phone = "+919100000093";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(trainer.toString(), null, List.of()));
        client = UUID.randomUUID();
        pack = UUID.randomUUID();
        var p = Map.of("id", client.toString(), "tid", trainer.toString(), "pk", pack.toString());
        // A name that needs quoting and starts with a formula character.
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, '=Meera, \"M\"', 'independent')", p);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (:pk::uuid, :tid::uuid, :id::uuid, '12 sessions', 'floor', 'sessions', 12, 12,
                        9000, 'INR', current_date, current_date + 60, current_date)""", p);
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("activity: sold and paid kinds, names, and keyset paging that loses nothing")
    void activityFeed() {
        ledger.record(trainer, pack, body("amount", "4000.00", "method", "upi"));
        ledger.record(trainer, pack, body("amount", "1000.00", "method", "cash"));

        var all = activity.activity(trainer, null, null, 50, null);
        assertEquals("INR", all.currency());
        assertEquals(3, all.items().size());
        assertEquals(new HashSet<>(List.of("sold", "paid")), new HashSet<>(all.items().stream().map(i -> i.kind()).toList()));
        assertEquals("=Meera, \"M\"", all.items().get(0).clientName());
        for (int i = 1; i < all.items().size(); i++) {
            assertTrue(all.items().get(i - 1).at() >= all.items().get(i).at(), "newest first");
        }

        var seen = new java.util.ArrayList<String>();
        String cursor = null;
        do {
            var page = activity.activity(trainer, null, null, 1, cursor);
            assertTrue(page.items().size() <= 1);
            page.items().forEach(i -> seen.add(i.kind() + i.packageId() + i.at()));
            cursor = page.nextCursor();
        } while (cursor != null);
        assertEquals(3, seen.size());
        assertEquals(3, new HashSet<>(seen).size(), "no row twice");

        assertCode("RANGE_TOO_LARGE", () -> activity.activity(trainer, null, null, 101, null));
        // A window that excludes today is empty.
        var past = activity.activity(trainer, "2020-01-01", "2020-02-01", null, null);
        assertTrue(past.items().isEmpty());
    }

    @Test
    @DisplayName("export: header, quoting, formula guard, and the range rules")
    void csvExport() throws Exception {
        ledger.record(trainer, pack, body("amount", "4000.00", "method", "upi", "note", "-1+1"));
        LocalDate today = LocalDate.now();
        var res = new MockHttpServletResponse();
        export.export(today.minusDays(1).toString(), today.plusDays(2).toString(), null, null, null, null, null, res);

        assertEquals("text/csv; charset=utf-8", res.getContentType());
        assertTrue(res.getHeader("Content-Disposition").contains("payments-" + today.minusDays(1) + "-to-" + today.plusDays(2) + ".csv"));
        String[] lines = res.getContentAsString().split("\r\n");
        assertEquals("bookAt,date,client,package,status,collectedBy,method,reference,amount,gym,trainer,currency,note", lines[0]);
        assertEquals(2, lines.length);
        assertTrue(lines[1].contains("\"'=Meera, \"\"M\"\"\""), lines[1]);
        assertTrue(lines[1].endsWith("INR,'-1+1"), lines[1]);

        assertCode("VALIDATION", () -> run(null, "2026-01-01"));
        assertCode("RANGE_TOO_LARGE", () -> run("2020-01-01", "2024-01-02"));
        assertCode("VALIDATION", () -> run("2026-02-01", "2026-01-01"));
    }

    @Test
    @DisplayName("practice report: counts by month, retention, top clients")
    void practiceReport() {
        String[] statuses = {"done", "done", "no_show", "cancelled"};
        for (int k = 0; k < statuses.length; k++) {
            String status = statuses[k];
            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, cancel_reason)
                    VALUES (gen_random_uuid(), :t::uuid, :c::uuid, now() - make_interval(hours => :h), 60,
                            now() - make_interval(hours => :h) + interval '60 minutes', :s, CASE WHEN :s = 'cancelled' THEN 'trainer' END)""",
                    Map.of("t", trainer.toString(), "c", client.toString(), "s", status,
                            "h", 100 + k * 30));
        }
        ledger.record(trainer, pack, body("amount", "4000.00", "method", "upi"));

        var r = practice.practice(trainer, 24);
        assertEquals(24, r.months().size());
        assertEquals(2, r.headline().delivered());
        assertEquals(1, r.months().stream().mapToInt(m -> m.noShows()).sum());
        assertEquals(1, r.months().stream().mapToInt(m -> m.cancelled()).sum());
        assertNotNull(r.headline().busiestMonth());
        assertNotNull(r.headline().averageSessionsPerClientPerWeek());
        assertEquals(1, r.topClients().size());
        assertEquals(2, r.topClients().get(0).sessions());
        assertEquals("4000.00", r.topClients().get(0).collected());
        assertEquals("4000.00", r.topClients().get(0).yours(), "an independent client's money is all the trainer's");
        assertEquals("9000.00", r.months().get(r.months().size() - 1).billed());
        assertCode("RANGE_TOO_LARGE", () -> practice.practice(trainer, 25));
    }

    @Test
    @DisplayName("summary: takeHome equals collected for independent clients")
    void takeHome() {
        ledger.record(trainer, pack, body("amount", "4000.00", "method", "upi"));
        var s = summary.summary(trainer, 1, null, null);
        assertEquals("4000.00", s.total().collected());
        assertEquals("4000.00", s.total().takeHome());
        assertEquals("4000.00", s.months().get(0).takeHome());
    }

    private void run(String from, String to) {
        try {
            export.export(from, to, null, null, null, null, null, new MockHttpServletResponse());
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static void assertCode(String code, Runnable call) {
        var e = assertThrows(ApiException.class, call::run);
        assertEquals(code, e.getCode(), e.getMessage());
    }
}
