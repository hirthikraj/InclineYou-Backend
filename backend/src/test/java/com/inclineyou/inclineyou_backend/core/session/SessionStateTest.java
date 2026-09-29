package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The session state machine — api-contract *Schedule* (1.1): done, no-show,
 * cancel, reopen, PATCH and DELETE on one session.
 *
 * <p>What is actually under test is that the pack reflects each session's
 * <b>current</b> outcome, however many times it is re-decided: a charge is
 * written once, reversed (never deleted) on reopen or an unticked no-show, and
 * the charge that emptied a pack takes the pack back to {@code active} when it
 * is reversed (R67) — unless the pack has expired.
 */
@SpringBootTest
@Transactional
class SessionStateTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SessionStateService states;

    private UUID trainer;
    private UUID client;

    @BeforeEach
    void setUp() {
        trainer = trainer("9100000071");
        client = client(trainer, "Meera");
        UUID tenant = UUID.fromString(jdbc.queryForObject(
                "SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("R67 — reopening the charge that emptied a pack puts the pack back to active")
    void reopenBringsAUsedUpPackBack() {
        var pack = pack(12, 1, null);
        var s = session(Duration.ofHours(2));

        var done = states.markDone(trainer, s, null);
        assertEquals("done", done.outcome());
        assertEquals(0, remaining(pack));
        assertEquals("completed", packStatus(pack));

        var back = states.reopen(trainer, s, null);
        assertEquals("scheduled", back.session().status());
        assertTrue(back.effects().chargeReversed());
        assertTrue(back.effects().packageReopened());
        assertEquals(1, remaining(pack));
        assertEquals("active", packStatus(pack));
        assertEquals(1, reversedCharges(s), "reversed, never deleted");

        var again = states.reopen(trainer, s, null);
        assertFalse(again.effects().chargeReversed(), "a second reopen has no effect");
    }

    @Test
    @DisplayName("R67 — an expired pack stays closed; the session is simply uncharged")
    void reopenLeavesAnExpiredPackClosed() {
        // Ran out yesterday: still `active` until the nightly job, which doesn't exist yet.
        var pack = pack(12, 1, null, "current_date - 1");
        var s = session(Duration.ofHours(2));
        states.markDone(trainer, s, null);

        var back = states.reopen(trainer, s, null);
        assertTrue(back.effects().chargeReversed());
        assertFalse(back.effects().packageReopened());
        assertEquals("completed", packStatus(pack));
    }

    @Test
    @DisplayName("no-show settles against what the session already carries")
    void noShowSettles() {
        var pack = pack(12, 12, null);
        var s = session(Duration.ofHours(2));

        assertTrue(states.noShow(trainer, s, Map.of("charge", true)).charged());
        assertTrue(states.noShow(trainer, s, Map.of("charge", true)).charged());
        assertEquals(11, remaining(pack), "asking twice costs one session");

        assertFalse(states.noShow(trainer, s, Map.of("charge", false)).charged());
        assertEquals(12, remaining(pack), "unticking gives it back");

        // The client came after all: done charges once.
        assertEquals("done", states.markDone(trainer, s, null).outcome());
        assertEquals(11, remaining(pack));
        assertEquals("SESSION_DONE", code(() -> states.noShow(trainer, s, Map.of("charge", true))));
    }

    @Test
    @DisplayName("a paused pack is never charged for a no-show")
    void pausedPackIsNotCharged() {
        var pack = pack(12, 12, "now()");
        var s = session(Duration.ofHours(2));
        var r = states.noShow(trainer, s, Map.of("charge", true));
        assertFalse(r.charged());
        assertEquals("PACKAGE_PAUSED", r.reason());
        assertEquals(12, remaining(pack));
    }

    @Test
    @DisplayName("done and no-show wait for the start time")
    void notBeforeTheStart() {
        pack(12, 12, null);
        var s = session(Duration.ofHours(-3));
        assertEquals("SESSION_NOT_STARTED", code(() -> states.markDone(trainer, s, null)));
        assertEquals("SESSION_NOT_STARTED", code(() -> states.noShow(trainer, s, Map.of("charge", true))));
    }

    @Test
    @DisplayName("cancel frees the start; reopen takes it back only if nobody has it")
    void cancelAndReopen() {
        var s = session(Duration.ofHours(-3));
        assertEquals("cancelled", states.cancel(trainer, s, Map.of("reason", "client")).status());
        assertEquals("cancelled", states.cancel(trainer, s, null).status(), "idempotent");
        assertEquals("SESSION_CANCELLED", code(() -> states.markDone(trainer, s, null)));

        var other = sessionAt(startOf(s));
        assertEquals("SESSION_CLIENT_TIME_TAKEN", code(() -> states.reopen(trainer, s, null)));

        states.delete(trainer, other);
        assertEquals("scheduled", states.reopen(trainer, s, null).session().status());
    }

    @Test
    @DisplayName("delete only takes back a fresh booking, and a replay is still 204")
    void deleteOnlyAFreshBooking() {
        pack(12, 12, null);
        var done = session(Duration.ofHours(2));
        states.markDone(trainer, done, null);
        assertEquals("SESSION_SETTLED", code(() -> states.delete(trainer, done)));

        var fresh = session(Duration.ofHours(-3));
        states.delete(trainer, fresh);
        states.delete(trainer, fresh);
        assertThrows(ApiException.class, () -> states.delete(trainer, UUID.randomUUID()));
    }

    @Test
    @DisplayName("PATCH: no status, a stale If-Match is 412, and a settled session keeps its time")
    void patchRules() {
        pack(12, 12, null);
        var s = session(Duration.ofHours(2));
        assertEquals("VALIDATION", code(() -> states.patch(trainer, s, Map.of("status", "done"), null)));
        assertEquals("PRECONDITION_FAILED", code(() -> states.patch(trainer, s, Map.of("durationMinutes", 45), "\"1\"")));

        var moved = states.patch(trainer, s, Map.of("durationMinutes", 45), null);
        assertEquals(45, moved.durationMinutes());
        assertEquals(moved.scheduledAt() + 45 * 60_000L, moved.endsAt(), "ends_at follows the length");

        states.markDone(trainer, s, null);
        assertEquals("SESSION_SETTLED", code(() -> states.patch(trainer, s, Map.of("durationMinutes", 60), null)));
        assertEquals("Great", states.patch(trainer, s, Map.of("notes", "Great"), null).notes());
    }

    /* ──────────────────────────────────────────────────────────── fixtures ── */

    private static String code(Runnable call) {
        return assertThrows(ApiException.class, call::run).getCode();
    }

    private int remaining(UUID pack) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :id::uuid",
                Map.of("id", pack.toString()), Integer.class);
    }

    private String packStatus(UUID pack) {
        return jdbc.queryForObject("SELECT status FROM package WHERE id = :id::uuid",
                Map.of("id", pack.toString()), String.class);
    }

    private int reversedCharges(UUID session) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM package_adjustment
                WHERE session_id = :id::uuid AND kind = 'session' AND reversed_at IS NOT NULL
                """, Map.of("id", session.toString()), Integer.class);
    }

    private Timestamp startOf(UUID session) {
        return jdbc.queryForObject("SELECT scheduled_at FROM scheduled_session WHERE id = :id::uuid",
                Map.of("id", session.toString()), Timestamp.class);
    }

    /** A floor sessions pack; {@code pausedAt} is SQL, or null. Remaining is set before any adjustment exists. */
    private UUID pack(int total, int remaining, String pausedAt) {
        return pack(total, remaining, pausedAt, null);
    }

    /** {@code endDate} is SQL too — set at insert, since a pack's dates move only through adjustments after. */
    private UUID pack(int total, int remaining, String pausedAt, String endDate) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, start_date, paused_at, end_date)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Test pack', 'floor', 'sessions', :total,
                        :remaining, 1000, current_date - 10, %s, %s)
                """.formatted(pausedAt == null ? "NULL" : pausedAt, endDate == null ? "NULL" : endDate),
                Map.of("id", id.toString(), "tid", trainer.toString(), "cid", client.toString(),
                        "total", total, "remaining", remaining));
        return id;
    }

    /** A session that started {@code ago} ago (negative = in the future). */
    private UUID session(Duration ago) {
        return sessionAt(Timestamp.from(Instant.now().minus(ago)));
    }

    private UUID sessionAt(Timestamp at) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :at, 60, :at)
                """, Map.of("id", id.toString(), "tid", trainer.toString(), "cid", client.toString(), "at", at));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", e164));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }
}
