package com.inclineyou.inclineyou_backend.core.trainer;

import tools.jackson.databind.ObjectMapper;
import com.inclineyou.inclineyou_backend.core.trainer.dto.UpdateTrainerRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The profile PATCH saves the whole trainer row (20 Nov 2026). In two real transactions: setup is being finished when a
 * PATCH arrives. Unlocked, the PATCH read the row as it was and, once setup committed, wrote setup_completed_at = null
 * back over the stamp; locked, the PATCH waits, reads the stamp, and both survive. Not @Transactional, so it commits; it uses its own phone.
 */
@SpringBootTest
class TrainerRowLockTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired TrainerService trainers;
    @Autowired WorkingHoursService hours;
    @Autowired PlatformTransactionManager txm;
    @Autowired ObjectMapper json;
    @Autowired com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties props;

    private UUID trainer;

    @BeforeEach
    void setUp() {
        String phone = "+919100001078";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        jdbc.update("UPDATE trainer SET setup_completed_at = NULL, deleted_at = NULL, name = 'T' WHERE id = :t::uuid",
                Map.of("t", trainer.toString()));
        jdbc.update("DELETE FROM working_hours WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        jdbc.update("""
                UPDATE app_user SET phone = '+919100001078', privacy_policy_version = NULL, privacy_accepted_at = NULL
                WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)""", Map.of("t", trainer.toString()));
    }

    /** The phone change below commits; the number goes back so the next run finds this trainer by it again. */
    @org.junit.jupiter.api.AfterEach
    void restorePhone() {
        jdbc.update("UPDATE app_user SET phone = '+919100001078' WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)",
                Map.of("t", trainer.toString()));
    }

    @Test
    @DisplayName("a profile save while finishing setup is in flight: the save waits, and cannot write the old setup back")
    void patchCannotUndoSetup() throws Exception {
        var tx = new TransactionTemplate(txm);
        var stamped = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        UpdateTrainerRequest req = json.readValue("{\"name\":\"Renamed\"}", UpdateTrainerRequest.class);

        // Finishing setup has written its stamp and not yet committed.
        var setup = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> {
            trainers.completeSetup(trainer);
            stamped.countDown();
            await(release);
        }));
        assertTrue(stamped.await(20, TimeUnit.SECONDS));
        // Unlocked, the PATCH read the row as it was (setup null) and, once setup committed, saved the whole row back.
        var patch = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> trainers.update(trainer, req, null)));
        Thread.sleep(500);
        assertFalse(patch.isDone(), "the profile save waits for the lock");
        release.countDown();
        setup.get(20, TimeUnit.SECONDS);
        patch.get(20, TimeUnit.SECONDS);

        var row = jdbc.queryForMap("SELECT name, setup_completed_at FROM trainer WHERE id = :t::uuid", Map.of("t", trainer.toString()));
        assertEquals("Renamed", row.get("name"));
        assertNotNull(row.get("setup_completed_at"), "the stamp survives the profile save");
    }

    @Test
    @DisplayName("accepting the notice while a phone change is in flight: it waits, and cannot write the old number back")
    void consentCannotUndoAPhoneChange() throws Exception {
        var tx = new TransactionTemplate(txm);
        var changed = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        // A phone change has written the new number and not yet committed.
        var phone = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> {
            jdbc.update("UPDATE app_user SET phone = '+919100001081' WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)",
                    Map.of("t", trainer.toString()));
            changed.countDown();
            await(release);
        }));
        assertTrue(changed.await(20, TimeUnit.SECONDS));
        String version = props.getPrivacy().getPolicyVersion();
        var consent = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> trainers.acceptPrivacy(trainer, version)));
        Thread.sleep(500);
        assertFalse(consent.isDone(), "the consent waits for the lock");
        release.countDown();
        phone.get(20, TimeUnit.SECONDS);
        consent.get(20, TimeUnit.SECONDS);

        var row = jdbc.queryForMap("""
                SELECT phone, privacy_policy_version FROM app_user WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)""",
                Map.of("t", trainer.toString()));
        assertEquals("+919100001081", row.get("phone"), "the new number survives the consent");
        assertEquals(version, row.get("privacy_policy_version"));
    }

    @Test
    @DisplayName("two saves of Monday at once: the second waits, and Monday ends with one set of hours, not both")
    void twoWeekSavesDoNotPileUp() throws Exception {
        var tx = new TransactionTemplate(txm);
        var saved = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var first = new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch(List.of(
                new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch.Day(1, List.of(
                        new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch.Window("06:00", "11:00")))));
        var second = new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch(List.of(
                new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch.Day(1, List.of(
                        new com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch.Window("07:00", "12:00")))));

        var tabA = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> {
            hours.replace(trainer, first);
            saved.countDown();
            await(release);
        }));
        assertTrue(saved.await(20, TimeUnit.SECONDS));
        var tabB = CompletableFuture.runAsync(() -> tx.executeWithoutResult(st -> hours.replace(trainer, second)));
        Thread.sleep(500);
        assertFalse(tabB.isDone(), "the second save waits for the first");
        release.countDown();
        tabA.get(20, TimeUnit.SECONDS);
        tabB.get(20, TimeUnit.SECONDS);

        var live = jdbc.queryForList("""
                SELECT to_char(start_time, 'HH24:MI') AS s FROM working_hours
                WHERE trainer_id = :t::uuid AND weekday = 1 AND deleted_at IS NULL""", Map.of("t", trainer.toString()), String.class);
        assertEquals(List.of("07:00"), live, "the later save, alone");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("never released");
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }
}
