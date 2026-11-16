package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ArchiveRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.DeleteClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PauseRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PutScheduleRequest;

import com.inclineyou.inclineyou_backend.core.session.SessionStateService;
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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
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

    private static final PutScheduleRequest WEEK = new PutScheduleRequest(null, null, null, List.of(
            slot(1), slot(3), slot(5)), null);

    private static PutScheduleRequest.Slot slot(int weekday) {
        return new PutScheduleRequest.Slot(weekday, java.time.LocalTime.of(7, 0), null, null, null);
    }

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
        // The labels AuthTokenFilter puts on a request's connection. erase_client() checks the client against them;
        // a @Transactional test borrows its connection before any request exists, so it labels it itself.
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true) || set_config('app.tenant_ids', :ids, true)",
                Map.of("t", trainer.toString(), "ids", "{" + tenant + "}"), String.class);
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
        assertTrue(states.pause(trainer, client, new PauseRequest(today.plusDays(20)))
                .effects().get("sessionsCancelled") > 0);
        assertTrue(states.pause(trainer, client, new PauseRequest(today.plusDays(5)))
                .effects().get("sessionsRestored") > 0, "moving the return date earlier brings sessions back");
        states.resume(trainer, client);
        assertEquals(0, cancelled("client_paused"), "resume restores every session its pause cancelled");

        assertTrue(states.archive(trainer, client, new ArchiveRequest("moved_away", null)).effects().get("sessionsCancelled") > 0);
        states.unarchive(trainer, client);
        assertEquals(0, cancelled("client_archived"));

        assertEquals("cancelled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid",
                Map.of("id", hand), String.class), "the client's own cancel stays cancelled");
        assertEquals(0, states.resume(trainer, client).effects().get("sessionsBooked"), "already active: zero effects");
    }

    @Test
    @DisplayName("delete refuses a client who is not archived (CLIENT_NOT_ARCHIVED) and touches nothing")
    void deleteNeedsArchiveFirst() {
        var ex = assertThrows(ClientRuleException.class,
                () -> states.delete(trainer, client, new DeleteClientRequest("Meera")));
        assertEquals("CLIENT_NOT_ARCHIVED", ex.getCode());
        assertEquals(409, ex.getStatus().value());
        var row = jdbc.queryForMap("SELECT name, deleted_at, erased_at FROM client WHERE id = :id::uuid", Map.of("id", client.toString()));
        assertEquals("Meera", row.get("name"));
        assertNull(row.get("deleted_at"));
        assertNull(row.get("erased_at"));
    }

    @Test
    @DisplayName("delete refuses a mismatched name and touches nothing")
    void deleteRefusesWrongName() {
        states.archive(trainer, client, new ArchiveRequest("moved_away", null));
        var ex = assertThrows(ClientRuleException.class,
                () -> states.delete(trainer, client, new DeleteClientRequest("Not Meera")));
        assertEquals("CLIENT_DELETE_NOT_CONFIRMED", ex.getCode());
        assertEquals("Meera", jdbc.queryForObject("SELECT name FROM client WHERE id = :id::uuid",
                Map.of("id", client.toString()), String.class));
    }

    @Test
    @DisplayName("archive, then delete: everything personal is erased, the money book keeps amounts and dates, and it cannot run twice")
    void archiveThenDeleteErases() {
        jdbc.update("UPDATE client SET phone = '+919876543210', goal = 'lean out' WHERE id = :id::uuid",
                Map.of("id", client.toString()));
        schedules.put(trainer, client, "*", WEEK);
        var p = Map.of("c", client.toString(), "t", trainer.toString());
        // Personal rows the erase must take: a note, a silence, a program.
        jdbc.update("INSERT INTO client_note (client_id, trainer_id, body) VALUES (:c::uuid, :t::uuid, 'left knee')", p);
        jdbc.update("INSERT INTO attention_dismissal (trainer_id, client_id, kind, band) VALUES (:t::uuid, :c::uuid, 'quiet', 'quiet')", p);
        jdbc.update("INSERT INTO program (origin, trainer_id, client_id, status, name, weeks) VALUES ('trainer', :t::uuid, :c::uuid, 'active', 'Plan', 4)", p);
        // Money the erase must keep: a pack paid in part, with a note on the payment.
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date)
                VALUES ('00000000-0000-4000-8000-00000000a001', :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', 12, 12, 9000, 'INR', current_date)""", p);
        jdbc.update("""
                INSERT INTO payment (trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at, note)
                VALUES (:t::uuid, :c::uuid, '00000000-0000-4000-8000-00000000a001', 4000, 'INR', 'trainer', 'cash', 'paid', now(), 'paid at the desk')""", p);

        states.archive(trainer, client, new ArchiveRequest("moved_away", "relocating"));
        // Case- and whitespace-insensitive, like the confirmation it mirrors.
        var result = states.delete(trainer, client, new DeleteClientRequest("  meera  "));
        assertEquals("Meera", result.client().name(), "the name it answers with is the one read before the erase");
        assertEquals(1, result.effects().get("packagesOwing"), "the pack still owed stays open for Business");

        var row = jdbc.queryForMap("""
                SELECT deleted_at IS NOT NULL AS deleted, erased_at IS NOT NULL AS erased, name, phone, goal, archive_note, membership_status
                FROM client WHERE id = :id::uuid
                """, Map.of("id", client.toString()));
        assertEquals(Boolean.TRUE, row.get("deleted"));
        assertEquals(Boolean.TRUE, row.get("erased"));
        assertNull(row.get("name"), "the name goes too: past payments read it as null, drawn as Deleted client");
        assertNull(row.get("phone"));
        assertNull(row.get("goal"));
        assertNull(row.get("archive_note"));
        assertEquals("removed", row.get("membership_status"));

        assertEquals(0, count("SELECT count(*) FROM client_note WHERE client_id = :c::uuid"));
        assertEquals(0, count("SELECT count(*) FROM attention_dismissal WHERE client_id = :c::uuid"));
        assertEquals(0, count("SELECT count(*) FROM program WHERE client_id = :c::uuid"));
        assertEquals(0, count("SELECT count(*) FROM client_schedule_slot WHERE client_id = :c::uuid"));
        assertEquals(1, count("SELECT count(*) FROM erasure_log WHERE client_id = :c::uuid AND kind = 'client'"));

        // The money book: the payment's amount and date stay, its free text does not.
        var pay = jdbc.queryForMap("SELECT amount, paid_at IS NOT NULL AS dated, note FROM payment WHERE client_id = :c::uuid", p);
        assertEquals(0, new java.math.BigDecimal("4000").compareTo((java.math.BigDecimal) pay.get("amount")));
        assertEquals(Boolean.TRUE, pay.get("dated"));
        assertNull(pay.get("note"));
        assertEquals(1, count("SELECT count(*) FROM package WHERE client_id = :c::uuid AND deleted_at IS NULL"));

        // The same 404 shape every other verb gives a client that is gone (deleted_at IS NULL).
        assertThrows(ApiException.class, () -> states.delete(trainer, client, new DeleteClientRequest("Meera")));
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Map.of("c", client.toString()), Integer.class);
    }

    private int cancelled(String reason) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND cancel_reason = :r
                """, Map.of("c", client.toString(), "r", reason), Integer.class);
    }
}
