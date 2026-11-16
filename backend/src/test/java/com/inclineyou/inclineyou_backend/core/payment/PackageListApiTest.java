package com.inclineyou.inclineyou_backend.core.payment;

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

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Today L5 ({@code GET /v1/packages}): which packs {@code scope=current} returns (live, still owed,
 * or the client's newest), what {@code amountDue} is, and the refusals.
 */
@SpringBootTest
@Transactional
class PackageListApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001072', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001072'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("scope=current is live packs, packs still owed whatever their status, and each client's newest; amountDue is amount − paid − written off")
    void currentSet() throws Exception {
        UUID asha = client("Asha");
        UUID paidOff = pack(asha, "Old, paid off", "completed", 9000, 30);   // closed, owes nothing, not newest: left out
        pay(paidOff, "paid", 9000);
        UUID live = pack(asha, "Running", "active", 9000, 5);
        pay(live, "paid", 4000);
        pay(live, "write_off", 1000);

        UUID bala = client("Bala");
        UUID owed = pack(bala, "Finished, still owed", "completed", 3000, 20);
        pay(owed, "paid", 1000);
        UUID cancelled = pack(bala, "Cancelled, newest", "cancelled", 5000, 2);   // owes 0, but it is Bala's newest

        mvc.perform(get("/v1/packages").param("scope", "current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", containsInAnyOrder(live.toString(), owed.toString(), cancelled.toString())))
                // Newest first.
                .andExpect(jsonPath("$.items[0].id").value(cancelled.toString()))
                .andExpect(jsonPath("$.items[?(@.id=='" + live + "')].amountDue").value("4000.00"))   // 9000 − 4000 paid − 1000 written off
                .andExpect(jsonPath("$.items[?(@.id=='" + live + "')].amountPaid").value("4000.00"))
                .andExpect(jsonPath("$.items[?(@.id=='" + owed + "')].amountDue").value("2000.00"))
                .andExpect(jsonPath("$.items[?(@.id=='" + cancelled + "')].amountDue").value("0.00"))
                .andExpect(jsonPath("$.items[?(@.id=='" + cancelled + "')].closedAt").isNotEmpty());

        // With a client: that client's current set; without scope, every package they bought.
        mvc.perform(get("/v1/packages").param("scope", "current").param("clientId", asha.toString()))
                .andExpect(jsonPath("$.items[*].id", containsInAnyOrder(live.toString())));
        mvc.perform(get("/v1/packages").param("clientId", asha.toString()))
                .andExpect(jsonPath("$.items[*].id", containsInAnyOrder(live.toString(), paidOff.toString())))
                .andExpect(jsonPath("$.items[?(@.id=='" + paidOff + "')].amountDue").value("0.00"));
    }

    @Test
    @DisplayName("scope or clientId is required, scope is only 'current', clientId must be an id, and a client not yours is 404")
    void refusals() throws Exception {
        mvc.perform(get("/v1/packages")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/packages").param("scope", "all")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/packages").param("clientId", "nope")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/packages").param("clientId", UUID.randomUUID().toString())).andExpect(status().isNotFound());
        mvc.perform(get("/v1/packages").param("scope", "current").param("clientId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private UUID client(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent', 'active')",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "n", name));
        return id;
    }

    /** A package sold {@code daysAgo} days ago; a closed one gets its closed_at, as package_closed requires. */
    private UUID pack(UUID client, String name, String status, int amount, int daysAgo) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString()); p.put("n", name);
        p.put("a", new BigDecimal(amount)); p.put("s", status); p.put("ago", daysAgo);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date, status, closed_at, created_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :n, 'floor', 'sessions', 12, 6,
                        :a, 'INR', current_date - :ago, current_date + 60 - :ago, current_date - :ago, :s,
                        CASE WHEN :s = 'active' THEN NULL ELSE now() END, now() - make_interval(days => :ago))""", p);
        return id;
    }

    private void pay(UUID pkg, String status, int amount) {
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status, paid_at, written_off_at)
                SELECT gen_random_uuid(), :t::uuid, k.client_id, k.id, :a, 'INR', 'trainer', CASE WHEN :s = 'paid' THEN 'cash' END, :s,
                       CASE WHEN :s = 'paid' THEN now() END, CASE WHEN :s = 'write_off' THEN now() END
                FROM package k WHERE k.id = :k::uuid""",
                Map.of("t", me.toString(), "k", pkg.toString(), "a", new BigDecimal(amount), "s", status));
    }
}
