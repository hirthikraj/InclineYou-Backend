package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.ActiveClient;
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
 * What the report slice's repositories answer today, pinned so the layering refactor cannot move it.
 *
 * <p>Deliberately NOT here: the personal-records, next-session and weekly-report statements. They still
 * read pre-v1 tables and columns ({@code workout_session}, {@code scheduled_session.day_label},
 * {@code weekly_report}), so they fail on the v1 schema — a standing break the refactor preserved on
 * purpose, and one that should be fixed rather than pinned.
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

    @Test @DisplayName("the week arithmetic and the job's log shape do not move")
    void pureHelpers() {
        // a Monday morning and a Sunday night both report on the week that just finished
        assertEquals(LocalDate.of(2026, 9, 21), WeeklyReportWriter.lastWeekStart(LocalDate.of(2026, 9, 28)));
        assertEquals(LocalDate.of(2026, 9, 21), WeeklyReportWriter.lastWeekStart(LocalDate.of(2026, 10, 4)));
        var a = new ActiveClient(UUID.fromString("00000000-0000-4000-8000-000000000001"), UUID.fromString("00000000-0000-4000-8000-000000000002"));
        assertEquals("{trainer_id=00000000-0000-4000-8000-000000000001, client_id=00000000-0000-4000-8000-000000000002}", a.toString());
    }
}
