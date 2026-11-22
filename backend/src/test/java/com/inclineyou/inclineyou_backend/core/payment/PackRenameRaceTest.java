package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Two renames to one name at the same moment (20 Nov 2026). Without threads: the other rename has committed, but this
 * request's name check is made to answer "free", as it would have before that commit. The unique index then refuses
 * the update, and that is 409 PACK_NAME_TAKEN, not a 500.
 */
@SpringBootTest
@Transactional
class PackRenameRaceTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackService packs;
    @MockitoSpyBean PackJdbcRepository repo;

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
    @DisplayName("the other tab took the name first: the update's unique violation answers PACK_NAME_TAKEN")
    void renameRace() {
        packs.create(trainer, Map.of("name", "Monthly", "service", "floor", "sessions", 8, "amount", 6000));
        UUID mine = UUID.fromString(packs.create(trainer, Map.of("name", "8 sessions", "service", "floor", "sessions", 8,
                "amount", 6000)).row().id());
        Mockito.doReturn(false).when(repo).nameTaken(ArgumentMatchers.eq(trainer), ArgumentMatchers.eq("Monthly"),
                ArgumentMatchers.eq(mine));

        var refused = assertThrows(PackRuleException.class, () -> packs.patch(trainer, mine, null, Map.of("name", "Monthly")));
        assertEquals("PACK_NAME_TAKEN", refused.getCode());
    }
}
