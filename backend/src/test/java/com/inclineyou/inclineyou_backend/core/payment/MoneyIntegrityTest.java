package com.inclineyou.inclineyou_backend.core.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** V7 — the walls the database itself holds: overpayment, pack names, arrangement overlap, book_at, gym_cut. */
@SpringBootTest
@Transactional
class MoneyIntegrityTest {

    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID trainer, client, pkg;

    @BeforeEach
    void setUp() {
        String phone = "+919100000094";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING", Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p", Map.of("p", phone), String.class));
        client = UUID.randomUUID();
        pkg = UUID.randomUUID();
        var p = Map.of("c", client.toString(), "k", pkg.toString(), "t", trainer.toString());
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:c::uuid, :t::uuid, 'Asha', 'independent')", p);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date)
                VALUES (:k::uuid, :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', 12, 12, 1000, 'INR', current_date)""", p);
    }

    /** The database refuses the statement; a savepoint keeps the test's transaction usable afterwards. */
    private void refused(Runnable statement) {
        jdbc.getJdbcOperations().execute("SAVEPOINT refusal");
        assertThrows(DataIntegrityViolationException.class, statement::run);
        jdbc.getJdbcOperations().execute("ROLLBACK TO SAVEPOINT refusal");
    }

    private void pay(String amount, String status) {
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :k::uuid, :a, 'INR', 'trainer', 'cash', :s, CASE WHEN :s = 'paid' THEN now() END)""",
                Map.of("t", trainer.toString(), "c", client.toString(), "k", pkg.toString(), "a", new BigDecimal(amount), "s", status));
    }

    @Test @DisplayName("a package cannot be paid past its price, even by a write that skips the service")
    void overpayment() {
        pay("600", "paid");
        pay("400", "paid");
        refused(() -> pay("1", "paid"));
    }

    @Test @DisplayName("a pending row is expectation and is not capped")
    void pendingIsFree() {
        pay("1000", "paid");
        assertDoesNotThrow(() -> pay("500", "pending"));
    }

    @Test @DisplayName("a live pack name is unique per trainer, case-insensitively, and a deleted one frees it")
    void packNames() {
        String ins = """
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency)
                VALUES (gen_random_uuid(), :t::uuid, :n, 'floor', 'sessions', 10, 5000, 'INR')""";
        jdbc.update(ins, Map.of("t", trainer.toString(), "n", "Ten"));
        refused(() -> jdbc.update(ins, Map.of("t", trainer.toString(), "n", "TEN")));
        jdbc.update("UPDATE pack SET deleted_at = now() WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        assertDoesNotThrow(() -> jdbc.update(ins, Map.of("t", trainer.toString(), "n", "ten")));
    }

    @Test @DisplayName("arrangement date ranges cannot overlap, closed or running")
    void arrangementOverlap() {
        String ins = """
                INSERT INTO gym_arrangement (id, trainer_id, gym_name, currency, starts_month, ends_month)
                VALUES (gen_random_uuid(), :t::uuid, 'Cult', 'INR', :s::date, :e::date)""";
        var t = trainer.toString();
        jdbc.update(ins, Map.of("t", t, "s", "2026-01-01", "e", "2026-03-01"));
        refused(() -> jdbc.update(ins, Map.of("t", t, "s", "2026-03-01", "e", "2026-05-01")));
        assertDoesNotThrow(() -> jdbc.update(ins, Map.of("t", t, "s", "2026-04-01", "e", "2026-05-01")));
    }

    @Test @DisplayName("book_at is the instant the row counts on, and gym_cut is the gym's part")
    void bookAtAndGymCut() {
        pay("300", "paid");
        pay("200", "pending");
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM payment WHERE package_id = :k::uuid AND book_at = coalesce(paid_at, written_off_at, refunded_at, created_at)",
                Map.of("k", pkg.toString()), Integer.class));
        assertEquals(0, new BigDecimal("4000.00").compareTo(jdbc.queryForObject("SELECT gym_cut(10000, 60, NULL)", Map.of(), BigDecimal.class)));
        assertEquals(0, new BigDecimal("2500").compareTo(jdbc.queryForObject("SELECT gym_cut(10000, NULL, 7500)", Map.of(), BigDecimal.class)));
        assertEquals(0, BigDecimal.ZERO.compareTo(jdbc.queryForObject("SELECT gym_cut(10000, NULL, NULL)", Map.of(), BigDecimal.class)));
    }
}
