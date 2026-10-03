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
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * api-contract Business — gym share, pay terms and payouts: the settlement
 * arithmetic (minimum vs basic vs share only, payouts poured oldest month
 * first, the running month owing nothing yet), the arrangement rules, and the
 * payout rules.
 */
@SpringBootTest
@Transactional
class GymMoneyTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired GymMoneyService money;
    @Autowired GymArrangementService arrangements;
    @Autowired TrainerPayoutService payouts;

    private UUID trainer;
    private final YearMonth now = YearMonth.now(java.time.ZoneId.of("Asia/Kolkata"));

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
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    private void gym() {
        jdbc.update("UPDATE trainer_business SET gym_name = 'Cult', training_modes = '[\"gym_floor\"]' WHERE trainer_id = :t::uuid",
                Map.of("t", trainer.toString()));
    }

    /** One gym pack at 10000 with a 60% trainer share, sold to a gym client who paid in full today. */
    private void gymSale() {
        UUID pack = UUID.randomUUID(), client = UUID.randomUUID(), pkg = UUID.randomUUID();
        var p = Map.of("pk", pack.toString(), "c", client.toString(), "k", pkg.toString(), "t", trainer.toString());
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency, owner, trainer_share_percent)
                VALUES (:pk::uuid, :t::uuid, 'Gym 12', 'floor', 'sessions', 12, 10000, 'INR', 'gym', 60)""", p);
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:c::uuid, :t::uuid, 'Asha', 'gym')", p);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date, trainer_share_percent)
                VALUES (:k::uuid, :t::uuid, :c::uuid, :pk::uuid, 'Gym 12', 'floor', 'sessions', 12, 12,
                        10000, 'INR', current_date, current_date + 60, current_date, 60)""", p);
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, status, paid_at)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :k::uuid, 10000, 'INR', 'gym', 'paid', now())""", p);
    }

    @Test
    @DisplayName("the split: per-pack share, derived gym cut, weighted percent")
    void split() {
        gym();
        gymSale();
        var g = money.get(trainer, null, null);
        assertEquals("Cult", g.gymName());
        assertEquals("10000.00", g.stats().floorBilled());
        assertEquals("4000.00", g.stats().gymCut());
        assertEquals(40.0, g.stats().gymCutPercent());
        assertEquals("6000.00", g.stats().yours());
        assertEquals(12, g.stats().floorSessions());
        var s = g.shares().get(0);
        assertEquals("Gym 12", s.packName());
        assertEquals(1, s.sold());
        assertEquals("6000.00", s.trainerTake());
        assertEquals("4000.00", s.gymCut());
        assertEquals("4000.00", s.gymShareAmount());
        assertEquals(0, s.gymSharePercent().compareTo(new java.math.BigDecimal("40")));
        assertNull(g.settlement(), "no terms, no settlement");
        assertCode("RANGE_TOO_LARGE", () -> money.get(trainer, "2020-01", "2026-12"));
    }

    @Test
    @DisplayName("settlement: a minimum, paid in parts, oldest month first")
    void settlement() {
        gym();
        gymSale();
        String starts = now.minusMonths(2).toString();
        arrangements.create(trainer, body("baseKind", "minimum", "baseAmount", "15000.00", "startsMonth", starts));
        payouts.create(trainer, body("amount", "20000.00", "method", "bank_transfer", "reference", "NEFT1"));

        var st = money.get(trainer, now.minusMonths(2).toString(), now.toString()).settlement();
        assertEquals(3, st.months().size());
        var m2 = st.months().get(0);
        assertEquals("15000.00", m2.owed());
        assertEquals("15000.00", m2.received());
        assertEquals("0.00", m2.balance());
        var m1 = st.months().get(1);
        assertEquals("5000.00", m1.received());
        assertEquals("10000.00", m1.balance());
        var run = st.months().get(2);
        assertTrue(run.soFar());
        assertNull(run.balance(), "the running month owes nothing yet");
        assertEquals("6000.00", run.yourShare());
        assertEquals("15000.00", run.owed(), "a minimum is the larger of the base and the share");
        assertEquals("10000.00", st.balanceDue());
        assertEquals(1, st.recentPayouts().size());
    }

    @Test
    @DisplayName("owed: basic is base plus share, no base is the share")
    void owedKinds() {
        gym();
        gymSale();
        arrangements.create(trainer, body("baseKind", "basic", "baseAmount", "2000.00", "startsMonth", now.toString()));
        assertEquals("8000.00", money.get(trainer, null, null).settlement().months().get(0).owed());
        var rows = arrangements.list(trainer);
        arrangements.patch(trainer, UUID.fromString(rows.get(0).id()), null, body("baseKind", null, "baseAmount", "0"));
        assertEquals("6000.00", money.get(trainer, null, null).settlement().months().get(0).owed());
    }

    @Test
    @DisplayName("arrangements: needs a gym, replay, overlap, closes the running row, started, delete")
    void arrangementRules() {
        assertCode("ARRANGEMENT_NEEDS_GYM", () -> arrangements.create(trainer, body("startsMonth", now.toString())));
        gym();
        assertCode("VALIDATION", () -> arrangements.create(trainer, body("baseKind", "minimum", "startsMonth", now.toString())));
        assertCode("VALIDATION", () -> arrangements.create(trainer, body("startsMonth", "2026-13")));

        UUID id = UUID.randomUUID();
        var made = arrangements.create(trainer, body("id", id.toString(), "baseKind", "minimum", "baseAmount", "12000.00",
                "startsMonth", now.minusMonths(3).toString()));
        assertTrue(made.created());
        assertEquals("Cult", made.arrangement().gymName(), "copied, not sent");
        assertFalse(arrangements.create(trainer, body("id", id.toString(), "startsMonth", now.toString())).created());

        assertCode("ARRANGEMENT_OVERLAP", () -> arrangements.create(trainer, body("startsMonth", now.minusMonths(3).toString())));

        var next = arrangements.create(trainer, body("baseKind", "minimum", "baseAmount", "15000.00",
                "startsMonth", now.toString())).arrangement();
        var all = arrangements.list(trainer);
        assertEquals(next.id(), all.get(0).id(), "the running one first");
        assertEquals(now.minusMonths(1).toString(), all.get(1).endsMonth());

        // The old terms have started: the base is history, the note is not.
        assertCode("ARRANGEMENT_STARTED", () -> arrangements.patch(trainer, id, null, body("baseAmount", "13000")));
        assertEquals("agreed by phone", arrangements.patch(trainer, id, null, body("note", "agreed by phone")).note());
        // The new terms start this month and can still be fixed; a stale If-Match is 412.
        UUID nid = UUID.fromString(next.id());
        assertEquals("16000.00", arrangements.patch(trainer, nid, null, body("baseAmount", "16000")).baseAmount());
        assertCode("PRECONDITION_FAILED", () -> arrangements.patch(trainer, nid, "\"1\"", body("note", "x")));

        arrangements.delete(trainer, nid);
        arrangements.delete(trainer, nid);   // idempotent
        assertEquals(1, arrangements.list(trainer).size());
    }

    @Test
    @DisplayName("payouts: need terms, never in the future, patch, delete, paging")
    void payoutRules() {
        assertCode("ARRANGEMENT_REQUIRED", () -> payouts.create(trainer, body("amount", "100")));
        gym();
        arrangements.create(trainer, body("startsMonth", now.toString()));
        assertCode("VALIDATION", () -> payouts.create(trainer, body("amount", "0")));
        assertCode("VALIDATION", () -> payouts.create(trainer, body("amount", "100", "method", "cheque")));
        assertCode("VALIDATION", () -> payouts.create(trainer, body("amount", "100",
                "receivedAt", System.currentTimeMillis() + 3_600_000L)));

        UUID id = UUID.randomUUID();
        long past = System.currentTimeMillis() - 5 * 86_400_000L;
        var made = payouts.create(trainer, body("id", id.toString(), "amount", "1000.00", "receivedAt", past));
        assertTrue(made.created());
        assertEquals("Cult", made.payout().gymName());
        assertFalse(payouts.create(trainer, body("id", id.toString(), "amount", "5")).created());
        payouts.create(trainer, body("amount", "250.00", "method", "upi"));

        var page = payouts.list(trainer, null, null, null, 1, null);
        assertEquals(1, page.items().size());
        assertNotNull(page.nextCursor());
        assertEquals("250.00", page.items().get(0).amount(), "newest first");
        assertEquals(1, payouts.list(trainer, null, null, null, 1, page.nextCursor()).items().size());

        assertEquals("1200.00", payouts.patch(trainer, id, null, body("amount", "1200")).amount());
        payouts.delete(trainer, id);
        payouts.delete(trainer, id);
        assertEquals(1, payouts.list(trainer, null, null, null, null, null).items().size());
        assertCode("VALIDATION", () -> payouts.patch(UUID.randomUUID(), id, null, body("x", 1)));
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static void assertCode(String code, Runnable r) {
        var e = assertThrows(ApiException.class, r::run);
        assertEquals(code, e.getCode());
    }
}
