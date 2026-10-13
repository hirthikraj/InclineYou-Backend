package com.inclineyou.inclineyou_backend.core.trainer;

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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, tr-a10: the trainer's two decisions about the client portal — session reminders (off until they turn it on,
 * with a timing) and whether clients see what they owe (on) — and the honest answer to who a reminder would reach. Pins the
 * defaults, that a PATCH leaves what it was not sent alone, the refusals, that switching reminders on opts nobody in, and that a
 * cached read cannot serve reach numbers that have since changed.
 */
@SpringBootTest
@Transactional
class TrainerPortalSettingsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001701", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001702", "Other");
        tenant = tenantOf(me);
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
    @DisplayName("defaults: reminders off, evening before, clients see what they owe, the fixed template, and nobody reached")
    void defaults() throws Exception {
        mvc.perform(get("/v1/trainers/me")).andExpect(status().isOk())
                .andExpect(jsonPath("$.clientPortal.sessionReminders").value(false))
                .andExpect(jsonPath("$.clientPortal.reminderTiming").value("evening_before"))
                .andExpect(jsonPath("$.clientPortal.clientsSeeMoney").value(true))
                .andExpect(jsonPath("$.clientPortal.reminderText").value("Reminder: {session} with {trainer} {when}."))
                .andExpect(jsonPath("$.clientPortal.reminderReach.onPortal").value(0))
                .andExpect(jsonPath("$.clientPortal.reminderReach.optedIn").value(0))
                .andExpect(jsonPath("$.clientPortal.reminderReach.excluded").value(0));
    }

    @Test
    @DisplayName("PATCH: each setting alone, then together; what was not sent is left; the answer is the full profile")
    void patch() throws Exception {
        patch("{\"sessionReminders\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.clientPortal.sessionReminders").value(true))
                .andExpect(jsonPath("$.clientPortal.reminderTiming").value("evening_before"))
                .andExpect(jsonPath("$.clientPortal.clientsSeeMoney").value(true))
                .andExpect(jsonPath("$.id").value(me.toString()));
        patch("{\"reminderTiming\":\"two_hours_before\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.clientPortal.sessionReminders").value(true))
                .andExpect(jsonPath("$.clientPortal.reminderTiming").value("two_hours_before"));
        patch("{\"clientsSeeMoney\":false}").andExpect(status().isOk())
                .andExpect(jsonPath("$.clientPortal.clientsSeeMoney").value(false))
                .andExpect(jsonPath("$.clientPortal.reminderTiming").value("two_hours_before"));
        patch("{\"sessionReminders\":false,\"reminderTiming\":\"evening_before\",\"clientsSeeMoney\":true,\"name\":\"Arun P\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Arun P"))
                .andExpect(jsonPath("$.clientPortal.sessionReminders").value(false))
                .andExpect(jsonPath("$.clientPortal.clientsSeeMoney").value(true));
        assertEquals("evening_before/false/true", jdbc.queryForObject(
                "SELECT reminder_timing || '/' || session_reminders || '/' || clients_see_money FROM trainer WHERE id = :t::uuid", Map.of("t", me.toString()), String.class));
        // a profile save that says nothing about the portal leaves it exactly as it was
        patch("{\"clientsSeeMoney\":false}").andExpect(status().isOk());
        patch("{\"headline\":\"Strength coach\"}").andExpect(status().isOk()).andExpect(jsonPath("$.clientPortal.clientsSeeMoney").value(false));
    }

    @Test
    @DisplayName("refusals: an unknown timing and a flag that is not a boolean are 400, and nothing is written")
    void refusals() throws Exception {
        patch("{\"reminderTiming\":\"tomorrow\"}").andExpect(status().isBadRequest());
        patch("{\"reminderTiming\":\"\"}").andExpect(status().isBadRequest());
        patch("{\"sessionReminders\":\"yes\"}").andExpect(status().isBadRequest());
        patch("{\"clientsSeeMoney\":1}").andExpect(status().isBadRequest());
        patch("{\"sessionReminder\":true}").andExpect(status().isBadRequest());     // a misspelt key is not silently ignored
        assertEquals("false/evening_before/true", jdbc.queryForObject(
                "SELECT session_reminders || '/' || reminder_timing || '/' || clients_see_money FROM trainer WHERE id = :t::uuid", Map.of("t", me.toString()), String.class));
    }

    @Test
    @DisplayName("reminderReach is who would actually get one: opted in, channel on, not excluded; switching reminders on changes nothing")
    void reach() throws Exception {
        UUID a = accepted("A opted in", "+919841029001");
        prefs(a, true, true);
        UUID b = accepted("B opted in but excluded", "+919841029002");
        prefs(b, true, true);
        jdbc.update("UPDATE client SET reminders_excluded = true WHERE id = :c::uuid", Map.of("c", b.toString()));
        accepted("C no preferences yet", "+919841029003");
        UUID d = accepted("D opted in, channel off", "+919841029004");
        prefs(d, false, true);
        UUID e = client(me, "E only invited", "+919841029005");
        jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :c::uuid", Map.of("c", e.toString()));
        UUID theirs = client(other, "F another trainer's", "+919841029006");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", theirs.toString()));
        UUID gone = accepted("G deleted", "+919841029007");
        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :c::uuid", Map.of("c", gone.toString()));

        mvc.perform(get("/v1/trainers/me")).andExpect(jsonPath("$.clientPortal.reminderReach.onPortal").value(4))
                .andExpect(jsonPath("$.clientPortal.reminderReach.optedIn").value(1))
                .andExpect(jsonPath("$.clientPortal.reminderReach.excluded").value(1));
        patch("{\"sessionReminders\":true}").andExpect(jsonPath("$.clientPortal.reminderReach.optedIn").value(1));
    }

    @Test
    @DisplayName("a cached profile cannot serve reach numbers that have changed: the tag moves when a client opts in, though the profile does not")
    void tagCoversTheReach() throws Exception {
        String first = mvc.perform(get("/v1/trainers/me")).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        mvc.perform(get("/v1/trainers/me").header("If-None-Match", first)).andExpect(status().isNotModified());

        UUID a = accepted("A", "+919841029011");
        prefs(a, true, true);
        String second = mvc.perform(get("/v1/trainers/me").header("If-None-Match", first)).andExpect(status().isOk())
                .andExpect(jsonPath("$.clientPortal.reminderReach.optedIn").value(1)).andReturn().getResponse().getHeader("ETag");
        mvc.perform(get("/v1/trainers/me").header("If-None-Match", second)).andExpect(status().isNotModified());
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions patch(String body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.patch("/v1/trainers/me").contentType("application/json").content(body));
    }

    private UUID accepted(String name, String phone) {
        UUID c = client(me, name, phone);
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        return c;
    }

    private void prefs(UUID client, boolean channelWhatsapp, boolean optedIn) {
        var p = new HashMap<String, Object>();
        p.put("c", client.toString()); p.put("t", tenant.toString()); p.put("ch", channelWhatsapp);
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, channel_whatsapp, whatsapp_opt_in_at) VALUES (:c::uuid, :t::uuid, :ch, CASE WHEN " + optedIn + " THEN now() END)", p);
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
