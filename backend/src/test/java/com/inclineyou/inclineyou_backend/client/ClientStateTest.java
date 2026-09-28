package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.session.SessionStateService;
import com.inclineyou.inclineyou_backend.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * api-contract 1.1 Clients: the week books itself (R21), and pause, re-pause,
 * resume, archive and unarchive bring back only what they cancelled (R70).
 */
@SpringBootTest
@Transactional
class ClientStateTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ClientScheduleService schedules;
    @Autowired ClientStateService states;
    @Autowired SessionStateService sessions;

    private UUID trainer;
    private UUID client;

    private static final Map<String, Object> WEEK = Map.of("slots", List.of(
            Map.of("weekday", 1, "start", "07:00"),
            Map.of("weekday", 3, "start", "07:00"),
            Map.of("weekday", 5, "start", "07:00")));

    @BeforeEach
    void setUp() {
        String phone = "+919100000091";
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
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, 'Meera', 'independent')",
                Map.of("id", client.toString(), "tid", trainer.toString()));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("R21 — a week books 28 days once; re-sending it books nothing")
    void weekIsIdempotent() {
        int booked = schedules.put(trainer, client, "*", WEEK).booked();
        assertTrue(booked >= 11 && booked <= 13, "three a week for four weeks, got " + booked);
        assertEquals(0, schedules.put(trainer, client, "*", WEEK).booked());
    }

    @Test
    @DisplayName("R70 — pause, re-pause, resume, archive and unarchive never revive a hand cancel")
    void verbsRestoreOnlyTheirOwn() {
        schedules.put(trainer, client, "*", WEEK);
        String hand = jdbc.queryForObject("""
                SELECT id::text FROM scheduled_session WHERE client_id = :c::uuid ORDER BY scheduled_at LIMIT 1
                """, Map.of("c", client.toString()), String.class);
        sessions.cancel(trainer, UUID.fromString(hand), Map.of("reason", "client"));

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        assertTrue(states.pause(trainer, client, Map.of("pausedUntil", today.plusDays(20).toString()))
                .effects().get("sessionsCancelled") > 0);
        assertTrue(states.pause(trainer, client, Map.of("pausedUntil", today.plusDays(5).toString()))
                .effects().get("sessionsRestored") > 0, "moving the return date earlier brings sessions back");
        states.resume(trainer, client, Map.of());
        assertEquals(0, cancelled("client_paused"), "resume restores every session its pause cancelled");

        assertTrue(states.archive(trainer, client, Map.of("reason", "moved_away")).effects().get("sessionsCancelled") > 0);
        states.unarchive(trainer, client, Map.of());
        assertEquals(0, cancelled("client_archived"));

        assertEquals("cancelled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid",
                Map.of("id", hand), String.class), "the client's own cancel stays cancelled");
        assertEquals(0, states.resume(trainer, client, Map.of()).effects().get("sessionsBooked"), "already active: zero effects");
    }

    private int cancelled(String reason) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND cancel_reason = :r
                """, Map.of("c", client.toString(), "r", reason), Integer.class);
    }
}
