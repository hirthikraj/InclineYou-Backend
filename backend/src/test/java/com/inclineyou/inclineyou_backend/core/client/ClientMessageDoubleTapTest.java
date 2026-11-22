package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateMessageRequest;
import org.junit.jupiter.api.AfterEach;
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
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A double tap of Send on a message to a client (20 Nov 2026), in two real transactions: the first holds its transaction
 * open after inserting, the second (same id) waits and answers the first's line as a replay — it used to be 409
 * ID_CONFLICT. Not @Transactional, so it commits; it uses its own phones and cleans up its messages.
 */
@SpringBootTest
class ClientMessageDoubleTapTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ClientMessageService messages;
    @Autowired PlatformTransactionManager txm;

    private UUID trainer, client;

    @BeforeEach
    void setUp() {
        String phone = "+919100001087";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        var found = jdbc.queryForList("SELECT id::text FROM client WHERE trainer_id = :t::uuid AND name = 'Tapped'",
                Map.of("t", trainer.toString()), String.class);
        if (found.isEmpty()) {
            client = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, client_type, status, phone, membership_status, invited_at, accepted_at)
                    VALUES (:c::uuid, :t::uuid, 'Tapped', 'independent', 'active', '+919841029087', 'accepted', now(), now())""",
                    Map.of("c", client.toString(), "t", trainer.toString()));
        } else {
            client = UUID.fromString(found.get(0));
        }
        clean();
    }

    @AfterEach
    void tearDown() {
        clean();
    }

    @Test
    @DisplayName("the second tap waits for the first and replays its line; one message, one notice")
    void doubleTapReplays() throws Exception {
        UUID id = UUID.randomUUID();
        var req = new CreateMessageRequest(id, "Great session today, see you Thursday!", null, null);
        var tx = new TransactionTemplate(txm);
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.supplyAsync(() -> tx.execute(st -> {
            var made = messages.create(trainer, client, req);
            inserted.countDown();
            await(release);
            return made;
        }));
        assertTrue(inserted.await(20, TimeUnit.SECONDS));
        var second = CompletableFuture.supplyAsync(() -> tx.execute(st -> messages.create(trainer, client, req)));
        Thread.sleep(500);
        assertFalse(second.isDone(), "the second tap waits for the first");
        release.countDown();

        assertTrue(first.get(20, TimeUnit.SECONDS).created());
        var replay = second.get(20, TimeUnit.SECONDS);
        assertFalse(replay.created(), "a replay, not a 409");
        assertEquals(id.toString(), replay.message().id());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client_message WHERE client_id = :c::uuid",
                Map.of("c", client.toString()), Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid",
                Map.of("c", client.toString()), Integer.class), "the client is told once");
    }

    private void clean() {
        jdbc.update("DELETE FROM client_notification WHERE client_id = :c::uuid", Map.of("c", client.toString()));
        jdbc.update("DELETE FROM client_message WHERE client_id = :c::uuid", Map.of("c", client.toString()));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("never released");
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }
}
