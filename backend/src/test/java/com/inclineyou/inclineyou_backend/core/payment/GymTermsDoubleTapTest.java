package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A double tap of Save on new gym terms (20 Nov 2026), in two real transactions: the first holds its transaction open
 * after inserting, the second (same id) must wait for it and then answer the first's row as a replay — it used to
 * insert too and answer 409 ID_CONFLICT. Not @Transactional, so it commits; it uses its own phone and cleans up.
 */
@SpringBootTest
class GymTermsDoubleTapTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired GymArrangementService arrangements;
    @Autowired TrainerPayoutService payouts;
    @Autowired PlatformTransactionManager txm;

    private UUID trainer, tenant;

    @BeforeEach
    void setUp() {
        String phone = "+919100001077";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        jdbc.update("UPDATE trainer_business SET gym_name = 'Cult', training_modes = '[\"gym_floor\"]' WHERE trainer_id = :t::uuid",
                Map.of("t", trainer.toString()));
        clean();
    }

    @AfterEach
    void tearDown() {
        clean();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("the second tap waits for the first and replays its row; one row is saved")
    void doubleTapReplays() throws Exception {
        UUID id = UUID.randomUUID();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var body = new HashMap<String, Object>(Map.of("id", id.toString(), "baseKind", "minimum", "baseAmount", "15000.00",
                "startsMonth", month));
        var tx = new TransactionTemplate(txm);
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> {
                var made = arrangements.create(trainer, body);
                inserted.countDown();
                await(release);                     // the first tap's transaction is still open
                return made;
            });
        });
        assertTrue(inserted.await(20, TimeUnit.SECONDS));
        var second = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> arrangements.create(trainer, body));
        });
        Thread.sleep(500);
        assertFalse(second.isDone(), "the second tap waits for the first");
        release.countDown();

        assertTrue(first.get(20, TimeUnit.SECONDS).created());
        var replay = second.get(20, TimeUnit.SECONDS);
        assertFalse(replay.created(), "a replay, not an error");
        assertEquals(id.toString(), replay.arrangement().id());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM gym_arrangement WHERE trainer_id = :t::uuid",
                Map.of("t", trainer.toString()), Integer.class));
    }

    @Test
    @DisplayName("two tabs save edits to the same terms at once: the second waits, sees the new version, and is a 412")
    void twoTabsCannotOverwrite() throws Exception {
        scope();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var made = new TransactionTemplate(txm).execute(st -> arrangements.create(trainer,
                new HashMap<>(Map.of("baseKind", "minimum", "baseAmount", "15000.00", "startsMonth", month)))).arrangement();
        UUID id = UUID.fromString(made.id());
        String opened = "\"" + made.version() + "\"";
        var tx = new TransactionTemplate(txm);
        var saved = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var tabA = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> {
                var a = arrangements.patch(trainer, id, opened, new HashMap<>(Map.of("baseAmount", "16000.00")));
                saved.countDown();
                await(release);
                return a;
            });
        });
        assertTrue(saved.await(20, TimeUnit.SECONDS));
        var tabB = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> arrangements.patch(trainer, id, opened, new HashMap<>(Map.of("note", "from tab B"))));
        });
        Thread.sleep(500);
        assertFalse(tabB.isDone(), "tab B waits for tab A's lock");
        release.countDown();
        assertEquals("16000.00", tabA.get(20, TimeUnit.SECONDS).baseAmount());

        var refused = org.junit.jupiter.api.Assertions.assertThrows(java.util.concurrent.ExecutionException.class,
                () -> tabB.get(20, TimeUnit.SECONDS));
        assertEquals("PRECONDITION_FAILED",
                ((com.inclineyou.inclineyou_backend.shared.exception.ApiException) refused.getCause()).getCode());
        assertEquals("16000.00", jdbc.queryForObject("SELECT base_amount::text FROM gym_arrangement WHERE id = :id::uuid",
                Map.of("id", id.toString()), String.class));
    }

    @Test
    @DisplayName("a save with nothing changed writes nothing: the version holds, so the other tab's next save is not a 412")
    void noChangeKeepsTheVersion() throws Exception {
        scope();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var tx = new TransactionTemplate(txm);
        var made = tx.execute(st -> arrangements.create(trainer,
                new HashMap<>(Map.of("baseKind", "minimum", "baseAmount", "15000.00", "startsMonth", month, "note", "n")))).arrangement();
        UUID id = UUID.fromString(made.id());
        Thread.sleep(20);   // a later transaction, so a write would stamp a later updated_at
        var same = tx.execute(st -> arrangements.patch(trainer, id, "\"" + made.version() + "\"",
                new HashMap<>(Map.of("baseKind", "minimum", "baseAmount", "15000", "note", "n"))));
        assertEquals(made.version(), same.version());
        var other = tx.execute(st -> arrangements.patch(trainer, id, "\"" + made.version() + "\"",
                new HashMap<>(Map.of("note", "the other tab"))));
        assertEquals("the other tab", other.note());
    }

    @Test
    @DisplayName("a double tap of a payout: the second waits for the first and replays it; one payout is saved")
    void payoutDoubleTapReplays() throws Exception {
        scope();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var tx = new TransactionTemplate(txm);
        tx.execute(st -> arrangements.create(trainer, new HashMap<>(Map.of("startsMonth", month))));
        UUID id = UUID.randomUUID();
        var body = new HashMap<String, Object>(Map.of("id", id.toString(), "amount", "15000.00", "method", "bank_transfer"));
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> {
                var made = payouts.create(trainer, body);
                inserted.countDown();
                await(release);
                return made;
            });
        });
        assertTrue(inserted.await(20, TimeUnit.SECONDS));
        var second = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> payouts.create(trainer, body));
        });
        Thread.sleep(500);
        assertFalse(second.isDone(), "the second tap's insert waits for the first");
        release.countDown();

        assertTrue(first.get(20, TimeUnit.SECONDS).created());
        var replay = second.get(20, TimeUnit.SECONDS);
        assertFalse(replay.created(), "a replay, not a 409");
        assertEquals(id.toString(), replay.payout().id());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM trainer_payout WHERE trainer_id = :t::uuid",
                Map.of("t", trainer.toString()), Integer.class));
    }

    @Test
    @DisplayName("two tabs correct the same payout at once: the second waits for the first's lock and is a 412")
    void payoutTwoTabsCannotOverwrite() throws Exception {
        scope();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var tx = new TransactionTemplate(txm);
        tx.execute(st -> arrangements.create(trainer, new HashMap<>(Map.of("startsMonth", month))));
        var made = tx.execute(st -> payouts.create(trainer, new HashMap<>(Map.of("amount", "15000.00", "method", "cash")))).payout();
        UUID id = UUID.fromString(made.id());
        String opened = "\"" + made.version() + "\"";
        var saved = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var tabA = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> {
                var a = payouts.patch(trainer, id, opened, new HashMap<>(Map.of("amount", "14000.00")));
                saved.countDown();
                await(release);
                return a;
            });
        });
        assertTrue(saved.await(20, TimeUnit.SECONDS));
        var tabB = CompletableFuture.supplyAsync(() -> {
            scope();
            return tx.execute(st -> payouts.patch(trainer, id, opened, new HashMap<>(Map.of("reference", "NEFT-B"))));
        });
        Thread.sleep(500);
        assertFalse(tabB.isDone(), "tab B waits for tab A's lock");
        release.countDown();
        assertEquals("14000.00", tabA.get(20, TimeUnit.SECONDS).amount());
        var refused = org.junit.jupiter.api.Assertions.assertThrows(java.util.concurrent.ExecutionException.class,
                () -> tabB.get(20, TimeUnit.SECONDS));
        assertEquals("PRECONDITION_FAILED",
                ((com.inclineyou.inclineyou_backend.shared.exception.ApiException) refused.getCause()).getCode());
    }

    @Test
    @DisplayName("a payout correction with nothing changed writes nothing: the version holds")
    void payoutNoChangeKeepsTheVersion() throws Exception {
        scope();
        String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
        var tx = new TransactionTemplate(txm);
        tx.execute(st -> arrangements.create(trainer, new HashMap<>(Map.of("startsMonth", month))));
        var made = tx.execute(st -> payouts.create(trainer, new HashMap<>(Map.of("amount", "15000.00", "method", "cash",
                "note", "n")))).payout();
        UUID id = UUID.fromString(made.id());
        Thread.sleep(20);
        var same = tx.execute(st -> payouts.patch(trainer, id, "\"" + made.version() + "\"", new HashMap<>(Map.of(
                "amount", "15000", "method", "cash", "note", "n", "receivedAt", made.receivedAt()))));
        assertEquals(made.version(), same.version());
        var other = tx.execute(st -> payouts.patch(trainer, id, "\"" + made.version() + "\"",
                new HashMap<>(Map.of("note", "the other tab"))));
        assertEquals("the other tab", other.note());
    }

    private void scope() {
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
    }

    private void clean() {
        jdbc.update("DELETE FROM trainer_payout WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        jdbc.update("DELETE FROM gym_arrangement WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("never released");
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }
}
