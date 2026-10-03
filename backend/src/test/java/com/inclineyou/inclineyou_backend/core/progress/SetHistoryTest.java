package com.inclineyou.inclineyou_backend.core.progress;

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

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * What {@code GET /v1/clients/{id}/set-history} answers, pinned at the service so the controller → service →
 * repository split cannot move it: ownership, the keyset paging, the window, the one-lift filter and the three
 * 400s.
 */
@SpringBootTest
@Transactional
class SetHistoryTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SetHistoryService service;

    private UUID trainer, other, client, bench, squat;

    @BeforeEach
    void setUp() {
        trainer = trainer("+919100000191", "Coach");
        other = trainer("+919100000192", "Someone Else");
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        // The workspace clock reads the caller's scope; a service call outside a request has to set one.
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type) VALUES (:c::uuid, :t::uuid, :ten::uuid, 'Asha', 'independent')",
                Map.of("c", client.toString(), "t", trainer.toString(), "ten", tenant.toString()));
        bench = exercise("Bench press");
        squat = exercise("Back squat");
        // Three sessions on three days; each has bench with two sets, and the newest also has squat with one.
        UUID s1 = session(30), s2 = session(20), s3 = session(10);
        sets(s1, bench, 0, 2);
        sets(s2, bench, 0, 2);
        sets(s3, bench, 0, 2);
        sets(s3, squat, 1, 1);
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) SELECT gen_random_uuid(), id, :n FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING",
                Map.of("p", phone, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)",
                Map.of("id", id.toString(), "n", name, "src", "test-" + id));
        return id;
    }

    private UUID session(int daysAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, started_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, now() - make_interval(days => :d), 60, now() - make_interval(days => :d), 'done',
                        now() - make_interval(days => :d))
                """, Map.of("id", id.toString(), "t", trainer.toString(), "c", client.toString(), "d", daysAgo));
        return id;
    }

    private void sets(UUID session, UUID exercise, int position, int count) {
        UUID sx = UUID.randomUUID();
        jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:id::uuid, :s::uuid, :c::uuid, :e::uuid, :p)",
                Map.of("id", sx.toString(), "s", session.toString(), "c", client.toString(), "e", exercise.toString(), "p", position));
        for (int i = 1; i <= count; i++) {
            jdbc.update("""
                    INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at)
                    VALUES (:sx::uuid, :p, false, 'weight', 'reps', 50, 10, now())
                    """, Map.of("sx", sx.toString(), "p", i));
        }
    }

    @Test
    @DisplayName("every completed set, oldest first, with each exercise named once")
    void everySet() {
        var h = service.list(trainer, client, null, null, null, null);
        assertEquals(7, h.items().size());
        assertNull(h.nextCursor());
        assertEquals(2, h.exercises().size());
        assertEquals("Bench press", h.exercises().get(bench.toString()).name());
        assertEquals(3, h.sessions().size());
        for (int i = 1; i < h.items().size(); i++) {
            assertTrue(h.items().get(i - 1).doneAt() > 0);
        }
        assertEquals(bench.toString(), h.items().get(0).exerciseId());
        assertEquals(squat.toString(), h.items().get(6).exerciseId());
    }

    @Test
    @DisplayName("a client who is not on this trainer's roster is a 404")
    void ownership() {
        assertEquals(404, assertThrows(ApiException.class, () -> service.list(other, client, null, null, null, null)).getStatus().value());
    }

    @Test
    @DisplayName("paging by cursor visits every set once, in order, and ends with a null cursor")
    void paging() {
        var seen = new java.util.ArrayList<String>();
        String cursor = null;
        int pages = 0;
        do {
            var h = service.list(trainer, client, null, null, 3, cursor);
            h.items().forEach(r -> seen.add(r.setId()));
            cursor = h.nextCursor();
            pages++;
        } while (cursor != null && pages < 10);
        assertEquals(3, pages);                                   // 3 + 3 + 1
        assertEquals(7, seen.size());
        assertEquals(7, new java.util.HashSet<>(seen).size());
        var all = service.list(trainer, client, null, null, null, null).items().stream().map(r -> r.setId()).toList();
        assertEquals(all, seen);
    }

    @Test
    @DisplayName("from is a date in the workspace zone; exerciseId narrows to one lift")
    void windowAndLift() {
        String fifteenDaysAgo = java.time.LocalDate.now().minusDays(15).toString();
        assertEquals(3, service.list(trainer, client, fifteenDaysAgo, null, null, null).items().size());   // only the newest session
        var squats = service.list(trainer, client, null, squat.toString(), null, null);
        assertEquals(1, squats.items().size());
        assertEquals(1, squats.exercises().size());
    }

    @Test
    @DisplayName("a malformed exerciseId, cursor or date is a 400, and a bad cursor is not a 500")
    void badInput() {
        for (var call : java.util.List.<Runnable>of(
                () -> service.list(trainer, client, null, "not-an-id", null, null),
                () -> service.list(trainer, client, null, null, null, "!!!"),
                () -> service.list(trainer, client, "yesterday", null, null, null))) {
            assertEquals(400, assertThrows(ApiException.class, call::run).getStatus().value());
        }
    }
}
