package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Two tabs reword one message from the same version at once (20 Nov 2026), in real transactions: the second waits for
 * the first and is a 412 instead of silently overwriting it. Not @Transactional, so it commits; it uses its own phone.
 */
@SpringBootTest
class NudgeTemplateRaceTest {

    private static final String NAME = "payment_reminder";

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired NudgeTemplateService templates;
    @Autowired PlatformTransactionManager txm;

    private UUID trainer;

    @BeforeEach
    void setUp() {
        String phone = "+919100001086";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        jdbc.update("DELETE FROM nudge_template WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
    }

    @Test
    @DisplayName("two saves from the same version: the second waits and is a 412; the first's wording stays")
    void secondSaveIsRefused() throws Exception {
        var tx = new TransactionTemplate(txm);
        String opened = "\"" + tx.execute(st -> templates.save(trainer, NAME, "Hi {name}, a gentle reminder.", "*")).version() + "\"";
        Thread.sleep(20);   // later transactions, so a save stamps a later version
        var saved = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var tabA = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> {
            templates.save(trainer, NAME, "Hi {name}, from tab A.", opened);
            saved.countDown();
            await(release);
        }));
        assertTrue(saved.await(20, TimeUnit.SECONDS));
        var tabB = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st ->
                templates.save(trainer, NAME, "Hi {name}, from tab B.", opened)));
        Thread.sleep(500);
        assertFalse(tabB.isDone(), "tab B waits for tab A");
        release.countDown();
        tabA.get(20, TimeUnit.SECONDS);

        var refused = assertThrows(ExecutionException.class, () -> tabB.get(20, TimeUnit.SECONDS));
        assertEquals("PRECONDITION_FAILED", ((ApiException) refused.getCause()).getCode());
        assertEquals("Hi {name}, from tab A.", jdbc.queryForObject(
                "SELECT body FROM nudge_template WHERE trainer_id = :t::uuid AND template = :n",
                Map.of("t", trainer.toString(), "n", NAME), String.class));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("never released");
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }
}
