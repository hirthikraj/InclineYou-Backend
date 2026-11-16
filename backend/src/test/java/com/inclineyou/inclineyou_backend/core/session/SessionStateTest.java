package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.SessionIdsRequest;
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
    @Autowired SessionWriteService writes;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean SessionStateJdbcRepository repo;

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
        // From inside the pack's term (13 Nov 2026: a pack pays only for sessions on days inside it).
        var s = session(Duration.ofDays(2));
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
    @DisplayName("a log opened before the start time can be marked done and charges the pack; an unopened future session still cannot")
    void anEarlyStartCanBeFinished() {
        var pack = pack(12, 12, null);
        var early = session(Duration.ofHours(-3));            // three hours from now …
        jdbc.update("UPDATE scheduled_session SET started_at = now() WHERE id = :s::uuid", Map.of("s", early.toString()));
        var future = session(Duration.ofHours(-4));           // … and one nobody has opened
        assertEquals("SESSION_NOT_STARTED", code(() -> states.markDone(trainer, future, null)), "a planned session is not markable by accident");

        var done = states.markDone(trainer, early, null);
        assertEquals("done", done.outcome());
        assertEquals(11, remaining(pack), "the pack is charged exactly as for any delivered session");
        assertEquals("done", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :s::uuid", Map.of("s", early.toString()), String.class));
        assertTrue(jdbc.queryForObject("SELECT ended_at IS NOT NULL FROM scheduled_session WHERE id = :s::uuid", Map.of("s", early.toString()), Boolean.class),
                "marking it done closes the open log");
        assertEquals("already_done", states.markDone(trainer, early, null).outcome(), "and a repeat changes nothing");
        assertEquals(11, remaining(pack));
    }

    @Test
    @DisplayName("the batch route shares the rule: an opened log is marked, an unopened future session is skipped with SESSION_NOT_STARTED")
    void theBatchSharesTheEarlyStartRule() {
        var pack = pack(12, 12, null);
        var early = session(Duration.ofHours(-2));
        jdbc.update("UPDATE scheduled_session SET started_at = now() WHERE id = :s::uuid", Map.of("s", early.toString()));
        var future = session(Duration.ofHours(-5));

        var r = writes.markDone(trainer, new SessionIdsRequest(List.of(early.toString(), future.toString()))).results();
        assertEquals("done", r.get(0).outcome());
        assertEquals("skipped", r.get(1).outcome());
        assertEquals("SESSION_NOT_STARTED", r.get(1).reason());
        assertEquals(11, remaining(pack), "only the opened one was charged");
    }

    @Test
    @DisplayName("a database refusal on one session of a batch answers that one failed; the others are marked and stand")
    void oneRefusalDoesNotSinkTheBatch() {
        var pack = pack(12, 12, null);
        var a = session(Duration.ofHours(4));
        var b = session(Duration.ofHours(3));
        var c = session(Duration.ofHours(2));
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataIntegrityViolationException("package is paused"))
                .when(repo).markDone(b);

        var r = writes.markDone(trainer, new SessionIdsRequest(List.of(a.toString(), b.toString(), c.toString()))).results();
        assertEquals(List.of("done", "failed", "done"), r.stream().map(x -> x.outcome()).toList());
        assertEquals("MARK_FAILED", r.get(1).reason());
        assertEquals(10, remaining(pack), "the two marked were charged; the refused one was not");
        assertEquals("scheduled", jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :s::uuid",
                Map.of("s", b.toString()), String.class), "the refused one is untouched");

        org.mockito.Mockito.doCallRealMethod().when(repo).markDone(b);
        var again = writes.markDone(trainer, new SessionIdsRequest(List.of(a.toString(), b.toString()))).results();
        assertEquals(List.of("already_done", "done"), again.stream().map(x -> x.outcome()).toList(), "marking again is safe");
    }

    @Test
    @DisplayName("the batch charges in the order sessions HAPPENED and answers in the order sent; every outcome in one call")
    void theBatchOrdersAndAnswers() {
        var pack = pack(12, 2, null);   // two left: `marked` takes one below, then only the older of the two may take the last
        var older = session(Duration.ofDays(2));
        var newer = session(Duration.ofDays(1));
        var gone = session(Duration.ofHours(5));
        states.cancel(trainer, gone, null);
        var marked = session(Duration.ofHours(4));
        states.markDone(trainer, marked, null);   // no pack left by then: not_charged, but done
        var nobody = UUID.randomUUID();

        var r = writes.markDone(trainer, new SessionIdsRequest(List.of(newer.toString(), older.toString(),
                gone.toString(), marked.toString(), nobody.toString()))).results();
        assertEquals(List.of(newer.toString(), older.toString(), gone.toString(), marked.toString(), nobody.toString()),
                r.stream().map(x -> x.sessionId()).toList(), "answered in the order sent");
        assertEquals("not_charged", r.get(0).outcome(), "the newer came second: the pack was used up");
        assertEquals("done", r.get(1).outcome(), "the older took the last session");
        assertEquals(pack.toString(), r.get(1).packageId());
        assertEquals("skipped", r.get(2).outcome());
        assertEquals("SESSION_CANCELLED", r.get(2).reason());
        assertEquals("already_done", r.get(3).outcome());
        assertEquals("not_found", r.get(4).outcome(), "an id that is not yours says nothing more");
    }

    @Test
    @DisplayName("the batch refuses an empty list, more than 50, a repeated id and a malformed one")
    void theBatchRefuses() {
        assertEquals(400, refusal(List.of()));
        var many = new java.util.ArrayList<String>();
        for (int i = 0; i < 51; i++) many.add(UUID.randomUUID().toString());
        assertEquals(400, refusal(many));
        String one = UUID.randomUUID().toString();
        assertEquals(400, refusal(List.of(one, one)));
        assertEquals(400, refusal(List.of("nope")));
    }

    @Test
    @DisplayName("a pack pays only for sessions on days inside its term: not before it starts, not after it ends")
    void aPackPaysOnlyInsideItsTerm() {
        // Started 10 days ago, ended 2 days ago — still `active` (the sweeper closes it 7 days after its end date).
        var ended = pack(12, 12, null, "current_date - 2");
        var insideTerm = session(Duration.ofDays(4));
        var afterEnd = session(Duration.ofHours(3));
        var r = writes.markDone(trainer, new SessionIdsRequest(List.of(insideTerm.toString(), afterEnd.toString()))).results();
        assertEquals("done", r.get(0).outcome(), "a session from inside the term, marked late, is still the pack's");
        assertEquals(ended.toString(), r.get(0).packageId());
        assertEquals("not_charged", r.get(1).outcome(), "today is after the pack ended");
        assertEquals("NO_PACKAGE", r.get(1).reason());

        // A renewal that starts tomorrow does not pay for today.
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, start_date)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, 'Next', 'floor', 'sessions', 12, 12, 1000, current_date + 1)
                """, Map.of("tid", trainer.toString(), "cid", client.toString()));
        var today = session(Duration.ofHours(2));
        assertEquals("NO_PACKAGE", states.markDone(trainer, today, null).reason());
    }

    private int refusal(List<String> ids) {
        return assertThrows(com.inclineyou.inclineyou_backend.shared.exception.ApiException.class,
                () -> writes.markDone(trainer, new SessionIdsRequest(ids))).getStatus().value();
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

        // 16 Nov 2026: Undo is for ten minutes after the BOOKING, for a pack booking too. A session from last week that
        // was never marked cannot vanish: it is cancelled instead, which keeps it in the diary.
        var lastWeek = session(Duration.ofDays(6));
        jdbc.update("UPDATE scheduled_session SET created_at = now() - interval '14 days' WHERE id = :s::uuid",
                Map.of("s", lastWeek.toString()));
        assertEquals("SESSION_UNDO_EXPIRED", code(() -> states.delete(trainer, lastWeek)));
        var tenMinutesOld = session(Duration.ofHours(-5));
        jdbc.update("UPDATE scheduled_session SET created_at = now() - interval '11 minutes' WHERE id = :s::uuid",
                Map.of("s", tenMinutesOld.toString()));
        assertEquals("SESSION_UNDO_EXPIRED", code(() -> states.delete(trainer, tenMinutesOld)));
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

    @Test
    @DisplayName("a move keeps booking's rules: a whole minute, a year back to two ahead, and no overlap with the client's other sessions")
    void aMoveKeepsBookingsRules() {
        long base = Instant.now().plus(Duration.ofDays(3)).truncatedTo(java.time.temporal.ChronoUnit.HOURS).toEpochMilli();
        var seven = sessionAt(new Timestamp(base));            // 60 min
        var eight = sessionAt(new Timestamp(base + 3_600_000)); // the next hour, 60 min

        assertEquals("VALIDATION", code(() -> states.patch(trainer, seven, Map.of("scheduledAt", base + 500), null)));
        assertEquals("VALIDATION", code(() -> states.patch(trainer, seven,
                Map.of("scheduledAt", Instant.parse("3026-01-01T01:30:00Z").toEpochMilli()), null)));
        assertEquals("SESSION_CLIENT_OVERLAP", code(() -> states.patch(trainer, seven,
                Map.of("scheduledAt", base + 1_800_000), null)), "07:30 for an hour runs into 08:00");
        assertEquals("SESSION_CLIENT_OVERLAP", code(() -> states.patch(trainer, seven,
                Map.of("durationMinutes", 90), null)), "stretching 07:00 to 90 minutes runs into 08:00");

        // Back to back is fine, and so is moving a session within its own old time.
        assertEquals(45, states.patch(trainer, seven, Map.of("durationMinutes", 45), null).durationMinutes());
        assertEquals(base + 900_000, states.patch(trainer, seven, Map.of("scheduledAt", base + 900_000), null).scheduledAt());
        assertEquals(base + 3_600_000 * 2, states.patch(trainer, eight, Map.of("scheduledAt", base + 3_600_000 * 2), null).scheduledAt());
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
