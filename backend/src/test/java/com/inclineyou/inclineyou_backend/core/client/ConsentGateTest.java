package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateNoteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.core.session.SessionStateService;
import com.inclineyou.inclineyou_backend.core.session.SessionWriteService;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionIdsRequest;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionStartService;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The consent gate (22 Nov 2026): two delivered sessions before the client accepts their invite, never a third; notes,
 * the personal profile and health data wait for the acceptance; taking data away never does.
 */
@SpringBootTest
@Transactional
class ConsentGateTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SessionStateService states;
    @Autowired SessionWriteService writes;
    @Autowired SessionStartService starts;
    @Autowired ClientNoteService notes;
    @Autowired ClientWriteService clients;

    private UUID trainer;
    private UUID client;

    @BeforeEach
    void setUp() {
        trainer = trainer("9100000091");
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, 'Kavya', 'independent')",
                Map.of("id", client.toString(), "tid", trainer.toString()));
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("two sessions are delivered without consent — by Mark done or by opening the log — and the third is 409 CONSENT_REQUIRED")
    void twoThenRefused() {
        states.markDone(trainer, session(Duration.ofHours(5)), null);
        starts.start(trainer, session(Duration.ofHours(3)), null);

        var third = session(Duration.ofHours(1));
        var e = assertThrows(ApiException.class, () -> states.markDone(trainer, third, null));
        assertEquals(ConsentGate.CODE, e.getCode());
        var e2 = assertThrows(ApiException.class, () -> starts.start(trainer, third, null));
        assertEquals(ConsentGate.CODE, e2.getCode());
        assertEquals("scheduled", status(third), "nothing was written");

        // The batch answers the same refusal per session rather than failing the whole request.
        var batch = writes.markDone(trainer, new SessionIdsRequest(List.of(third.toString())));
        assertEquals("skipped", batch.results().get(0).outcome());
        assertEquals(ConsentGate.CODE, batch.results().get(0).reason());
    }

    @Test
    @DisplayName("a log opened inside the allowance can always be marked done; no-shows and bookings never count")
    void openLogAndNoShowsDoNotCount() {
        states.markDone(trainer, session(Duration.ofHours(6)), null);
        var open = session(Duration.ofHours(4));
        // Opened at the session's own start, as a trainer catching up would, so the log closes inside the session.
        starts.start(trainer, open, new com.inclineyou.inclineyou_backend.core.sessionlog.dto.StartRequest(
                Instant.now().minus(Duration.ofHours(4)).toEpochMilli()));
        session(Duration.ofHours(30));   // booked and never delivered
        assertDoesNotThrow(() -> states.markDone(trainer, open, null), "the second session's own log, finished");

        var noShow = session(Duration.ofHours(2));
        jdbc.update("UPDATE scheduled_session SET status = 'no_show' WHERE id = :s::uuid", Map.of("s", noShow.toString()));
        var e = assertThrows(ApiException.class, () -> states.markDone(trainer, session(Duration.ofHours(1)), null));
        assertEquals(ConsentGate.CODE, e.getCode(), "two delivered; the no-show and the booking were not counted");
    }

    @Test
    @DisplayName("accepting the invite lifts every lock: sessions, notes and the profile")
    void consentLifts() {
        states.markDone(trainer, session(Duration.ofHours(5)), null);
        states.markDone(trainer, session(Duration.ofHours(4)), null);
        consent();
        assertDoesNotThrow(() -> states.markDone(trainer, session(Duration.ofHours(1)), null));
        assertDoesNotThrow(() -> notes.create(trainer, client, new CreateNoteRequest(UUID.randomUUID(), "Left knee niggle", false, false)));
        assertDoesNotThrow(() -> clients.patch(trainer, client, profile(Patch.of("Run 10k")), null));
    }

    @Test
    @DisplayName("before consent a note and the profile are 409 CONSENT_REQUIRED; clearing the profile is not")
    void notesAndProfileWait() {
        var e = assertThrows(ApiException.class,
                () -> notes.create(trainer, client, new CreateNoteRequest(UUID.randomUUID(), "Left knee niggle", false, false)));
        assertEquals(ConsentGate.CODE, e.getCode());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_note WHERE client_id = :c::uuid",
                Map.of("c", client.toString()), Integer.class));

        var p = assertThrows(ApiException.class, () -> clients.patch(trainer, client, profile(Patch.of("Run 10k")), null));
        assertEquals(ConsentGate.CODE, p.getCode());
        assertDoesNotThrow(() -> clients.patch(trainer, client, profile(Patch.of(null)), null), "clearing takes data away");
    }

    @Test
    @DisplayName("declined is not consent; removed after accepting still is")
    void whoHasConsented() {
        jdbc.update("UPDATE client SET membership_status = 'declined', invited_at = now(), declined_at = now() WHERE id = :c::uuid",
                Map.of("c", client.toString()));
        assertThrows(ApiException.class,
                () -> notes.create(trainer, client, new CreateNoteRequest(UUID.randomUUID(), "x", false, false)));
        jdbc.update("UPDATE client SET membership_status = 'removed', accepted_at = now(), declined_at = NULL, removed_at = now(), "
                + "removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertDoesNotThrow(() -> notes.create(trainer, client, new CreateNoteRequest(UUID.randomUUID(), "x", false, false)));
    }

    private static UpdateClientRequest profile(Patch<String> goal) {
        return new UpdateClientRequest(null, null, null, null, goal, null, null, null, null, null, null);
    }

    private void consent() {
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid",
                Map.of("c", client.toString()));
    }

    private String status(UUID session) {
        return jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :s::uuid", Map.of("s", session.toString()), String.class);
    }

    private UUID session(Duration ago) {
        var id = UUID.randomUUID();
        var at = Timestamp.from(Instant.now().minus(ago));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :at, 60, CAST(:at AS timestamptz) + interval '60 minutes')
                """, Map.of("id", id.toString(), "tid", trainer.toString(), "cid", client.toString(), "at", at));
        return id;
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("phone", e164));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :p) ON CONFLICT (app_user_id) DO NOTHING",
                Map.of("a", appUserId, "p", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid",
                Map.of("a", appUserId), String.class));
    }
}
