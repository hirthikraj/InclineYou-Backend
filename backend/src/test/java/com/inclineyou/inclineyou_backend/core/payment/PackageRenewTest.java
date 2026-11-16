package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract Today A3 ({@code POST /v1/packages/{id}/renew}) through the API, as the web calls it: which terms are
 * copied (R5 — the pack's current ones while it is on the price list, else the package's own, its length included),
 * that a discount never is, the replay, the double-sale guard and the 404. Option B, Undo and the 9 Nov fixes are in
 * {@code SessionBillingTest}.
 */
@SpringBootTest
@Transactional
class PackageRenewTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, client;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001091', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001091'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Meera', 'independent', 'active')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
        today = LocalDate.now(ZoneId.of(jdbc.queryForObject("SELECT timezone FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class)));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("from a pack still on the price list: the pack's CURRENT terms; the discount is never copied; full and due on its start")
    void fromALivePack() throws Exception {
        UUID pack = pricePack("12 sessions", 12, "9000.00", 60);
        UUID old = sold(pack, "12 sessions", 12, "8000.00", "500.00", 30, 30);
        // The price list moved on since the sale.
        jdbc.update("UPDATE pack SET name = '12 sessions (2026)', amount = 9600, validity_days = 45 WHERE id = :id::uuid",
                Map.of("id", pack.toString()));

        renew(old, "{}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.packId").value(pack.toString()))
                .andExpect(jsonPath("$.name").value("12 sessions (2026)"))
                .andExpect(jsonPath("$.amount").value("9600.00"))
                .andExpect(jsonPath("$.discountAmount").value(nullValue()))
                .andExpect(jsonPath("$.sessionsTotal").value(12))
                .andExpect(jsonPath("$.sessionsRemaining").value(12))
                .andExpect(jsonPath("$.startDate").value(today.toString()))
                .andExpect(jsonPath("$.dueDate").value(today.toString()))
                .andExpect(jsonPath("$.endDate").value(today.plusDays(45).toString()))
                .andExpect(jsonPath("$.status").value("active"));
    }

    @Test
    @DisplayName("from a custom package, or one whose pack left the price list: its own terms and its own length")
    void fromItsOwnTerms() throws Exception {
        UUID custom = sold(null, "Custom 8", 8, "6400.00", null, 40, 28);
        renew(custom, "{\"startDate\":\"" + today.plusDays(3) + "\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.packId").value(nullValue()))
                .andExpect(jsonPath("$.name").value("Custom 8"))
                .andExpect(jsonPath("$.amount").value("6400.00"))
                .andExpect(jsonPath("$.sessionsTotal").value(8))
                .andExpect(jsonPath("$.startDate").value(today.plusDays(3).toString()))
                .andExpect(jsonPath("$.endDate").value(today.plusDays(3 + 28).toString()));

        // Another client: the renewal above is already the first one's newer pack for this service.
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Arjun', 'independent', 'active')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
        UUID pack = pricePack("Monthly 10", 10, "7000.00", 30);
        UUID retired = sold(pack, "Monthly 10", 10, "7000.00", null, 40, 30);
        jdbc.update("UPDATE pack SET status = 'inactive', amount = 9999 WHERE id = :id::uuid", Map.of("id", pack.toString()));
        renew(retired, "{}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount").value("7000.00"))     // not the retired pack's new price
                .andExpect(jsonPath("$.endDate").value(today.plusDays(30).toString()));
    }

    @Test
    @DisplayName("a retried id answers 200 with the same package and sells nothing more; a second renew is PACKAGE_ALREADY_RENEWED")
    void replayAndAlreadyRenewed() throws Exception {
        UUID old = sold(null, "Custom 8", 8, "6400.00", null, 40, 28);
        UUID attempt = UUID.randomUUID();
        String body = "{\"id\":\"" + attempt + "\"}";
        renew(old, body).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(attempt.toString()));
        renew(old, body).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(attempt.toString()));
        assertEquals(2, packagesOfClient(), "the old one and one renewal, not two");

        renew(old, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACKAGE_ALREADY_RENEWED"));
        assertEquals(2, packagesOfClient());
    }

    @Test
    @DisplayName("a package that does not exist or is not yours is 404; a malformed id or date is 400")
    void refusals() throws Exception {
        renew(UUID.randomUUID(), "{}").andExpect(status().isNotFound());
        UUID old = sold(null, "Custom 8", 8, "6400.00", null, 40, 28);
        renew(old, "{\"id\":\"nope\"}").andExpect(status().isBadRequest());
        renew(old, "{\"startDate\":\"9 Nov\"}").andExpect(status().isBadRequest());

        // Another trainer's package: not found, and it says nothing more.
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001092', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001092'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Other') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        UUID other = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        var auth = new UsernamePasswordAuthenticationToken(other.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        SecurityContextHolder.getContext().setAuthentication(auth);
        mvc.perform(post("/v1/packages/{id}/renew", old).principal(auth).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Undo through the route: 204, a repeat 204, gone from every read; an old pack 409, a single sale 422, another trainer's 404")
    void undoThroughTheRoute() throws Exception {
        UUID old = sold(null, "Custom 8", 8, "6400.00", null, 40, 28);
        String made = com.jayway.jsonpath.JsonPath.read(renew(old, "{}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");

        mvc.perform(delete("/v1/packages/{id}", made)).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/packages/{id}", made)).andExpect(status().isNoContent());   // a repeat is harmless
        mvc.perform(get("/v1/packages").param("clientId", client.toString()))
                .andExpect(jsonPath("$.items[?(@.id=='" + made + "')]").isEmpty());

        // Sold 40 days ago: past the ten minutes.
        mvc.perform(delete("/v1/packages/{id}", old)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PACKAGE_UNDO_EXPIRED"));

        // A single session's own sale goes with its session, never on its own.
        UUID single = UUID.randomUUID();
        UUID session = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, billing, price)
                VALUES (:s::uuid, :t::uuid, :c::uuid, now() + interval '2 days', 60, now() + interval '2 days 1 hour', 'single', 800)
                """, Map.of("s", session.toString(), "t", me.toString(), "c", client.toString()));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, session_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, currency, start_date, due_date)
                VALUES (:k::uuid, :t::uuid, :c::uuid, :s::uuid, 'Single session', 'floor', 'sessions', 1, 1, 800, 'INR',
                        current_date + 2, current_date + 2)
                """, Map.of("k", single.toString(), "t", me.toString(), "c", client.toString(), "s", session.toString()));
        mvc.perform(delete("/v1/packages/{id}", single)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PACKAGE_SINGLE_SESSION"));

        // Unknown, and another trainer's: 404, and it says nothing more.
        mvc.perform(delete("/v1/packages/{id}", UUID.randomUUID())).andExpect(status().isNotFound());
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100001093', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100001093'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Other') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au));
        UUID other = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        var auth = new UsernamePasswordAuthenticationToken(other.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        SecurityContextHolder.getContext().setAuthentication(auth);
        UUID fresh = sold(null, "Custom 8", 8, "6400.00", null, 0, 28);
        mvc.perform(delete("/v1/packages/{id}", fresh).principal(auth)).andExpect(status().isNotFound());
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private ResultActions renew(UUID packageId, String body) throws Exception {
        return mvc.perform(post("/v1/packages/{id}/renew", packageId).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID pricePack(String name, int sessions, String amount, int validityDays) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency, validity_days)
                VALUES (:id::uuid, :t::uuid, :n, 'floor', 'sessions', :s, :a::numeric, 'INR', :v)""",
                Map.of("id", id.toString(), "t", me.toString(), "n", name, "s", sessions, "a", amount, "v", validityDays));
        return id;
    }

    /** A package sold {@code daysAgo} days ago for {@code lengthDays}, with two sessions left. */
    private UUID sold(UUID packId, String name, int sessions, String amount, String discount, int daysAgo, int lengthDays) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", me.toString()); p.put("c", client.toString());
        p.put("pk", packId == null ? null : packId.toString()); p.put("n", name); p.put("s", sessions);
        p.put("a", amount); p.put("d", discount); p.put("ago", daysAgo); p.put("len", lengthDays);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, discount_amount, currency, start_date, end_date, due_date,
                                     created_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :pk::uuid, :n, 'floor', 'sessions', :s, 2, :a::numeric,
                        :d::numeric, 'INR', current_date - :ago, current_date - :ago + :len, current_date - :ago,
                        now() - make_interval(days => :ago))""", p);
        return id;
    }

    private int packagesOfClient() {
        return jdbc.queryForObject("SELECT count(*)::int FROM package WHERE client_id = :c::uuid AND deleted_at IS NULL",
                Map.of("c", client.toString()), Integer.class);
    }
}
