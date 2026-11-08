package com.inclineyou.inclineyou_backend.core.portal;

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

/**
 * V31 · client_pay_to(): the trainer's UPI ID reaches a client only through their own session, and only while they may
 * see money.
 *
 * <p>The suite connects as the schema owner, so row-level policies are inert here; what this pins is the function's OWN
 * guards (actor, the caller's client ids, the money switch), which hold under any role. The session settings are written
 * with {@code set_config(..., true)} — transaction-local, rolled back with the test — exactly the names
 * TenantAwareDataSource writes.
 */
@SpringBootTest
@Transactional
class ClientPayToTest {

    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID trainer;
    private UUID client;

    @BeforeEach
    void setUp() {
        String phone = "+919100000495";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'Anbu' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        jdbc.update("UPDATE trainer SET clients_see_money = true WHERE id = :t::uuid", Map.of("t", trainer.toString()));
        jdbc.update("UPDATE trainer_business SET upi_vpa = 'anbu@okaxis' WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:c::uuid, :t::uuid, 'Meera', 'independent')",
                Map.of("c", client.toString(), "t", trainer.toString()));
    }

    private void as(String actor, String clientIds) {
        jdbc.queryForObject("SELECT set_config('app.actor', :a, true)", Map.of("a", actor), String.class);
        jdbc.queryForObject("SELECT set_config('app.client_ids', :ids, true)", Map.of("ids", clientIds), String.class);
    }

    private String payTo(UUID id) {
        return jdbc.queryForObject("SELECT client_pay_to(:c::uuid)", Map.of("c", id.toString()), String.class);
    }

    @Test
    @DisplayName("the client's own session gets the UPI ID")
    void ownClient() {
        as("client", "{" + client + "}");
        assertEquals("anbu@okaxis", payTo(client));
    }

    @Test
    @DisplayName("nobody else does: another client's id, a staff or system session, the money switch off, no UPI ID set")
    void everyoneElseGetsNull() {
        as("client", "{" + UUID.randomUUID() + "}");
        assertNull(payTo(client), "a client asking about someone else's id");

        as("staff", "");
        assertNull(payTo(client), "a trainer reads their own UPI ID through /v1/trainers/me, not this");
        as("system", "");
        assertNull(payTo(client));

        as("client", "{" + client + "}");
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", client.toString()));
        assertNull(payTo(client), "Payments hidden for this client means no way to pay through it either");

        jdbc.update("UPDATE client SET portal_show_money = NULL WHERE id = :c::uuid", Map.of("c", client.toString()));
        jdbc.update("UPDATE trainer_business SET upi_vpa = '  ' WHERE trainer_id = :t::uuid", Map.of("t", trainer.toString()));
        assertNull(payTo(client), "a blank UPI ID is no UPI ID");
    }
}
