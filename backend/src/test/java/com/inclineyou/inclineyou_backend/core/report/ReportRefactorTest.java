package com.inclineyou.inclineyou_backend.core.report;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * What the report slice's repositories and service answer on the v1 schema: ownership, the adherence window,
 * the personal records (done weight x reps sets only) and the next session. The weekly report — its job, its
 * writer and the {@code weekly_report} table — went with this fix: v1 has no such table, and the client portal
 * that read it is out of v1.
 */
@SpringBootTest
@Transactional
class ReportRefactorTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ReportJdbcRepository reports;
    @Autowired ReportService service;

    private UUID trainer, other, client;

    @BeforeEach
    void setUp() {
        trainer = trainer("+919100000095", "Coach");
        other = trainer("+919100000096", "Someone Else");
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:c::uuid, :t::uuid, 'Asha', 'independent')",
                Map.of("c", client.toString(), "t", trainer.toString()));
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) SELECT gen_random_uuid(), id, :n FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING",
                Map.of("p", phone, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    private void session(String status, int daysAgo) {
        Timestamp at = Timestamp.from(Instant.now().minus(daysAgo, ChronoUnit.DAYS));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, cancel_reason)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :at, 60, :at, :s, CASE WHEN :s = 'cancelled' THEN 'trainer' END)
                """, Map.of("t", trainer.toString(), "c", client.toString(), "at", at, "s", status));
    }

    @Test @DisplayName("names: the caller's own client reads, someone else's client and a deleted one read as absent")
    void names() {
        var n = reports.names(trainer, client).orElseThrow();
        assertEquals("Asha", n.clientName());
        assertTrue(reports.names(other, client).isEmpty(), "another trainer must not see this client");
        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertTrue(reports.names(trainer, client).isEmpty());
    }

    @Test @DisplayName("an unknown client is a sentence, not an error")
    void unknownClient() {
        assertEquals("Report unavailable — client not found.", service.generateReport(trainer, UUID.randomUUID()));
        assertEquals("Report unavailable — client not found.", service.generateReport(other, client));
    }

    @Test @DisplayName("sessionStats: done against everything not cancelled, inside the window only")
    void sessionStats() {
        session("done", 3);
        session("done", 10);
        session("scheduled", 1);
        session("cancelled", 2);
        session("done", 60);                                  // outside the four-week window
        var s = reports.sessionStats(trainer, client, LocalDate.now().minusWeeks(4));
        assertEquals(2, s.done());
        assertEquals(3, s.scheduled());
        var none = reports.sessionStats(other, client, LocalDate.now().minusWeeks(4));
        assertEquals(0, none.scheduled(), "scoped by trainer_id");
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)",
                Map.of("id", id.toString(), "n", name, "src", "test-" + id));
        return id;
    }

    /** One logged exercise on a fresh done session: a set per (kind, load, effort) triple, all done. */
    private int loggedDays = 10;

    private void logged(UUID exercise, String loadKind, String effortKind, double[]... loadEffort) {
        UUID s = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, started_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, now() - make_interval(days => :d), 60, now() - make_interval(days => :d), 'done', now() - make_interval(days => :d))
                """, Map.of("id", s.toString(), "t", trainer.toString(), "c", client.toString(), "d", loggedDays++));
        UUID sx = UUID.randomUUID();
        jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:id::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                Map.of("id", sx.toString(), "s", s.toString(), "c", client.toString(), "e", exercise.toString()));
        int pos = 1;
        for (double[] le : loadEffort) {
            jdbc.update("""
                    INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at)
                    VALUES (:sx::uuid, :p, false, :lk, :ek, :l, :e, now())
                    """, Map.of("sx", sx.toString(), "p", pos++, "lk", loadKind, "ek", effortKind, "l", le[0], "e", le[1]));
        }
    }

    @Test @DisplayName("personalRecords: the heaviest weight x reps set per exercise, heaviest first, this trainer's client only")
    void personalRecords() {
        UUID bench = exercise("Bench press"), squat = exercise("Back squat"), plank = exercise("Plank");
        logged(bench, "weight", "reps", new double[]{60, 8}, new double[]{70, 5}, new double[]{70, 6});   // best: 70 x 6
        logged(squat, "weight", "reps", new double[]{100, 5});
        logged(plank, "bodyweight", "time", new double[]{0, 60});                                      // no kilogram figure: no record
        var prs = reports.personalRecords(trainer, client);
        assertEquals(2, prs.size());
        assertEquals("Back squat", prs.get(0).exercise());
        assertEquals(0, new java.math.BigDecimal("100").compareTo((java.math.BigDecimal) prs.get(0).maxLoadKg()));
        assertEquals("Bench press", prs.get(1).exercise());
        assertEquals(0, new java.math.BigDecimal("6").compareTo((java.math.BigDecimal) prs.get(1).maxReps()), "ties on load break on reps");
        assertTrue(reports.personalRecords(other, client).isEmpty(), "another trainer must not read this client's sets");
    }

    @Test @DisplayName("personalRecords: a set on a removed exercise card is not a record")
    void removedCardIsNotARecord() {
        UUID bench = exercise("Bench press");
        logged(bench, "weight", "reps", new double[]{50, 10});
        jdbc.update("UPDATE session_exercise SET removed_at = now() WHERE client_id = :c::uuid", Map.of("c", client.toString()));
        assertTrue(reports.personalRecords(trainer, client).isEmpty());
    }

    @Test @DisplayName("nextSession: the soonest scheduled one ahead, with its workout's name when it runs one")
    void nextSession() {
        assertTrue(reports.nextSession(trainer, client).isEmpty());
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, now() + interval '3 days', 60, now() + interval '3 days', 'scheduled')
                """, Map.of("t", trainer.toString(), "c", client.toString()));
        var next = reports.nextSession(trainer, client).orElseThrow();
        assertNull(next.workoutName(), "a walk-in slot carries no workout name");
        assertTrue(next.scheduledAt().isAfter(Instant.now()));
        assertTrue(reports.nextSession(other, client).isEmpty());
    }

    @Test @DisplayName("generateReport: the text names the client, counts the four weeks and lists the records")
    void report() {
        session("done", 3);
        session("scheduled", 1);
        logged(exercise("Bench press"), "weight", "reps", new double[]{70, 6});
        String text = service.generateReport(trainer, client);
        assertTrue(text.contains("Client: Asha"), text);
        assertTrue(text.contains("Sessions (last 4 weeks): 2 done"), text);   // the logged() session is done too
        assertTrue(text.contains("Bench press: 70"), text);
    }
}
