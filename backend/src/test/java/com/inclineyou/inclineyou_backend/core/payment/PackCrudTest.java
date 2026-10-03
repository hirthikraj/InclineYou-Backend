package com.inclineyou.inclineyou_backend.core.payment;

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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** api-contract 1.1 Business — the price list's writes: POST · PATCH · DELETE /v1/packs. */
@SpringBootTest
@Transactional
class PackCrudTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackService packs;

    private UUID trainer;

    @BeforeEach
    void setUp() {
        String phone = "+919100000093";
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
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("create, replay, someone else's id, and a name already on the list")
    void create() {
        UUID id = UUID.randomUUID();
        var made = packs.create(trainer, body("id", id.toString(), "name", "12 sessions · floor", "service", "floor",
                "sessions", 12, "amount", "9000.00", "validityDays", 60));
        assertTrue(made.created());
        assertEquals("sessions", made.row().basis(), "basis defaults to sessions");
        assertEquals("trainer", made.row().owner());
        assertEquals("9000.00", made.row().amount());
        assertNull(made.row().gymShareAmount(), "a trainer's own pack has no gym share");

        var again = packs.create(trainer, body("id", id.toString(), "name", "ignored", "service", "floor",
                "sessions", 12, "amount", "1"));
        assertFalse(again.created(), "a replayed id answers the original");
        assertEquals("12 sessions · floor", again.row().name());

        assertCode("PACK_NAME_TAKEN", () -> packs.create(trainer, body("name", "12 SESSIONS · FLOOR", "service", "remote",
                "sessions", 5, "amount", 100)));

        UUID other = otherTrainersPack();
        assertCode("ID_CONFLICT", () -> packs.create(trainer, body("id", other.toString(), "name", "x", "service", "floor",
                "sessions", 1, "amount", 1)));
    }

    @Test
    @DisplayName("the check constraints, as sentences")
    void validation() {
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "a", "service", "floor", "amount", 100)));          // no sessions
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "b", "service", "floor", "sessions", 501, "amount", 100)));
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "c", "service", "floor", "basis", "period", "amount", 100))); // no validity
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "d", "service", "programming", "sessions", 4, "amount", 100)));
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "e", "service", "floor", "sessions", 4, "amount", 100,
                "trainerSharePercent", 60)));                                                                                  // share on a non-gym pack
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "f", "service", "floor", "sessions", 4, "amount", -1)));
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "g", "service", "floor", "sessions", 4, "amount", 100,
                "colour", "red")));
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "h", "service", "floor", "sessions", "4", "amount", 100)));
        var period = packs.create(trainer, body("name", "Monthly programming", "service", "programming", "basis", "period",
                "validityDays", 30, "amount", 3000)).row();
        assertNull(period.sessions());
    }

    @Test
    @DisplayName("a gym pack: needs a gym, one share, floor only — and the gym's part is derived")
    void gymPack() {
        assertCode("GYM_PACK_NEEDS_GYM", () -> packs.create(trainer, body("name", "Gym 12", "service", "floor", "sessions", 12,
                "amount", 10000, "owner", "gym", "trainerSharePercent", 60)));
        jdbc.update("UPDATE trainer_business SET gym_name = 'Cult', training_modes = '[\"gym_floor\"]' WHERE trainer_id = :t::uuid",
                Map.of("t", trainer.toString()));

        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "G1", "service", "floor", "sessions", 12,
                "amount", 10000, "owner", "gym")));                                                       // no share
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "G2", "service", "floor", "sessions", 12,
                "amount", 10000, "owner", "gym", "trainerSharePercent", 60, "trainerShareAmount", 6000)));  // two shares
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "G3", "service", "remote", "sessions", 12,
                "amount", 10000, "owner", "gym", "trainerSharePercent", 60)));
        assertCode("VALIDATION", () -> packs.create(trainer, body("name", "G4", "service", "floor", "sessions", 12,
                "amount", 10000, "owner", "gym", "trainerShareAmount", 10000.01)));

        var pct = packs.create(trainer, body("name", "Gym 12", "service", "floor", "sessions", 12, "amount", 10000,
                "owner", "gym", "trainerSharePercent", 60)).row();
        assertEquals(0, pct.gymSharePercent().compareTo(new java.math.BigDecimal("40")));
        assertEquals("4000.00", pct.gymShareAmount());

        var flat = packs.create(trainer, body("name", "Gym 24", "service", "floor", "sessions", 24, "amount", 18000,
                "owner", "gym", "trainerShareAmount", "12000.00")).row();
        assertEquals("6000.00", flat.gymShareAmount());
        assertEquals(0, flat.gymSharePercent().compareTo(new java.math.BigDecimal("33.33")));

        assertCode("PACK_OWNER_IMMUTABLE", () -> packs.patch(trainer, UUID.fromString(flat.id()), null, body("owner", "trainer")));
        // A price change that would push the flat share above the price is refused.
        assertCode("VALIDATION", () -> packs.patch(trainer, UUID.fromString(flat.id()), null, body("amount", 11000)));
    }

    @Test
    @DisplayName("patch: partial, archive and restore idempotent, stale If-Match, a name taken")
    void patch() {
        var a = packs.create(trainer, body("name", "A", "service", "floor", "sessions", 12, "amount", 9000)).row();
        var b = packs.create(trainer, body("name", "B", "service", "floor", "sessions", 6, "amount", 5000)).row();
        UUID aid = UUID.fromString(a.id());

        var up = packs.patch(trainer, aid, null, body("amount", "9500.00"));
        assertEquals("9500.00", up.amount());
        assertEquals(12, up.sessions(), "untouched");

        var arch = packs.patch(trainer, aid, null, body("status", "inactive"));
        assertEquals("inactive", arch.status());
        var again = packs.patch(trainer, aid, null, body("status", "inactive"));
        assertEquals(arch.version(), again.version(), "nothing changed, nothing written");
        assertEquals("active", packs.patch(trainer, aid, null, body("status", "active")).status());

        assertEquals(0, packs.patch(trainer, aid, null, body("orderIndex", 0)).orderIndex());
        // Sessions to a period: the count has to go with it.
        assertCode("VALIDATION", () -> packs.patch(trainer, aid, null, body("basis", "period", "validityDays", 30)));
        var period = packs.patch(trainer, aid, null, body("basis", "period", "sessions", null, "validityDays", 30));
        assertNull(period.sessions());

        assertCode("VALIDATION", () -> packs.patch(trainer, aid, null, body()));
        assertCode("PACK_NAME_TAKEN", () -> packs.patch(trainer, aid, null, body("name", "b")));
        assertCode("PRECONDITION_FAILED", () -> packs.patch(trainer, aid, "\"1\"", body("note", "x".repeat(1)).isEmpty()
                ? body() : body("name", "A2")));
        assertCode("PACK_NOT_FOUND", () -> packs.patch(trainer, UUID.randomUUID(), null, body("status", "inactive")));
        assertEquals(b.id(), packs.one(trainer, UUID.fromString(b.id())).orElseThrow().id());
    }

    @Test
    @DisplayName("delete: soft, idempotent, refused once anything was sold from it")
    void delete() {
        var unsold = packs.create(trainer, body("name", "Never sold", "service", "floor", "sessions", 3, "amount", 100)).row();
        UUID uid = UUID.fromString(unsold.id());
        packs.delete(trainer, uid);
        packs.delete(trainer, uid);                                   // 204 again
        assertTrue(packs.one(trainer, uid).isEmpty());
        assertTrue(packs.list(trainer, "all", null, null).stream().noneMatch(r -> r.id().equals(unsold.id())));
        // The name is free again for a new pack.
        packs.create(trainer, body("name", "Never sold", "service", "floor", "sessions", 3, "amount", 100));

        var sold = packs.create(trainer, body("name", "Sold", "service", "floor", "sessions", 12, "amount", 9000)).row();
        UUID client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :t::uuid, 'Meera', 'independent')",
                Map.of("id", client.toString(), "t", trainer.toString()));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :p::uuid, 'Sold', 'floor', 'sessions', 12, 12,
                        9000, 'INR', current_date, current_date + 60, current_date)
                """, Map.of("t", trainer.toString(), "c", client.toString(), "p", sold.id()));
        assertCode("PACK_SOLD", () -> packs.delete(trainer, UUID.fromString(sold.id())));
        assertEquals(1, packs.list(trainer, "all", null, "usage").stream()
                .filter(r -> r.id().equals(sold.id())).findFirst().orElseThrow().soldCount());

        assertCode("PACK_NOT_FOUND", () -> packs.delete(trainer, otherTrainersPack()));
    }

    private UUID otherTrainersPack() {
        String phone = "+919100000094";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'O' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        String other = jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency, tenant_id)
                SELECT :id::uuid, :t::uuid, 'Theirs', 'floor', 'sessions', 5, 100, 'INR', home_tenant_id
                FROM trainer WHERE id = :t::uuid
                """, Map.of("id", id.toString(), "t", other));
        return id;
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static void assertCode(String code, Runnable call) {
        var t = assertThrows(RuntimeException.class, call::run);
        String actual = t instanceof ApiException a ? a.getCode()
                : t instanceof PackRuleException p ? p.getCode() : t.getClass().getSimpleName();
        assertEquals(code, actual, t.getMessage());
    }
}
