package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalSettings;
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
 * A double tap of Turn on notifications (21 Nov 2026), in two real transactions: the first holds its transaction open after saving the
 * subscription, the second (same browser, same id) waits and answers the first one's id with 200 — it used to meet the endpoint's unique
 * index as a 500. Not @Transactional, so it commits; it uses its own number and endpoint and cleans up.
 */
@SpringBootTest
class PushSubscribeDoubleTapTest {

    private static final String PHONE = "+919841029088";
    private static final String ENDPOINT = "https://push.example.test/double-tap-" + PHONE;

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PortalSettingsService settings;
    @Autowired PlatformTransactionManager txm;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'client') ON CONFLICT (phone) DO NOTHING", Map.of("p", PHONE));
        clean();
    }

    @AfterEach
    void tearDown() {
        clean();
    }

    @Test
    @DisplayName("the second subscribe for one browser waits for the first and answers its id with 200; one subscription")
    void doubleTapAnswersTheFirst() throws Exception {
        UUID id = UUID.randomUUID();
        var req = new PortalSettings.Subscribe(id.toString(), ENDPOINT, new PortalSettings.Keys("p256dh-key", "auth-key"), "test");
        var tx = new TransactionTemplate(txm);
        var saved = new CountDownLatch(1);
        var release = new CountDownLatch(1);

        var first = CompletableFuture.supplyAsync(() -> tx.execute(st -> {
            var made = settings.subscribe(PHONE, req);
            saved.countDown();
            await(release);
            return made;
        }));
        assertTrue(saved.await(20, TimeUnit.SECONDS));
        var second = CompletableFuture.supplyAsync(() -> tx.execute(st -> settings.subscribe(PHONE, req)));
        Thread.sleep(500);
        assertFalse(second.isDone(), "the second waits for the first");
        release.countDown();

        assertTrue(first.get(20, TimeUnit.SECONDS).created());
        var again = second.get(20, TimeUnit.SECONDS);
        assertFalse(again.created(), "200, not a 500");
        assertEquals(id, again.id());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM push_subscription WHERE endpoint = :e", Map.of("e", ENDPOINT), Integer.class));
    }

    private void clean() {
        jdbc.update("DELETE FROM push_subscription WHERE endpoint = :e", Map.of("e", ENDPOINT));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("never released");
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }
}
