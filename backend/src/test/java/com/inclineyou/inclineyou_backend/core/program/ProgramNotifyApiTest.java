package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/client-invites} (api-contract 1.2, tr-a3): the Invitations view. Pins the default (what needs the trainer),
 * that {@code expired} is derived and never stored, the five-way filter, the counts, the client filter, keyset paging, that
 * another trainer's invites and a deleted client's never show, and that no secret is on the wire.
 */
/**
 * api-contract 1.2, tr-a11: telling a client their plan changed. Pins that it is the trainer's choice (no save ever does it),
 * that a template and a client who is not on the portal are refused with the codes the contract names, that the client's own
 * switch is respected, and that a stranger's program is a 404.
 */
@SpringBootTest
@Transactional
class ProgramNotifyApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant, c, plan;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001801", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001802", "Other");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        c = client(me, "On The Portal", "+919841030001");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        plan = plan(me, tenant, c, "Strength Block");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("200 {sent: true}, and one `plan` notice naming the plan; each call is one notice")
    void notifies() throws Exception {
        notify(plan).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(true));
        Map<String, Object> n = jdbc.queryForMap("SELECT kind, text, session_id FROM client_notification WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        assertEquals("plan", n.get("kind"));
        assertEquals("Your plan, Strength Block, was updated.", n.get("text"));
        assertNull(n.get("session_id"));
        notify(plan).andExpect(status().isOk());
        assertEquals(2, notices(c), "the trainer pressed it twice");
    }

    @Test
    @DisplayName("saving a plan never tells the client: a rename and a status change mint nothing")
    void savesAreSilent() throws Exception {
        mvc.perform(MockMvcRequestBuilders.patch("/v1/programs/" + plan).contentType("application/json").content("{\"name\":\"Renamed\"}")).andExpect(status().isOk());
        mvc.perform(MockMvcRequestBuilders.patch("/v1/programs/" + plan).contentType("application/json").content("{\"status\":\"paused\"}")).andExpect(status().isOk());
        assertEquals(0, notices(c));
    }

    @Test
    @DisplayName("a template has no client to tell: 422 PROGRAM_IS_TEMPLATE, and nothing is minted")
    void template() throws Exception {
        UUID t = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, 'A template', 4)",
                Map.of("id", t.toString(), "t", me.toString(), "ten", tenant.toString()));
        notify(t).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROGRAM_IS_TEMPLATE"));
        assertEquals(0, notices(c));
    }

    @Test
    @DisplayName("only a client who has joined can be told: not invited, invited, declined and removed are 409; a paused client is a 200 with sent false")
    void needsThePortal() throws Exception {
        String[][] states = {
                {"not_invited", "membership_status = 'not_invited'"},
                {"invited", "membership_status = 'invited', invited_at = now()"},
                {"declined", "membership_status = 'declined', invited_at = now(), declined_at = now()"},
                {"removed", "membership_status = 'removed', removed_at = now(), removed_by = 'trainer'"}};
        int i = 0;
        for (String[] s : states) {
            UUID x = client(me, "S " + s[0], "+91984103010" + i++);
            jdbc.update("UPDATE client SET " + s[1] + " WHERE id = :c::uuid", Map.of("c", x.toString()));
            UUID p = plan(me, tenant, x, "Plan " + s[0]);
            notify(p).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_ON_PORTAL"));
            assertEquals(0, notices(x), s[0]);
        }
        UUID paused = client(me, "Paused", "+919841030199");
        jdbc.update("UPDATE client SET membership_status = 'paused', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", paused.toString()));
        notify(plan(me, tenant, paused, "Paused plan")).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(false));
        assertEquals(0, notices(paused), "a paused client has nobody to be told");
    }

    @Test
    @DisplayName("the client's own switch is respected: still a 200 (the trainer did what they meant to) but sent is false, and no notice is written")
    void clientSwitchOff() throws Exception {
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, notify_program_updated) VALUES (:c::uuid, :t::uuid, false)", Map.of("c", c.toString(), "t", tenant.toString()));
        notify(plan).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(false));
        assertEquals(0, notices(c));
    }

    @Test
    @DisplayName("another trainer's program and an unknown id are 404; a body with a field is 400")
    void scope() throws Exception {
        UUID theirs = client(other, "Theirs", "+919841030200");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", theirs.toString()));
        UUID p = plan(other, tenantOf(other), theirs, "Their plan");
        notify(p).andExpect(status().isNotFound());
        notify(UUID.randomUUID()).andExpect(status().isNotFound());
        assertEquals(0, notices(theirs));
        mvc.perform(MockMvcRequestBuilders.post("/v1/programs/" + plan + "/notify").contentType("application/json").content("{\"x\":1}")).andExpect(status().isBadRequest());
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions notify(UUID program) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/v1/programs/" + program + "/notify"));
    }

    private int notices(UUID client) {
        return jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", Map.of("c", client.toString()), Integer.class);
    }

    private UUID plan(UUID trainerId, UUID tenantId, UUID clientId, String name) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantId.toString()); p.put("c", clientId.toString()); p.put("n", name);
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', :n, 4)", p);
        return id;
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID client(UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantOf(trainerId).toString());
        p.put("n", name); p.put("ph", phone);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :ph, 'independent')", p);
        return id;
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
