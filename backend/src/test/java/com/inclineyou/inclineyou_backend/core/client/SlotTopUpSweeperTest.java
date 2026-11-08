package com.inclineyou.inclineyou_backend.core.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** V30 · the slot top-up: a standing weekly slot keeps appearing on the calendar without anybody re-saving the week. */
@SpringBootTest
@Transactional
class SlotTopUpSweeperTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SlotTopUpSweeper sweeper;

    private UUID trainer;

    @BeforeEach
    void setUp() {
        String phone = "+919100000394";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    /** A client on one weekly slot — tomorrow's weekday at 07:00 — with no session booked yet. */
    private UUID clientWithSlot(String status) {
        UUID id = UUID.randomUUID();
        var p = Map.of("id", id.toString(), "tid", trainer.toString(), "st", status,
                "dow", LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(1).getDayOfWeek().getValue());
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type, status, paused_at)
                VALUES (:id::uuid, :tid::uuid, 'Meera', 'independent', :st, CASE WHEN :st = 'paused' THEN now() END)""", p);
        jdbc.update("""
                INSERT INTO client_schedule (client_id, tenant_id, session_duration_minutes, delivery_mode)
                SELECT :id::uuid, tenant_id, 60, 'floor' FROM client WHERE id = :id::uuid
                ON CONFLICT (client_id) DO UPDATE SET session_duration_minutes = 60, delivery_mode = 'floor'""", p);
        jdbc.update("""
                INSERT INTO client_schedule_slot (client_id, tenant_id, weekday, start_time)
                SELECT :id::uuid, tenant_id, :dow, '07:00' FROM client WHERE id = :id::uuid""", p);
        return id;
    }

    private int booked(UUID client) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM scheduled_session
                WHERE client_id = :id::uuid AND deleted_at IS NULL AND scheduled_at > now()""",
                Map.of("id", client.toString()), Integer.class);
    }

    @Test
    @DisplayName("books a standing slot four weeks ahead, once, and leaves a paused client alone")
    void topsUpBookableClientsOnly() {
        UUID active = clientWithSlot("active");
        UUID paused = clientWithSlot("paused");

        sweeper.topUp();

        assertEquals(4, booked(active), "tomorrow plus the three weeks after it, inside the 28-day window");
        assertEquals(0, booked(paused), "a paused client is not bookable");

        sweeper.topUp();
        assertEquals(4, booked(active), "a second run finds the client booked to the edge and books nothing");
    }

    @Test
    @DisplayName("never books back a session the trainer cancelled")
    void respectsCancellations() {
        UUID client = clientWithSlot("active");
        sweeper.topUp();
        jdbc.update("""
                UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'trainer'
                WHERE id = (SELECT id FROM scheduled_session WHERE client_id = :id::uuid ORDER BY scheduled_at LIMIT 1)""",
                Map.of("id", client.toString()));
        // Pretend four weeks passed by moving the edge in: drop the last two bookings.
        jdbc.update("""
                DELETE FROM scheduled_session WHERE id IN (
                    SELECT id FROM scheduled_session WHERE client_id = :id::uuid ORDER BY scheduled_at DESC LIMIT 2)""",
                Map.of("id", client.toString()));

        sweeper.topUp();

        int cancelled = jdbc.queryForObject("""
                SELECT count(*) FROM scheduled_session WHERE client_id = :id::uuid AND status = 'cancelled'""",
                Map.of("id", client.toString()), Integer.class);
        assertEquals(1, cancelled, "the cancelled one stays cancelled and is not booked again beside it");
    }
}
