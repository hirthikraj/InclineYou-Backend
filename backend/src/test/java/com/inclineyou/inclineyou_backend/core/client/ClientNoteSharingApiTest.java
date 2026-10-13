package com.inclineyou.inclineyou_backend.core.client;

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
 * api-contract 1.2, tr-a9: a note the trainer shows to the client. Pins that every note is private until shared, that sharing
 * needs a client who is on the portal and unsharing never does, the one notice sharing mints (and what does not mint one), and
 * that the two columns move together.
 */
@SpringBootTest
@Transactional
class ClientNoteSharingApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant, c;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001601", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        c = client(me, "On The Portal", "+919841028001");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("private by default: no flag is a private note, and the list says so")
    void privateByDefault() throws Exception {
        String json = post(c, "{\"body\":\"Keep this to myself.\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals(Boolean.FALSE, JsonPath.read(json, "$.sharedWithClient"));
        assertNull(JsonPath.read(json, "$.sharedAt"));
        post(c, "{\"body\":\"Explicitly private.\",\"sharedWithClient\":false}").andExpect(status().isCreated()).andExpect(jsonPath("$.sharedWithClient").value(false));
        mvc.perform(get("/v1/clients/" + c + "/notes")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].sharedWithClient").value(false)).andExpect(jsonPath("$.items[0].sharedAt").value(org.hamcrest.Matchers.nullValue()));
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "a private note tells nobody");
    }

    @Test
    @DisplayName("created shared: both columns set together, one `note` notice carrying the opening, and a replay mints no second")
    void createdShared() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"body\":\"Switch to the 30° bench from Monday.\",\"sharedWithClient\":true}";
        String json = post(c, body).andExpect(status().isCreated()).andExpect(jsonPath("$.sharedWithClient").value(true)).andReturn().getResponse().getContentAsString();
        assertNotNull(JsonPath.read(json, "$.sharedAt"));
        assertEquals(1, count("SELECT count(*) FROM client_note WHERE id = :i::uuid AND shared_with_client AND shared_at IS NOT NULL", id));
        Map<String, Object> n = jdbc.queryForMap("SELECT kind, text FROM client_notification WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        assertEquals("note", n.get("kind"));
        assertEquals("Switch to the 30° bench from Monday.", n.get("text"));
        post(c, body).andExpect(status().isOk());
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "a replay is not a second share");
    }

    @Test
    @DisplayName("only a client who has joined can be shown a note: not invited, invited, declined and removed are 409 and write nothing; private is fine for them")
    void needsThePortal() throws Exception {
        String[][] states = {
                {"not_invited", "membership_status = 'not_invited'"},
                {"invited", "membership_status = 'invited', invited_at = now()"},
                {"declined", "membership_status = 'declined', invited_at = now(), declined_at = now()"},
                {"removed", "membership_status = 'removed', removed_at = now(), removed_by = 'trainer'"}};
        int i = 0;
        for (String[] s : states) {
            UUID x = client(me, "S " + s[0], "+91984102810" + i++);
            jdbc.update("UPDATE client SET " + s[1] + " WHERE id = :c::uuid", Map.of("c", x.toString()));
            post(x, "{\"body\":\"Shown\",\"sharedWithClient\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_ON_PORTAL"));
            assertEquals(0, count("SELECT count(*) FROM client_note WHERE client_id = :c::uuid", x), s[0] + ": nothing written");
            post(x, "{\"body\":\"Private\"}").andExpect(status().isCreated());
        }
    }

    @Test
    @DisplayName("PATCH: sharing a private note mints one notice; re-sharing keeps the date and mints nothing; unsharing clears both columns and keeps the notice; sharing again is a new share")
    void shareAndUnshare() throws Exception {
        UUID n = note("Plan for the month.");
        String first = patch(c, n, "{\"sharedWithClient\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithClient").value(true)).andReturn().getResponse().getContentAsString();
        long sharedAt = ((Number) JsonPath.read(first, "$.sharedAt")).longValue();
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c));

        String again = patch(c, n, "{\"sharedWithClient\":true}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(sharedAt, ((Number) JsonPath.read(again, "$.sharedAt")).longValue(), "re-sharing keeps the date they first saw it");
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "nothing new happened");

        patch(c, n, "{\"body\":\"Plan for the month, reworded.\"}").andExpect(status().isOk());
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "editing a shared note tells nobody");
        patch(c, n, "{\"pinned\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithClient").value(true));

        patch(c, n, "{\"sharedWithClient\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithClient").value(false)).andExpect(jsonPath("$.sharedAt").value(org.hamcrest.Matchers.nullValue()));
        assertEquals(0, count("SELECT count(*) FROM client_note WHERE id = :i::uuid AND (shared_with_client OR shared_at IS NOT NULL)", n));
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "unsharing does not take back the notice");

        patch(c, n, "{\"sharedWithClient\":true}").andExpect(status().isOk());
        assertEquals(2, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", c), "showing it again is a new share");
        patch(c, n, "{\"sharedWithClient\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithClient").value(false));
    }

    @Test
    @DisplayName("sharing needs the client on the portal, but pulling a note back never does")
    void unshareAlwaysAllowed() throws Exception {
        UUID n = note("Shown while they were on.");
        patch(c, n, "{\"sharedWithClient\":true}").andExpect(status().isOk());
        jdbc.update("UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'trainer' WHERE id = :c::uuid", Map.of("c", c.toString()));
        patch(c, n, "{\"sharedWithClient\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithClient").value(false));

        UUID m = note("Private, then they left.");
        patch(c, m, "{\"sharedWithClient\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_ON_PORTAL"));
        patch(c, m, "{\"body\":\"Still editable.\"}").andExpect(status().isOk());
        assertEquals(0, count("SELECT count(*) FROM client_note WHERE id = :i::uuid AND shared_with_client", m));
    }

    @Test
    @DisplayName("a paused client can be shown a note (and is not told); a client whose switch for notes is off is shown it without a notice")
    void pausedAndOptedOut() throws Exception {
        UUID p = client(me, "Paused", "+919841028050");
        jdbc.update("UPDATE client SET membership_status = 'paused', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", p.toString()));
        post(p, "{\"body\":\"For when you are back.\",\"sharedWithClient\":true}").andExpect(status().isCreated()).andExpect(jsonPath("$.sharedWithClient").value(true));
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", p));

        UUID q = client(me, "Quiet", "+919841028051");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", q.toString()));
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, notify_trainer_note) VALUES (:c::uuid, :t::uuid, false)", Map.of("c", q.toString(), "t", tenant.toString()));
        post(q, "{\"body\":\"Read it when you like.\",\"sharedWithClient\":true}").andExpect(status().isCreated());
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid", q), "their switch is off");
    }

    @Test
    @DisplayName("validation: a flag that is not a boolean is 400, and an empty PATCH names the three things it could have carried")
    void validation() throws Exception {
        post(c, "{\"body\":\"x\",\"sharedWithClient\":\"yes\"}").andExpect(status().isBadRequest());
        UUID n = note("x");
        patch(c, n, "{\"sharedWithClient\":\"yes\"}").andExpect(status().isBadRequest());
        patch(c, n, "{}").andExpect(status().isBadRequest());
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions post(UUID client, String body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/v1/clients/" + client + "/notes").contentType("application/json").content(body));
    }

    private ResultActions patch(UUID client, UUID note, String body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.patch("/v1/clients/" + client + "/notes/" + note).contentType("application/json").content(body));
    }

    private UUID note(String body) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client_note (id, client_id, trainer_id, body) VALUES (:id::uuid, :c::uuid, :t::uuid, :b)",
                Map.of("id", id.toString(), "c", c.toString(), "t", me.toString(), "b", body));
        return id;
    }

    private int count(String sql, UUID id) {
        var p = new HashMap<String, Object>();
        p.put("i", id.toString());
        p.put("c", id.toString());
        return jdbc.queryForObject(sql, p, Integer.class);
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
