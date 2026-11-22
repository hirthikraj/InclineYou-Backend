package com.inclineyou.inclineyou_backend.core.tenant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A credential minted before a number change still carries the old number (20 Nov 2026). Once somebody signs up on it,
 * the phone alone found the NEWCOMER's memberships and that session's workspace became theirs. A trainer's credential
 * now matches only the trainer's own account: the stale number matches nothing and the scope falls back to the
 * trainer's own home.
 */
@SpringBootTest
@Transactional
class StalePhoneScopeTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired TenantScope scopes;

    @Test
    @DisplayName("the old number, now a newcomer's: the trainer's session stays in the trainer's own workspace")
    void staleNumberStaysHome() {
        UUID me = trainer("+919100001083");
        UUID myHome = home(me);
        // I move to a new number; my old one is free, and a newcomer signs up on it.
        jdbc.update("UPDATE app_user SET phone = '+919100001084' WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)",
                Map.of("t", me.toString()));
        UUID newcomer = trainer("+919100001083");
        UUID theirHome = home(newcomer);

        // My phone app's token still says the old number.
        var scope = scopes.resolve("+919100001083", me, null, false);
        assertEquals(myHome, scope.activeTenantId(), "my own workspace, not the newcomer's");
        assertTrue(scope.memberships().stream().noneMatch(m -> m.tenantId().equals(theirHome)));

        // The newcomer's own credential on that number still finds their workspace.
        assertEquals(theirHome, scopes.resolve("+919100001083", newcomer, null, false).activeTenantId());
    }

    @Test
    @DisplayName("a closed trainer's credential finds no workspace, so a phone app's JWT reads nothing after the close")
    void closedTrainerHasNoWorkspace() {
        UUID me = trainer("+919100001085");
        jdbc.update("UPDATE trainer SET deleted_at = now() WHERE id = :t::uuid", Map.of("t", me.toString()));
        jdbc.update("UPDATE app_user SET deleted_at = now() WHERE id = (SELECT app_user_id FROM trainer WHERE id = :t::uuid)",
                Map.of("t", me.toString()));
        var scope = scopes.resolve("+919100001085", me, null, false);
        org.junit.jupiter.api.Assertions.assertNull(scope.activeTenantId(), "no books for a closed account");
        assertTrue(scope.memberships().isEmpty());
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer')", Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p""", Map.of("p", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    private UUID home(UUID trainer) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid",
                Map.of("t", trainer.toString()), String.class));
    }
}
