package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.client.ClientNoteService;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateNoteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateNoteRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * api-contract 1.1 Client file — the money book's correcting writes (R73), the
 * pack's life, R74's cancel, and the notes' delete / restore.
 */
@SpringBootTest
@Transactional
class PackageLedgerTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackageLedgerService ledger;
    @Autowired PackageReadService reads;
    @Autowired ClientNoteService notes;

    private UUID trainer;
    private UUID client;
    private UUID pack;

    @BeforeEach
    void setUp() {
        String phone = "+919100000092";
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
        pack = UUID.randomUUID();
        var p = Map.of("id", client.toString(), "tid", trainer.toString(), "pk", pack.toString());
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, 'Meera', 'independent')", p);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (:pk::uuid, :tid::uuid, :id::uuid, '12 sessions', 'floor', 'sessions', 12, 12,
                        9000, 'INR', current_date, current_date + 60, current_date)""", p);
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("record, replay, over-due and a UTR recorded twice")
    void recordRules() {
        UUID id = UUID.randomUUID();
        var first = ledger.record(trainer, pack, body("id", id.toString(), "amount", "4000.00", "method", "upi",
                "reference", "UTR1"));
        assertTrue(first.created());
        assertEquals("5000.00", first.pkg().amountDue());
        assertEquals("trainer", first.payment().collectedBy(), "stamped by the database");

        var again = ledger.record(trainer, pack, body("id", id.toString(), "amount", "4000.00", "method", "upi"));
        assertFalse(again.created(), "a replayed id answers the original");
        assertEquals("5000.00", again.pkg().amountDue());

        assertCode("PAYMENT_OVER_DUE", () -> ledger.record(trainer, pack, body("amount", "5000.01", "method", "cash")));
        assertCode("VALIDATION", () -> ledger.record(trainer, pack, body("amount", "10")));   // an independent needs a method
        // Last: the unique violation aborts this test's one transaction (a request has its own).
        assertCode("PAYMENT_REFERENCE_TAKEN",
                () -> ledger.record(trainer, pack, body("amount", "10", "method", "upi", "reference", "UTR1")));
    }

    @Test
    @DisplayName("pending → paid, a retried tap, and writing off everything owed")
    void pendingPaidAndWriteOff() {
        var pending = ledger.record(trainer, pack, body("amount", "3000", "method", "upi", "status", "pending"));
        UUID yid = UUID.fromString(pending.payment().id());
        assertEquals("9000.00", pending.pkg().amountDue(), "expected money is still owed");

        assertEquals("paid", ledger.markPaid(trainer, yid, body()).payment().status());
        assertEquals("paid", ledger.markPaid(trainer, yid, body()).payment().status(), "a retried tap is harmless");
        assertCode("PAYMENT_NOT_PENDING", () -> ledger.markPaid(trainer, yid, body("method", "cash")));

        var one = ledger.record(trainer, pack, body("amount", "500", "method", "cash", "status", "pending", "note", "Week 2"));
        UUID oneId = UUID.fromString(one.payment().id());
        var off = ledger.writeOffPayment(trainer, oneId, body("note", "Agreed to waive"));
        assertEquals("write_off", off.payment().status());
        assertEquals("Week 2 · Agreed to waive", off.payment().note(), "the reason is appended to the note");
        assertEquals("write_off", ledger.writeOffPayment(trainer, oneId, body()).payment().status(), "idempotent");
        assertEquals("5500.00", off.pkg().amountDue());

        ledger.record(trainer, pack, body("amount", "1000", "method", "cash", "status", "pending"));
        var all = ledger.writeOffPackage(trainer, pack, body("note", "Moved away"));
        assertEquals("0.00", all.pkg().amountDue());
        assertEquals("active", all.pkg().status(), "forgiving money is not ending the deal");
        assertEquals(0, count("pending"), "the pending row was written off in place");
        assertCode("PACKAGE_NOTHING_DUE", () -> ledger.writeOffPackage(trainer, pack, body()));
    }

    @Test
    @DisplayName("refund is final: fully paid only, once, and the pack takes no more writes")
    void refundIsFinal() {
        assertCode("PACKAGE_NOT_FULLY_PAID",
                () -> ledger.refund(trainer, pack, body("amount", "100", "method", "upi")));
        var paid = ledger.record(trainer, pack, body("amount", "9000", "method", "upi"));
        assertCode("REFUND_OVER_PAID", () -> ledger.refund(trainer, pack, body("amount", "9000.01", "method", "upi")));

        var refund = ledger.refund(trainer, pack, body("amount", "3750", "method", "upi"));
        assertEquals("refunded", refund.pkg().status());
        assertEquals("0.00", refund.pkg().amountDue());
        assertEquals("3750.00", refund.pkg().amountRefunded());

        assertCode("PACKAGE_ALREADY_REFUNDED", () -> ledger.refund(trainer, pack, body("amount", "1", "method", "upi")));
        assertCode("PAYMENT_FROZEN", () -> ledger.delete(trainer, UUID.fromString(refund.payment().id())));
        // Decided 28 Sep: a paid row on a refunded pack can't move either, or the refund outgrows what was paid.
        assertCode("PACKAGE_CLOSED", () -> ledger.delete(trainer, UUID.fromString(paid.payment().id())));
    }

    @Test
    @DisplayName("correcting and deleting a payment typed wrong")
    void patchAndDelete() {
        var row = ledger.record(trainer, pack, body("amount", "4000", "method", "upi"));
        UUID yid = UUID.fromString(row.payment().id());
        var fixed = ledger.patch(trainer, yid, null, body("amount", "4500", "method", "cash"));
        assertEquals("4500.00", fixed.payment().amount());
        assertEquals("4500.00", fixed.pkg().amountDue());
        assertCode("VALIDATION", () -> ledger.patch(trainer, yid, null, body("status", "pending")));
        assertCode("PAYMENT_OVER_DUE", () -> ledger.patch(trainer, yid, null, body("amount", "9000.01")));
        assertCode("PRECONDITION_FAILED", () -> ledger.patch(trainer, yid, "\"1\"", body("note", "x")));

        ledger.delete(trainer, yid);
        ledger.delete(trainer, yid);   // idempotent
        assertEquals("9000.00", reads.one(trainer, pack).orElseThrow().amountDue(), "deleting gives the due back");
    }

    @Test
    @DisplayName("the pack's life: pause/resume are idempotent by state; cancel only with nothing owed")
    void lifeAndCancel() {
        assertNotNull(ledger.pause(trainer, pack, body("reason", "Travelling")).pausedAt());
        assertNotNull(ledger.pause(trainer, pack, body()).pausedAt(), "pausing a paused pack is a 200");
        assertNull(ledger.resume(trainer, pack, body()).pausedAt());
        assertNotNull(ledger.extend(trainer, pack, body("days", 7)).endDate());
        assertEquals(3, ledger.adjustments(trainer, pack, null).size(), "pause, resume, extend — the repeat wrote nothing");
        assertEquals(1, ledger.adjustments(trainer, pack, "extend").size());

        assertCode("PACKAGE_HAS_DUES", () -> ledger.cancel(trainer, pack, body()));
        ledger.writeOffPackage(trainer, pack, body());
        var cancelled = ledger.cancel(trainer, pack, body());
        assertEquals("cancelled", cancelled.status());
        assertNotNull(cancelled.closedAt());
        assertEquals("cancelled", ledger.cancel(trainer, pack, body()).status(), "idempotent");
        assertCode("PACKAGE_CLOSED", () -> ledger.pause(trainer, pack, body()));
    }

    @Test
    @DisplayName("a deleted note comes back through restore, never by re-posting its id")
    void noteRestore() {
        UUID id = UUID.randomUUID();
        notes.create(trainer, client, new CreateNoteRequest(id, "Left knee — no deep lunges", true, null));
        notes.delete(trainer, client, id);
        assertEquals(0, notes.list(trainer, client).size());
        assertCode("ID_CONFLICT", () -> notes.create(trainer, client, new CreateNoteRequest(id, "again", null, null)));
        assertTrue(notes.restore(trainer, client, id).pinned());
        var unpinned = notes.patch(trainer, client, id, null, new UpdateNoteRequest(null, Patch.of(false), null));
        assertFalse(unpinned.pinned());
        assertEquals("Left knee — no deep lunges", unpinned.body(), "a pin toggle leaves the text alone");
        assertCode("PRECONDITION_FAILED", () -> notes.patch(trainer, client, id, "\"1\"", new UpdateNoteRequest(Patch.of("x"), null, null)));
        assertEquals(1, notes.list(trainer, client).size());
    }

    private int count(String status) {
        return jdbc.queryForObject("SELECT count(*) FROM payment WHERE package_id = :p::uuid AND status = :s AND deleted_at IS NULL",
                Map.of("p", pack.toString(), "s", status), Integer.class);
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static void assertCode(String code, Runnable call) {
        var e = assertThrows(ApiException.class, call::run);
        assertEquals(code, e.getCode(), e.getMessage());
    }
}
