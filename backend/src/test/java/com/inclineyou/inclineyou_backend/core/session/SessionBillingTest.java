package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.payment.PackageReadService;
import com.inclineyou.inclineyou_backend.core.payment.PackageRenewService;
import com.inclineyou.inclineyou_backend.core.payment.PackageSaleService;
import com.inclineyou.inclineyou_backend.core.payment.PackageUndoService;
import com.inclineyou.inclineyou_backend.core.payment.dto.RenewRequest;
import com.inclineyou.inclineyou_backend.core.session.dto.BookRequest;
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

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * How a session is paid for (V32, 9 Nov 2026): trial and complimentary sessions are never charged, a single session
 * sells itself at Mark done, a delivered session's billing can be settled afterwards, the booking panel's
 * booked-ahead count, and a new or renewed pack taking the delivered sessions the trainer names (option B).
 */
@SpringBootTest
@Transactional
class SessionBillingTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SessionStateService states;
    @Autowired SessionBookingService bookings;
    @Autowired SessionReadService reads;
    @Autowired PackageReadService packageReads;
    @Autowired PackageRenewService renewals;
    @Autowired PackageSaleService sales;
    @Autowired PackageUndoService undos;
    @Autowired com.inclineyou.inclineyou_backend.core.payment.PackageLedgerService ledger;
    @Autowired com.inclineyou.inclineyou_backend.core.payment.PackageJdbcRepository packagesRepo;
    @Autowired com.inclineyou.inclineyou_backend.core.client.ClientScheduleJdbcRepository schedule;
    @Autowired com.inclineyou.inclineyou_backend.core.client.ClientStateService clientStates;

    private UUID trainer;
    private UUID client;

    @BeforeEach
    void setUp() {
        trainer = trainer("9100000091");
        client = client("Meera");
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
    @DisplayName("booking records the billing; a price belongs to a single session and only to it")
    void bookingTakesBilling() {
        long at = Instant.now().plus(Duration.ofDays(2)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var trial = bookings.book(trainer, book(at, "trial", null)).session();
        assertEquals("trial", trial.billing());
        assertNull(trial.price());

        var single = bookings.book(trainer, book(at + 3_600_000, "single", "800")).session();
        assertEquals("single", single.billing());
        assertEquals("800.00", single.price());

        var plain = bookings.book(trainer, book(at + 7_200_000, null, null)).session();
        assertEquals("pack", plain.billing(), "the default is today's behaviour");

        assertEquals("VALIDATION", code(() -> bookings.book(trainer, book(at + 9_000_000, "single", null))));
        assertEquals("VALIDATION", code(() -> bookings.book(trainer, book(at + 9_000_000, "pack", "800"))));
        assertEquals("VALIDATION", code(() -> bookings.book(trainer, book(at + 9_000_000, "free", null))));
        assertEquals("VALIDATION", code(() -> bookings.book(trainer, book(at + 9_000_000, "single", "0"))));
    }

    @Test
    @DisplayName("a trial or complimentary session is delivered free and is never money to chase")
    void freeSessionsAreNeverCharged() {
        var pack = pack(12, 12);
        var trial = session(Duration.ofHours(3), "trial", null);
        var gift = session(Duration.ofHours(2), "complimentary", null);

        var r1 = states.markDone(trainer, trial, null);
        assertEquals("not_charged", r1.outcome());
        assertEquals("TRIAL", r1.reason());
        var r2 = states.markDone(trainer, gift, null);
        assertEquals("COMPLIMENTARY", r2.reason());
        assertEquals(12, remaining(pack), "the live pack is untouched");

        assertFalse(states.noShow(trainer, session(Duration.ofHours(4), "trial", null), Map.of("charge", true)).charged(),
                "a free session's no-show costs nothing either");
        assertTrue(uncharged().isEmpty(), "free on purpose is not owed");
    }

    @Test
    @DisplayName("a single session sells itself at Mark done, and a reopen takes the unpaid sale back")
    void singleSellsItself() {
        var pack = pack(12, 12);
        var s = session(Duration.ofHours(2), "single", new BigDecimal("800"));

        var done = states.markDone(trainer, s, null);
        assertEquals("done", done.outcome());
        UUID sale = UUID.fromString(done.packageId());
        assertNotEquals(pack, sale, "never the client's pack");
        assertEquals(12, remaining(pack));
        var row = jdbc.queryForMap("SELECT amount, status, session_id::text AS sid, sessions_remaining, name FROM package WHERE id = :id::uuid",
                Map.of("id", sale.toString()));
        assertEquals(0, new BigDecimal("800").compareTo((BigDecimal) row.get("amount")));
        assertEquals("completed", row.get("status"));
        assertEquals(s.toString(), row.get("sid"));
        assertEquals(0, row.get("sessions_remaining"));
        assertEquals(0, new BigDecimal("800").compareTo(due(sale)), "owed in the money book");

        // Reopened (10 Nov 2026): the charge comes back, and the sale stays owed — it was sold, and it will happen again.
        var back = states.reopen(trainer, s, null);
        assertEquals(1, back.effects().sessionsRemaining());
        assertEquals("kept", back.effects().sale(), "the charge came off its own sale, which stays owed");
        assertEquals(0, new BigDecimal("800").compareTo(due(sale)), "still owed after a reopen");
        assertEquals(sale.toString(), states.markDone(trainer, s, null).packageId(), "never sold twice");
    }

    @Test
    @DisplayName("a single session sells itself when booked: due on its day, not owed before it, and Undo within 10 minutes takes both back")
    void singleSoldAtBooking() {
        long at = Instant.now().plus(Duration.ofDays(3)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var booked = bookings.book(trainer, book(at, "single", "800")).session();
        assertNotNull(booked.sale(), "the sale is on the row");
        assertEquals("800.00", booked.sale().amount());
        assertEquals("active", booked.sale().status());
        UUID sale = UUID.fromString(booked.sale().packageId());
        assertEquals(dayOf(at), booked.sale().dueDate(), "due on the session's day");
        // Not owed before its day: off scope=current, so the client does not read as owing for it today.
        assertTrue(packageReads.list(trainer, true, client).stream().noneMatch(p -> p.id().equals(sale.toString())));
        assertTrue(packageReads.list(trainer, false, client).stream().anyMatch(p -> p.id().equals(sale.toString())),
                "but it is in the client's history");

        // A move takes the day with it.
        long later = at + Duration.ofDays(2).toMillis();
        states.patch(trainer, UUID.fromString(booked.id()), Map.of("scheduledAt", later), null);
        assertEquals(dayOf(later), reads.one(trainer, UUID.fromString(booked.id())).orElseThrow().sale().dueDate());

        // Undo within ten minutes: the booking and the sale go together.
        states.delete(trainer, UUID.fromString(booked.id()));
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM package WHERE id = :id::uuid",
                Map.of("id", sale.toString()), Timestamp.class));

        // After ten minutes: no Undo — cancel it instead.
        var second = bookings.book(trainer, book(at, "single", "800")).session();
        // The window is the BOOKING's (16 Nov 2026), whatever its billing.
        jdbc.update("UPDATE scheduled_session SET created_at = now() - interval '11 minutes' WHERE id = :id::uuid",
                Map.of("id", second.id()));
        assertEquals("SESSION_UNDO_EXPIRED", code(() -> states.delete(trainer, UUID.fromString(second.id()))));
        // Nor can the sale be undone on its own.
        assertEquals("PACKAGE_SINGLE_SESSION", code(() -> undos.undo(trainer, UUID.fromString(second.sale().packageId()))));
    }

    @Test
    @DisplayName("a pack session never takes another session's single sale: with no pack it is delivered uncharged, and the single sale stays whole")
    void packSessionNeverTakesASingleSale() {
        long next = Instant.now().plus(Duration.ofDays(6)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var single = bookings.book(trainer, book(next, "single", "800")).session();
        var today = session(Duration.ofHours(2), "pack", null);
        var mark = states.markDone(trainer, today, null);
        assertEquals("NO_PACKAGE", mark.reason(), "no pack: delivered, not charged");
        assertEquals(1, remaining(UUID.fromString(single.sale().packageId())), "next week's sale is untouched");

        // The backstop (V35): the database refuses the charge even if code asked for it.
        var other = session(Duration.ofHours(3), "pack", null);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'session', -1, :sid::uuid)
                """, Map.of("tid", trainer.toString(), "pid", single.sale().packageId(), "cid", client.toString(),
                "sid", other.toString())));
    }

    @Test
    @DisplayName("a single session booked after a pack is not that pack's renewal")
    void aSingleBookingIsNotARenewal() {
        var old = pack(5, 1);
        jdbc.update("UPDATE package SET created_at = now() - interval '30 days' WHERE id = :id::uuid", Map.of("id", old.toString()));
        long next = Instant.now().plus(Duration.ofDays(3)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        bookings.book(trainer, book(next, "single", "800"));
        assertNotNull(renewals.renew(trainer, old, null).pkg(), "renew still allowed");
    }

    @Test
    @DisplayName("cancel and no-show ask whether to charge: no closes the sale (kept, nothing owed), yes keeps it owed; reopen revives it")
    void cancelAndNoShowDecideTheSale() {
        long at = Instant.now().plus(Duration.ofDays(1)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var a = bookings.book(trainer, book(at, "single", "800")).session();
        UUID sa = UUID.fromString(a.id());
        var cancelled = states.cancel(trainer, sa, Map.of("reason", "client"));
        assertEquals("cancelled", cancelled.sale().status(), "not charged: closed, kept");
        assertEquals(0, BigDecimal.ZERO.compareTo(due(UUID.fromString(a.sale().packageId()))), "nothing owed");
        var revived = states.reopen(trainer, sa, null);
        assertEquals("active", revived.session().sale().status(), "booked again: owed again");
        assertEquals("revived", revived.effects().sale());
        assertFalse(revived.effects().chargeReversed());

        var charged = states.cancel(trainer, sa, Map.of("reason", "client", "charge", true));
        assertEquals("completed", charged.sale().status(), "a late cancel charged: the sale is used");
        assertEquals(0, new BigDecimal("800").compareTo(due(UUID.fromString(a.sale().packageId()))));
        assertEquals("VALIDATION", code(() -> states.cancel(trainer, UUID.fromString(
                bookings.book(trainer, book(at + 7_200_000, "single", "800")).session().id()), Map.of("charge", "yes"))));

        // A no-show (a session whose time has come): not charged closes it, charged keeps it.
        var past = session(Duration.ofHours(2), "single", new BigDecimal("800"));
        states.noShow(trainer, past, Map.of("charge", true));
        var row = states.reopen(trainer, past, null).session();
        assertEquals("active", row.sale().status());
        states.noShow(trainer, past, Map.of("charge", false));
        assertEquals("active", states.reopen(trainer, past, null).session().sale().status(),
                "reopen after an uncharged no-show revives the sale");
    }

    @Test
    @DisplayName("reopening a single session with no sale to revive sells it again: after a refund, or booked before sales at booking")
    void reopenSellsWhenNothingToRevive() {
        long at = Instant.now().plus(Duration.ofDays(1)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var a = bookings.book(trainer, book(at, "single", "800")).session();
        UUID sa = UUID.fromString(a.id());
        UUID first = UUID.fromString(a.sale().packageId());
        ledger.record(trainer, first, Map.of("amount", "800", "method", "upi"));
        states.cancel(trainer, sa, Map.of("reason", "client"));
        ledger.refund(trainer, first, Map.of("amount", "800", "method", "upi"));
        // The row shows the newest sale by created_at, and one test transaction gives every row the same now(): in use
        // the refund and the reopen are separate transactions, so put the first sale where it would be.
        jdbc.update("UPDATE package SET created_at = created_at - interval '1 hour' WHERE id = :id::uuid",
                Map.of("id", first.toString()));

        var reopened = states.reopen(trainer, sa, null);
        assertEquals("sold", reopened.effects().sale());
        var sale = reopened.session().sale();
        assertNotNull(sale, "booked again: sold again");
        assertNotEquals(first.toString(), sale.packageId(), "a new sale — the refunded one gave up its place (V33)");
        assertEquals("active", sale.status());
        assertEquals(0, new BigDecimal("800").compareTo(due(UUID.fromString(sale.packageId()))), "owed again");
        assertEquals("refunded", packageReads.one(trainer, first).orElseThrow().status(), "the refund stands");

        // A session cancelled before sales were made at booking has no sale at all.
        var b = bookings.book(trainer, book(at + 7_200_000, "single", "800")).session();
        UUID sb = UUID.fromString(b.id());
        states.cancel(trainer, sb, Map.of("reason", "client"));
        jdbc.update("UPDATE package SET session_id = NULL, deleted_at = now() WHERE id = :id::uuid",
                Map.of("id", b.sale().packageId()));
        var legacy = states.reopen(trainer, sb, null);
        assertNotNull(legacy.session().sale(), "a legacy booking is sold when it is booked again");
        assertEquals("sold", legacy.effects().sale());
        assertNull(states.reopen(trainer, sb, null).effects().sale(), "a second reopen changes nothing");
    }

    @Test
    @DisplayName("a cancel sent again with a different charge decision re-decides it; the same decision changes nothing")
    void cancelReDecides() {
        long at = Instant.now().plus(Duration.ofDays(2)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var s = bookings.book(trainer, book(at, "single", "800")).session();
        UUID sid = UUID.fromString(s.id());
        UUID sale = UUID.fromString(s.sale().packageId());

        var first = states.cancel(trainer, sid, Map.of("reason", "client"));
        assertEquals("cancelled", first.sale().status(), "not charged: nothing owed");
        assertNull(first.charge());

        var charged = states.cancel(trainer, sid, Map.of("reason", "client", "charge", true));
        assertEquals("completed", charged.sale().status(), "changed their mind: the late cancel is charged");
        assertNotNull(charged.charge(), "and the row says so");
        assertEquals(0, new BigDecimal("800").compareTo(due(sale)));
        assertEquals("completed", states.cancel(trainer, sid, Map.of("charge", true)).sale().status(), "the same again: no change");
        assertEquals("completed", states.cancel(trainer, sid, null).sale().status(), "a plain repeat: no change");

        var back = states.cancel(trainer, sid, Map.of("charge", false));
        assertEquals("cancelled", back.sale().status(), "and back: nothing owed");
        assertNull(back.charge());
        assertEquals(0, BigDecimal.ZERO.compareTo(due(sale)));

        // A pack session too: one session, then given back.
        var pack = pack(12, 12);
        var p = bookings.book(trainer, book(at + 7_200_000, null, null)).session();
        UUID pid = UUID.fromString(p.id());
        states.cancel(trainer, pid, null);
        states.cancel(trainer, pid, Map.of("charge", true));
        assertEquals(11, remaining(pack));
        states.cancel(trainer, pid, Map.of("charge", false));
        assertEquals(12, remaining(pack));
    }

    @Test
    @DisplayName("a pause cancels future bookings and closes their sales (nothing owed); a resume brings both back")
    void pauseClosesSales() {
        long at = Instant.now().plus(Duration.ofDays(5)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var s = bookings.book(trainer, book(at, "single", "800")).session();
        var zone = java.time.ZoneId.of(jdbc.queryForObject("SELECT timezone FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        assertEquals(1, schedule.cancelUpcoming(client, "client_paused", null, zone));
        assertEquals("cancelled", reads.one(trainer, UUID.fromString(s.id())).orElseThrow().sale().status());
        assertEquals(1, schedule.restoreUpcoming(client, "client_paused", null, zone));
        assertEquals("active", reads.one(trainer, UUID.fromString(s.id())).orElseThrow().sale().status());
    }

    @Test
    @DisplayName("pausing and resuming a client leaves a single session's sale owed and unpaused — it is the session's, not a pack the pause stops")
    void pauseAndResumeLeaveASingleSaleWhole() {
        long at = Instant.now().plus(Duration.ofDays(5)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var s = bookings.book(trainer, book(at, "single", "800")).session();
        String sale = s.sale().packageId();
        var pack = pack(12, 12);

        clientStates.pause(trainer, client, new com.inclineyou.inclineyou_backend.core.client.dto.PauseRequest(null));
        assertNull(jdbc.queryForObject("SELECT paused_at FROM package WHERE id = :id::uuid", Map.of("id", sale), Timestamp.class),
                "the pause never pauses a single sale: the cancelled session closes it");
        assertNotNull(jdbc.queryForObject("SELECT paused_at FROM package WHERE id = :id::uuid", Map.of("id", pack.toString()),
                Timestamp.class), "a real pack is paused");

        clientStates.resume(trainer, client);
        var row = jdbc.queryForMap("SELECT status, paused_at FROM package WHERE id = :id::uuid", Map.of("id", sale));
        assertEquals("active", row.get("status"), "owed again with its session");
        assertNull(row.get("paused_at"), "and not left paused, which would leave its session uncharged at Mark done");
    }

    @Test
    @DisplayName("a booked single session's sale follows a billing change: dropped while unpaid, refused once money is on it")
    void billingChangeMovesTheSale() {
        long at = Instant.now().plus(Duration.ofDays(4)).truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var s = bookings.book(trainer, book(at, "single", "800")).session();
        UUID sid = UUID.fromString(s.id());
        states.billing(trainer, sid, Map.of("billing", "single", "price", "900"));
        assertEquals("900.00", reads.one(trainer, sid).orElseThrow().sale().amount(), "repriced");
        states.billing(trainer, sid, Map.of("billing", "pack"));
        assertNull(reads.one(trainer, sid).orElseThrow().sale(), "dropped");

        states.billing(trainer, sid, Map.of("billing", "single", "price", "800"));
        var sale = reads.one(trainer, sid).orElseThrow().sale().packageId();
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method, status, paid_at)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :pid::uuid, 800, 'INR', 'cash', 'paid', now())
                """, Map.of("tid", trainer.toString(), "cid", client.toString(), "pid", sale));
        assertEquals("SESSION_SALE_PAID", code(() -> states.billing(trainer, sid, Map.of("billing", "pack"))));
        assertEquals("SESSION_SALE_PAID", code(() -> states.delete(trainer, sid)), "paid: no Undo either");
    }

    @Test
    @DisplayName("a delivered, uncharged session can be settled afterwards; a charged one must be reopened first")
    void settleAfterDelivery() {
        var s = session(Duration.ofHours(2), "pack", null);
        assertEquals("NO_PACKAGE", states.markDone(trainer, s, null).reason());
        assertEquals(List.of(s.toString()), uncharged(), "money to chase");

        var gift = states.billing(trainer, s, Map.of("billing", "complimentary"));
        assertFalse(gift.charged());
        assertEquals("COMPLIMENTARY", gift.reason());
        assertTrue(uncharged().isEmpty());

        var sold = states.billing(trainer, s, Map.of("billing", "single", "price", "650.00"));
        assertTrue(sold.charged());
        assertNotNull(sold.session().charge());

        // The same again changes nothing; anything else waits for a reopen.
        assertTrue(states.billing(trainer, s, Map.of("billing", "single", "price", "650")).session().charge() != null);
        assertEquals("SESSION_CHARGED", code(() -> states.billing(trainer, s, Map.of("billing", "trial"))));
        assertEquals("VALIDATION", code(() -> states.billing(trainer, s, Map.of("billing", "trial", "colour", "red"))));
        assertEquals("VALIDATION", code(() -> states.billing(trainer, s, Map.of("billing", "single", "price", 650))));

        // A no-show's money is the no-show's own decision (17 Nov 2026): reopen it first.
        var missed = session(Duration.ofHours(3), "pack", null);
        states.noShow(trainer, missed, Map.of("charge", false));
        assertEquals("SESSION_SETTLED", code(() -> states.billing(trainer, missed, Map.of("billing", "single", "price", "800"))));
        assertTrue(jdbc.queryForList("SELECT 1 FROM package WHERE session_id = :s::uuid AND deleted_at IS NULL",
                Map.of("s", missed.toString())).isEmpty(), "no sale for a session that did not happen");

        // Before delivery it only records the choice.
        var later = session(Duration.ofHours(-24), "pack", null);
        var r = states.billing(trainer, later, Map.of("billing", "trial"));
        assertFalse(r.charged());
        assertEquals("trial", r.session().billing());
        assertNull(r.session().charge());
    }

    @Test
    @DisplayName("current packs carry what is already booked against them, free sessions not counted")
    void bookedAhead() {
        var pack = pack(12, 4);
        session(Duration.ofHours(-24), "pack", null);
        session(Duration.ofHours(-48), "pack", null);
        session(Duration.ofHours(-72), "pack", null);
        session(Duration.ofHours(-96), "trial", null);
        session(Duration.ofHours(-120), "single", new BigDecimal("700"));

        var row = packageReads.list(trainer, true, client).stream()
                .filter(p -> p.id().equals(pack.toString())).findFirst().orElseThrow();
        assertEquals(3, row.sessionsBookedAhead());
        assertNull(packageReads.list(trainer, false, client).get(0).sessionsBookedAhead(), "current scope only");
    }

    @Test
    @DisplayName("option B — a renew takes exactly the delivered sessions it is sent")
    void renewTakesNamedSessions() {
        var old = pack(5, 1);
        var a = session(Duration.ofHours(5), "pack", null);
        states.markDone(trainer, a, null);                         // the last session: the pack closes
        var b = session(Duration.ofHours(4), "pack", null);
        var c = session(Duration.ofHours(3), "pack", null);
        assertEquals("NO_PACKAGE", states.markDone(trainer, b, null).reason());
        assertEquals("NO_PACKAGE", states.markDone(trainer, c, null).reason());

        // `a` is charged already: refused whole.
        assertEquals("SESSION_NOT_UNCHARGED", code(() -> renewals.renew(trainer, old,
                new RenewRequest(UUID.randomUUID().toString(), null, List.of(a.toString())))));
        assertEquals("VALIDATION", code(() -> renewals.renew(trainer, old,
                new RenewRequest(null, null, List.of(b.toString(), b.toString())))));
    }

    @Test
    @DisplayName("option B — the renewed pack opens with the chosen sessions taken, the rest left for the trainer")
    void renewChargesChosen() {
        var old = pack(5, 1);
        states.markDone(trainer, session(Duration.ofHours(5), "pack", null), null);
        var b = session(Duration.ofHours(4), "pack", null);
        var c = session(Duration.ofHours(3), "pack", null);
        states.markDone(trainer, b, null);
        states.markDone(trainer, c, null);

        var made = renewals.renew(trainer, old, new RenewRequest(null, null, List.of(b.toString()))).pkg();
        assertEquals(4, made.sessionsRemaining(), "5 sold, 1 taken");
        assertEquals(List.of(c.toString()), uncharged(), "only what was named");
        assertEquals(made.id(), jdbc.queryForObject("""
                SELECT package_id::text FROM package_adjustment
                WHERE session_id = :sid::uuid AND kind = 'session' AND reversed_at IS NULL
                """, Map.of("sid", b.toString()), String.class));
    }

    @Test
    @DisplayName("option B — a first sale can take the sessions delivered before it, up to its size")
    void saleTakesSessions() {
        var b = session(Duration.ofHours(4), "pack", null);
        var c = session(Duration.ofHours(3), "pack", null);
        states.markDone(trainer, b, null);
        states.markDone(trainer, c, null);

        var body = new HashMap<String, Object>(Map.of("name", "Two", "service", "floor", "basis", "sessions",
                "sessionsTotal", 2, "amount", "2000.00"));
        body.put("chargeSessionIds", List.of(b.toString(), c.toString()));
        var made = sales.sell(trainer, client, body).pkg();
        assertEquals(0, made.sessionsRemaining());
        assertEquals("completed", made.status(), "used up by the back-charge closes it, as Mark done would");
        assertTrue(uncharged().isEmpty());

        var tooMany = new HashMap<String, Object>(Map.of("name", "One", "service", "floor", "basis", "sessions",
                "sessionsTotal", 1, "amount", "1000.00"));
        tooMany.put("chargeSessionIds", List.of(UUID.randomUUID().toString(), UUID.randomUUID().toString()));
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, tooMany)));
    }

    @Test
    @DisplayName("Undo takes a renew back without a trace and gives back the sessions it took")
    void undoRenew() {
        var old = pack(5, 1);
        states.markDone(trainer, session(Duration.ofHours(5), "pack", null), null);
        var b = session(Duration.ofHours(4), "pack", null);
        states.markDone(trainer, b, null);

        var attempt = UUID.randomUUID();
        var made = UUID.fromString(renewals.renew(trainer, old,
                new RenewRequest(attempt.toString(), null, List.of(b.toString()))).pkg().id());
        assertEquals(attempt, made);
        assertTrue(uncharged().isEmpty());

        undos.undo(trainer, made);
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM package WHERE id = :id::uuid",
                Map.of("id", made.toString()), Timestamp.class));
        assertTrue(packageReads.list(trainer, false, client).stream().noneMatch(p -> p.id().equals(made.toString())),
                "gone from every read, not kept as cancelled");
        assertEquals(List.of(b.toString()), uncharged(), "the session waits for a pack again");
        undos.undo(trainer, made);   // a replay is harmless

        // The same renew sent again after Undo (a network retry, a stale tab) says it was undone, and sells nothing.
        assertEquals("PACKAGE_UNDONE", code(() -> renewals.renew(trainer, old,
                new RenewRequest(attempt.toString(), null, null))));

        // Renewing again is allowed: the undone one no longer counts as a renewal.
        assertNotNull(renewals.renew(trainer, old, new RenewRequest(null, null, null)).pkg());
    }

    @Test
    @DisplayName("Undo of a sale its back-charges used up (completed) still works, and gives every session back")
    void undoAUsedUpSale() {
        var b = session(Duration.ofHours(4), "pack", null);
        var c = session(Duration.ofHours(3), "pack", null);
        states.markDone(trainer, b, null);
        states.markDone(trainer, c, null);
        var body = new HashMap<String, Object>(Map.of("name", "Two", "service", "floor", "basis", "sessions",
                "sessionsTotal", 2, "amount", "2000.00"));
        body.put("chargeSessionIds", List.of(b.toString(), c.toString()));
        var made = sales.sell(trainer, client, body).pkg();
        assertEquals("completed", made.status());

        undos.undo(trainer, UUID.fromString(made.id()));
        assertEquals("cancelled", jdbc.queryForObject("SELECT status FROM package WHERE id = :id::uuid",
                Map.of("id", made.id()), String.class));
        assertEquals(2, uncharged().size(), "both sessions wait for a pack again");
    }

    @Test
    @DisplayName("Undo takes back only the sale's own back-charges, never a session charged to the pack afterwards")
    void undoReversesOnlyItsOwnCharges() {
        var old = pack(5, 1);
        var b = session(Duration.ofHours(4), "pack", null);
        states.markDone(trainer, b, null);   // the old pack: 0 left
        var b2 = session(Duration.ofHours(3), "pack", null);
        states.markDone(trainer, b2, null);  // no pack: delivered, uncharged
        var made = UUID.fromString(renewals.renew(trainer, old,
                new RenewRequest(null, null, List.of(b2.toString()))).pkg().id());
        // A charge written after the sale, as a Mark done racing the Undo would leave it.
        var late = session(Duration.ofHours(2), "pack", null);
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id, created_at)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'session', -1, :sid::uuid, now() + interval '1 second')
                """, Map.of("tid", trainer.toString(), "pid", made.toString(), "cid", client.toString(), "sid", late.toString()));
        assertEquals(1, packagesRepo.reverseSaleCharges(made), "only the back-charge the sale itself made");
        assertNull(jdbc.queryForObject("""
                SELECT reversed_at FROM package_adjustment WHERE session_id = :sid::uuid AND kind = 'session'
                """, Map.of("sid", late.toString()), Timestamp.class), "the later charge is untouched");
        // And the Undo itself sees that later charge and refuses.
        assertEquals("PACKAGE_IN_USE", code(() -> undos.undo(trainer, made)));
    }

    @Test
    @DisplayName("undoing a sale that turned a prospect into a client puts them back to prospect; any other client stays as they were")
    void undoPutsAProspectBack() {
        var today = LocalDate.now(java.time.ZoneId.of(jdbc.queryForObject("SELECT timezone FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class)));
        jdbc.update("UPDATE client SET status = 'prospect' WHERE id = :id::uuid", Map.of("id", client.toString()));
        var first = sales.sell(trainer, client, saleBody(today)).pkg();
        assertEquals("active", status(client), "the sale made them a client");
        undos.undo(trainer, UUID.fromString(first.id()));
        assertEquals("prospect", status(client), "and its Undo takes that back");

        // An active client sold a pack and undone: still active — this sale did not make them one.
        jdbc.update("UPDATE client SET status = 'active' WHERE id = :id::uuid", Map.of("id", client.toString()));
        var second = sales.sell(trainer, client, saleBody(today)).pkg();
        undos.undo(trainer, UUID.fromString(second.id()));
        assertEquals("active", status(client));
    }

    @Test
    @DisplayName("Undo refuses a pack with money or a pack event on it, an old one, and one that is not yours")
    void undoRefusals() {
        var paid = pack(5, 5);
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method, status, paid_at)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :pid::uuid, 100, 'INR', 'cash', 'paid', now())
                """, Map.of("tid", trainer.toString(), "cid", client.toString(), "pid", paid.toString()));
        assertEquals("PACKAGE_IN_USE", code(() -> undos.undo(trainer, paid)));

        var paused = pack(5, 5);
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, days, sessions, effective_at)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'pause', 0, 0, now())
                """, Map.of("tid", trainer.toString(), "cid", client.toString(), "pid", paused.toString()));
        assertEquals("PACKAGE_IN_USE", code(() -> undos.undo(trainer, paused)));

        var old = pack(5, 5);
        jdbc.update("UPDATE package SET created_at = now() - interval '11 minutes' WHERE id = :id::uuid",
                Map.of("id", old.toString()));
        assertEquals("PACKAGE_UNDO_EXPIRED", code(() -> undos.undo(trainer, old)));

        assertEquals(404, assertThrows(ApiException.class, () -> undos.undo(trainer, UUID.randomUUID())).getStatus().value());
    }

    @Test
    @DisplayName("a single session's own sale is marked on the wire, is never the newest pack Renew copies, and cannot be renewed")
    void singleSaleIsNotAPack() {
        // A finished, paid-up pack: on scope=current only because it is the client's newest.
        var old = pack(12, 0);
        jdbc.update("UPDATE package SET status = 'completed', closed_at = now() WHERE id = :id::uuid", Map.of("id", old.toString()));
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method, status, paid_at)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :pid::uuid, 1000, 'INR', 'cash', 'paid', now())
                """, Map.of("tid", trainer.toString(), "cid", client.toString(), "pid", old.toString()));

        var s = session(Duration.ofHours(2), "single", new BigDecimal("800"));
        UUID sale = UUID.fromString(states.markDone(trainer, s, null).packageId());

        var current = packageReads.list(trainer, true, client);
        var real = current.stream().filter(p -> p.id().equals(old.toString())).findFirst().orElseThrow(
                () -> new AssertionError("the last real pack stays on scope=current for Renew"));
        assertNull(real.sessionId());
        var single = current.stream().filter(p -> p.id().equals(sale.toString())).findFirst().orElseThrow();
        assertEquals(s.toString(), single.sessionId(), "the sale names its session");

        assertEquals("PACKAGE_SINGLE_SESSION", code(() -> renewals.renew(trainer, sale, null)));
        renewals.renew(trainer, old, null);   // the real pack still renews
    }

    @Test
    @DisplayName("renew checks the client like a sale does: archived is CLIENT_ARCHIVED, deleted is 404, a replay still answers")
    void renewChecksTheClient() {
        var old = pack(5, 1);
        var attempt = UUID.randomUUID();
        renewals.renew(trainer, old, new RenewRequest(attempt.toString(), null, null));

        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :id::uuid", Map.of("id", client.toString()));
        // A retry of the renew that landed before the archive is still its answer.
        assertFalse(renewals.renew(trainer, old, new RenewRequest(attempt.toString(), null, null)).created());
        assertEquals("CLIENT_ARCHIVED", code(() -> renewals.renew(trainer, old, null)));

        // Erased: the packages stay as a money record, the client is gone.
        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :id::uuid", Map.of("id", client.toString()));
        assertEquals(404, assertThrows(ApiException.class, () -> renewals.renew(trainer, old, null)).getStatus().value());
    }

    @Test
    @DisplayName("a renew or a sale starts within three months of today, either way")
    void startDateWindow() {
        var old = pack(5, 1);
        var today = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));
        for (var bad : List.of(today.minusMonths(3).minusDays(1), today.plusMonths(3).plusDays(1), LocalDate.of(2062, 1, 1))) {
            assertEquals("VALIDATION", code(() -> renewals.renew(trainer, old, new RenewRequest(null, bad.toString(), null))));
            assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, saleBody(bad))));
        }
        // The edges are allowed.
        var made = renewals.renew(trainer, old, new RenewRequest(null, today.minusMonths(3).toString(), null)).pkg();
        assertEquals(today.minusMonths(3).toString(), made.startDate());
        assertNotNull(sales.sell(trainer, client, saleBody(today.plusMonths(3))).pkg());
    }

    @Test
    @DisplayName("a newer pack that is paused still counts as the renewal: renewing the old one again is refused")
    void pausedRenewalStillCounts() {
        var old = pack(5, 1);
        jdbc.update("UPDATE package SET created_at = now() - interval '30 days' WHERE id = :id::uuid", Map.of("id", old.toString()));
        var made = UUID.fromString(renewals.renew(trainer, old, null).pkg().id());
        jdbc.update("UPDATE package SET paused_at = now() WHERE id = :id::uuid", Map.of("id", made.toString()));
        assertEquals("PACKAGE_ALREADY_RENEWED", assertThrows(
                com.inclineyou.inclineyou_backend.core.payment.PackageRuleException.class,
                () -> renewals.renew(trainer, old, null)).getCode());
    }

    /* ──────────────────────────────────────────────────────────── fixtures ── */

    private static Map<String, Object> saleBody(LocalDate start) {
        return new HashMap<>(Map.of("name", "Ten", "service", "floor", "basis", "sessions", "sessionsTotal", 10,
                "amount", "5000.00", "startDate", start.toString()));
    }

    private String dayOf(long epochMs) {
        String tz = jdbc.queryForObject("SELECT timezone FROM trainer WHERE id = :id::uuid", Map.of("id", trainer.toString()), String.class);
        return Instant.ofEpochMilli(epochMs).atZone(java.time.ZoneId.of(tz)).toLocalDate().toString();
    }

    private String status(UUID clientId) {
        return jdbc.queryForObject("SELECT status FROM client WHERE id = :id::uuid", Map.of("id", clientId.toString()), String.class);
    }

    private static String code(Runnable call) {
        return assertThrows(ApiException.class, call::run).getCode();
    }

    private BookRequest book(long at, String billing, String price) {
        return new BookRequest(null, client.toString(), at, 60, null, null, null, billing, price);
    }

    private List<String> uncharged() {
        var today = LocalDate.now();
        return reads.list(trainer, today.minusDays(30).toString(), today.plusDays(2).toString(), client.toString(),
                null, true, null, null, null).items().stream().map(r -> r.id()).toList();
    }

    private int remaining(UUID pack) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :id::uuid",
                Map.of("id", pack.toString()), Integer.class);
    }

    private BigDecimal due(UUID pack) {
        return packageReads.one(trainer, pack).map(p -> new BigDecimal(p.amountDue())).orElseThrow();
    }

    private UUID pack(int total, int remaining) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, start_date)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Test pack', 'floor', 'sessions', :total,
                        :remaining, 1000, current_date - 10)
                """, Map.of("id", id.toString(), "tid", trainer.toString(), "cid", client.toString(),
                "total", total, "remaining", remaining));
        return id;
    }

    /** A session that started {@code ago} ago (negative = in the future). */
    private UUID session(Duration ago, String billing, BigDecimal price) {
        var id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainer.toString());
        p.put("cid", client.toString());
        p.put("at", Timestamp.from(Instant.now().minus(ago).truncatedTo(ChronoUnit.MINUTES)));
        p.put("billing", billing);
        p.put("price", price);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, billing, price)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :at, 60, :at, :billing, :price)
                """, p);
        return id;
    }

    private UUID client(String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", trainer.toString(), "name", name));
        // Consented (22 Nov 2026): ConsentGate refuses a third session, notes, the profile and health data without it.
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :id::uuid",
                Map.of("id", id.toString()));
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
