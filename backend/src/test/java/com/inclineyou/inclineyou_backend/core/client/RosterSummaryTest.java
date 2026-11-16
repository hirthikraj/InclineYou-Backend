package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Today L3 ({@code GET /v1/clients?view=summary}): the two stats the R107 test does not cover —
 * {@code missedStreak} and {@code nextSessionAt} — and the {@code status} filter's three answers (the default,
 * {@code all}, a named one) plus its fallback for names it does not know.
 */
@SpringBootTest
@Transactional
class RosterSummaryTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant;
    private Instant now;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001071', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001071'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("missedStreak counts the no-shows since the newest done session; cancelled sessions say nothing either way")
    void missedStreak() throws Exception {
        UUID c = client("Asha", "active");
        session(c, days(-6), "no_show");     // before the last done: not part of the streak
        session(c, days(-5), "done");
        session(c, days(-4), "no_show");
        session(c, days(-3), "cancelled");   // not settled: neither breaks nor extends it
        session(c, days(-2), "no_show");

        mvc.perform(get("/v1/clients").param("view", "summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].stats.missedStreak").value(2))
                .andExpect(jsonPath("$.items[0].stats.sessionsDone").value(1));

        // A delivered session after them ends the streak.
        session(c, days(-1), "done");
        mvc.perform(get("/v1/clients"))
                .andExpect(jsonPath("$.items[0].stats.missedStreak").value(0))
                .andExpect(jsonPath("$.items[0].stats.sessionsDone").value(2));
    }

    @Test
    @DisplayName("nextSessionAt is the soonest booked session still to come — not a cancelled one, not one in the past")
    void nextSession() throws Exception {
        UUID c = client("Bala", "active");
        session(c, days(-1), "scheduled");          // past and never marked: not "next"
        session(c, now.plus(6, ChronoUnit.HOURS), "cancelled");
        Instant soonest = days(1);
        session(c, soonest, "scheduled");
        session(c, days(3), "scheduled");

        mvc.perform(get("/v1/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].stats.nextSessionAt").value(soonest.toEpochMilli()));
    }

    @Test
    @DisplayName("status: the default leaves archived out and keeps prospects; all, a named one, and unknown names fall back to the default")
    void statusFilter() throws Exception {
        client("Active", "active");
        client("Lead", "prospect");
        UUID gone = client("Gone", "active");
        jdbc.update("UPDATE client SET status = 'archived', archived_at = now(), archive_reason = 'moved_away' WHERE id = :id::uuid",
                Map.of("id", gone.toString()));

        mvc.perform(get("/v1/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].name", containsInAnyOrder("Active", "Lead")));
        mvc.perform(get("/v1/clients").param("status", "all"))
                .andExpect(jsonPath("$.items[*].name", containsInAnyOrder("Active", "Lead", "Gone")));
        mvc.perform(get("/v1/clients").param("status", "archived"))
                .andExpect(jsonPath("$.items[*].name", containsInAnyOrder("Gone")))
                .andExpect(jsonPath("$.items[0].archiveReason").value("moved_away"))
                .andExpect(jsonPath("$.items[0].archivedAt").isNumber());
        // A typo answers the default roster, never an empty one.
        mvc.perform(get("/v1/clients").param("status", "archivd"))
                .andExpect(jsonPath("$.items[*].name", containsInAnyOrder("Active", "Lead")));
        mvc.perform(get("/v1/clients").param("view", "legacy"))
                .andExpect(status().isBadRequest());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private Instant days(int n) {
        return now.plus(n, ChronoUnit.DAYS);
    }

    private UUID client(String name, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent', :s)",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "n", name, "s", status));
        return id;
    }

    private void session(UUID client, Instant at, String status) {
        var p = new HashMap<String, Object>();
        p.put("t", me.toString()); p.put("c", client.toString());
        p.put("at", Timestamp.from(at)); p.put("end", Timestamp.from(at.plus(1, ChronoUnit.HOURS))); p.put("s", status);
        p.put("why", "cancelled".equals(status) ? "client" : null);   // a cancelled session must say who cancelled it
        jdbc.update("INSERT INTO scheduled_session (trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, cancel_reason) VALUES (:t::uuid, :c::uuid, :at, 60, :end, :s, :why)", p);
    }
}
