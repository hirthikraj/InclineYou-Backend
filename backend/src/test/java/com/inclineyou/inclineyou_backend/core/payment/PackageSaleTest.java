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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * {@code POST /v1/clients/{id}/packages} — the sale's own rules (18 Nov 2026): the price list's terms win, an archived pack
 * or client is refused, who owns the money follows the client, the share and the discount, and the dates' window.
 * Option B, the start-date window on renew and the prospect Undo are in {@code SessionBillingTest}.
 */
@SpringBootTest
@Transactional
class PackageSaleTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackageSaleService sales;

    private UUID trainer, tenant, client;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        String phone = "+919100000141";
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
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        client = client("independent");
        today = LocalDate.now(ZoneId.of(jdbc.queryForObject("SELECT timezone FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class)));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a price-list pack's terms win over anything sent; an archived pack and another trainer's are refused")
    void thePackWins() {
        UUID pack = pack("trainer", "12 sessions", 12, "9000", 60, null);
        var body = body("packId", pack.toString(), "name", "ignored", "amount", "1");
        var made = sales.sell(trainer, client, body).pkg();
        assertEquals("12 sessions", made.name());
        assertEquals("9000.00", made.amount());
        assertEquals(today.plusDays(60).toString(), made.endDate());

        jdbc.update("UPDATE pack SET status = 'inactive' WHERE id = :id::uuid", Map.of("id", pack.toString()));
        assertEquals("PACK_INACTIVE", code(() -> sales.sell(trainer, client, body("packId", pack.toString()))));
        assertEquals(404, assertThrows(ApiException.class,
                () -> sales.sell(trainer, client, body("packId", UUID.randomUUID().toString()))).getStatus().value());
    }

    @Test
    @DisplayName("the money's owner follows the client: a gym client buys the gym's packs and carries the share; an independent client neither")
    void ownerAndShare() {
        UUID gymPack = pack("gym", "Gym 12", 12, "12000", null, "40");
        assertEquals("PACK_OWNER_MISMATCH", code(() -> sales.sell(trainer, client, body("packId", gymPack.toString()))));
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, custom("trainerSharePercent", "40"))),
                "an independent client's pack has no gym share");

        UUID gymClient = client("gym");
        assertFalse(sales.sell(trainer, gymClient, body("packId", gymPack.toString())).pkg().id().isEmpty());
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, gymClient, custom())), "a gym client's pack carries the share");
        var remote = custom("trainerSharePercent", "40");
        remote.put("service", "remote");
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, gymClient, remote)), "a share is floor only");
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, gymClient,
                custom("trainerSharePercent", "40", "trainerShareAmount", "100"))), "one of percent or amount");
    }

    @Test
    @DisplayName("a discount is at most the price, and the start and due dates are within 3 months of today")
    void discountAndDates() {
        assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, custom("discountAmount", "6001"))));
        assertEquals("5500.00", sales.sell(trainer, client, custom("discountAmount", "500")).pkg().amount(), "the stored amount is net");

        for (String field : List.of("startDate", "dueDate")) {
            assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, custom(field, "2062-01-01"))), field);
            assertEquals("VALIDATION", code(() -> sales.sell(trainer, client, custom(field, today.minusMonths(3).minusDays(1).toString()))), field);
        }
        assertEquals(today.plusMonths(3).toString(),
                sales.sell(trainer, client, custom("dueDate", today.plusMonths(3).toString())).pkg().dueDate(), "the edge is allowed");
    }

    @Test
    @DisplayName("an archived client cannot be sold a pack")
    void archivedClient() {
        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'other' WHERE id = :c::uuid",
                Map.of("c", client.toString()));
        assertEquals("CLIENT_ARCHIVED", code(() -> sales.sell(trainer, client, custom())));
    }

    /* ── fixtures ─────────────────────────────────────────────────────────── */

    private Map<String, Object> custom(Object... extra) {
        var m = body("name", "Custom 10", "service", "floor", "basis", "sessions", "sessionsTotal", 10, "amount", "6000");
        for (int i = 0; i < extra.length; i += 2) m.put((String) extra[i], extra[i + 1]);
        return m;
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private UUID pack(String owner, String name, int sessions, String amount, Integer validity, String sharePercent) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainer.toString()); p.put("o", owner); p.put("n", name);
        p.put("s", sessions); p.put("a", amount); p.put("v", validity); p.put("sh", sharePercent);
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency, validity_days, owner,
                                  trainer_share_percent)
                VALUES (:id::uuid, :t::uuid, :n, 'floor', 'sessions', :s, :a::numeric, 'INR', :v, :o, :sh::numeric)
                """, p);
        return id;
    }

    private UUID client(String type) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status)
                VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Meera', :type, 'active')
                """, Map.of("id", id.toString(), "t", trainer.toString(), "ten", tenant.toString(), "type", type));
        return id;
    }

    private static String code(Runnable call) {
        return assertThrows(ApiException.class, call::run).getCode();
    }
}
