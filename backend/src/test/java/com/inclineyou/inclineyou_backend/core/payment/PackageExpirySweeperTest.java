package com.inclineyou.inclineyou_backend.core.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** V29 · close_lapsed_packages(): what the hourly sweep closes, and the four kinds of pack it must leave alone. */
@SpringBootTest
@Transactional
class PackageExpirySweeperTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackageExpirySweeper sweeper;

    private UUID trainer;
    private UUID client;

    @BeforeEach
    void setUp() {
        String phone = "+919100000293";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, 'Suresh', 'independent')",
                Map.of("id", client.toString(), "tid", trainer.toString()));
    }

    /** A 12-session pack ending {@code endOffset} days from today; {@code paused} stops its clock. */
    private UUID pack(int endOffset, boolean paused) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date, paused_at)
                VALUES (:pk::uuid, :tid::uuid, :cid::uuid, '12 sessions', 'floor', 'sessions', 12, 5,
                        9000, 'INR', current_date - 60, current_date + :off, current_date - 60,
                        CASE WHEN :paused THEN now() END)""",
                Map.of("pk", id.toString(), "tid", trainer.toString(), "cid", client.toString(),
                        "off", endOffset, "paused", paused));
        return id;
    }

    private String status(UUID pack) {
        return jdbc.queryForObject("SELECT status FROM package WHERE id = :id::uuid", Map.of("id", pack.toString()),
                String.class);
    }

    @Test
    @DisplayName("closes a pack more than a week past its end, and only that one")
    void closesOnlyTheLapsed() {
        UUID lapsed = pack(-13, false);          // Suresh's: ended 24 Oct, read on 6 Nov
        UUID inGrace = pack(-3, false);          // ended this week: its sessions can still be marked
        UUID running = pack(20, false);
        UUID paused = pack(-30, true);           // a paused pack's date is frozen, not lapsed

        int closed = sweeper.closeLapsed();

        assertTrue(closed >= 1, "at least this test's lapsed pack");
        assertEquals("expired", status(lapsed));
        assertNotNull(jdbc.queryForObject("SELECT closed_at FROM package WHERE id = :id::uuid",
                Map.of("id", lapsed.toString()), Object.class), "package_closed pairs status with closed_at");
        assertEquals("active", status(inGrace), "inside the grace week");
        assertEquals("active", status(running));
        assertEquals("active", status(paused), "a paused pack is never closed");
    }

    @Test
    @DisplayName("is idempotent, and leaves the money owed on a closed pack")
    void idempotentAndOwedStaysOwed() {
        UUID lapsed = pack(-13, false);
        sweeper.closeLapsed();
        sweeper.closeLapsed();
        assertEquals("expired", status(lapsed));
        String due = jdbc.queryForObject("""
                SELECT (k.amount - coalesce((SELECT sum(amount) FROM payment p WHERE p.package_id = k.id
                         AND p.status IN ('paid', 'write_off') AND p.deleted_at IS NULL), 0))::text
                FROM package k WHERE k.id = :id::uuid""", Map.of("id", lapsed.toString()), String.class);
        assertEquals("9000.00", due, "closing a pack does not touch what is owed on it");
    }
}
