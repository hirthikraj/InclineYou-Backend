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
 * api-contract 1.2, tr-a7: the trainer's lines to a client. Pins the three kinds (a session makes a recap, one per session),
 * that a client who is not on the portal gets nothing, replay and id clashes, the notice a message mints and the client's own
 * switch for it, newest-first keyset paging, the edit that is allowed only while unread, and a delete that is allowed any time.
 */
@SpringBootTest
@Transactional
class ClientMessageApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant, c;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001501", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001502", "Other");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        c = client(me, "On The Portal", "+919841027001");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a note, a weekly line and a recap: the kind is derived, the body is trimmed, and the row is the trainer's")
    void kinds() throws Exception {
        UUID n = UUID.randomUUID(), w = UUID.randomUUID(), r = UUID.randomUUID(), s = session(c, 2);
        String json = post(c, "{\"id\":\"" + n + "\",\"body\":\"  Depth was spot on.  \"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals("note", JsonPath.read(json, "$.kind"));
        assertEquals("Depth was spot on.", JsonPath.read(json, "$.body"));
        assertEquals(n.toString(), JsonPath.read(json, "$.id"));
        assertNull(JsonPath.read(json, "$.sessionId"));
        assertNull(JsonPath.read(json, "$.readAt"));
        assertNotNull(JsonPath.read(json, "$.at"));
        assertNotNull(JsonPath.read(json, "$.version"));
        post(c, "{\"id\":\"" + w + "\",\"body\":\"Big week ahead.\",\"kind\":\"weekly\"}").andExpect(status().isCreated()).andExpect(jsonPath("$.kind").value("weekly"));
        post(c, "{\"id\":\"" + r + "\",\"body\":\"Good session.\",\"sessionId\":\"" + s + "\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("recap")).andExpect(jsonPath("$.sessionId").value(s.toString()));
        assertEquals(me.toString(), jdbc.queryForObject("SELECT trainer_id::text FROM client_message WHERE id = :i::uuid", Map.of("i", n.toString()), String.class));
        post(c, "{\"body\":\"No id sent\"}").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a replay of the same id answers the same row (200); another id's, a deleted id's and a stranger's are 409 ID_CONFLICT")
    void replayAndClash() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"body\":\"Once.\"}";
        String first = post(c, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String again = post(c, body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(first, again);
        assertEquals(1, count("SELECT count(*) FROM client_message WHERE id = :i::uuid", id));
        assertEquals(1, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid AND kind = 'note'", c), "a replay mints nothing");

        mvc.perform(delete("/v1/clients/" + c + "/messages/" + id)).andExpect(status().isNoContent());
        post(c, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));

        UUID theirs = client(other, "Theirs", "+919841027002");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", theirs.toString()));
        UUID foreign = UUID.randomUUID();
        jdbc.update("INSERT INTO client_message (id, trainer_id, client_id, body, kind) VALUES (:id::uuid, :t::uuid, :c::uuid, 'hello', 'note')",
                Map.of("id", foreign.toString(), "t", other.toString(), "c", theirs.toString()));
        post(c, "{\"id\":\"" + foreign + "\",\"body\":\"Mine now\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("only a client who has joined can be written to: not invited, invited, declined and removed are 409; paused is allowed")
    void notOnThePortal() throws Exception {
        for (String state : new String[]{"not_invited", "invited", "declined", "removed"}) {
            UUID x = client(me, "S " + state, "+9198410271" + Math.abs(state.hashCode() % 90 + 10));
            String set = switch (state) {
                case "invited" -> "membership_status = 'invited', invited_at = now()";
                case "declined" -> "membership_status = 'declined', invited_at = now(), declined_at = now()";
                case "removed" -> "membership_status = 'removed', removed_at = now(), removed_by = 'trainer'";
                default -> "membership_status = 'not_invited'";
            };
            jdbc.update("UPDATE client SET " + set + " WHERE id = :c::uuid", Map.of("c", x.toString()));
            post(x, "{\"body\":\"Hello\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_ON_PORTAL"));
            assertEquals(0, count("SELECT count(*) FROM client_message WHERE client_id = :i::uuid", x), state);
        }
        UUID p = client(me, "Paused", "+919841027099");
        jdbc.update("UPDATE client SET membership_status = 'paused', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", p.toString()));
        post(p, "{\"body\":\"Rest up.\"}").andExpect(status().isCreated());
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid", p), "a paused client has nobody to notify");
    }

    @Test
    @DisplayName("one recap per session: a second is 409 RECAP_EXISTS, and a deleted one frees the session")
    void oneRecap() throws Exception {
        UUID s = session(c, 1);
        UUID first = UUID.randomUUID();
        post(c, "{\"id\":\"" + first + "\",\"body\":\"One.\",\"sessionId\":\"" + s + "\"}").andExpect(status().isCreated());
        post(c, "{\"body\":\"Two.\",\"sessionId\":\"" + s + "\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECAP_EXISTS"));
        mvc.perform(delete("/v1/clients/" + c + "/messages/" + first)).andExpect(status().isNoContent());
        post(c, "{\"body\":\"Two.\",\"sessionId\":\"" + s + "\"}").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("validation: blank, over 1000, kind beside a sessionId, kind recap, a session that is not theirs, an unknown key")
    void validation() throws Exception {
        post(c, "{\"body\":\"   \"}").andExpect(status().isBadRequest());
        post(c, "{}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"" + "x".repeat(1001) + "\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"" + "x".repeat(1000) + "\"}").andExpect(status().isCreated());
        UUID s = session(c, 3);
        post(c, "{\"body\":\"hi\",\"kind\":\"weekly\",\"sessionId\":\"" + s + "\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"hi\",\"kind\":\"recap\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"hi\",\"kind\":\"shout\"}").andExpect(status().isBadRequest());
        UUID other2 = client(me, "Someone Else", "+919841027003");
        UUID theirSession = session(other2, 3);
        post(c, "{\"body\":\"hi\",\"sessionId\":\"" + theirSession + "\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"hi\",\"sessionId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"hi\",\"mood\":\"happy\"}").andExpect(status().isBadRequest());
        post(c, "{\"body\":\"hi\",\"id\":\"nope\"}").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the notice: one `note` for a client whose switch is on, carrying the opening of the message and the session; none when it is off")
    void notice() throws Exception {
        UUID s = session(c, 1);
        post(c, "{\"body\":\"" + "word ".repeat(60) + "\",\"sessionId\":\"" + s + "\"}").andExpect(status().isCreated());
        Map<String, Object> n = jdbc.queryForMap("SELECT kind, text, session_id::text AS sid FROM client_notification WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        assertEquals("note", n.get("kind"));
        assertEquals(s.toString(), n.get("sid"));
        String text = (String) n.get("text");
        assertEquals(160, text.length());
        assertEquals('…', text.charAt(159));

        UUID quiet = client(me, "Quiet", "+919841027010");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid", Map.of("c", quiet.toString()));
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, notify_trainer_note) VALUES (:c::uuid, :t::uuid, false)", Map.of("c", quiet.toString(), "t", tenant.toString()));
        post(quiet, "{\"body\":\"Still written.\"}").andExpect(status().isCreated());
        assertEquals(1, count("SELECT count(*) FROM client_message WHERE client_id = :i::uuid", quiet));
        assertEquals(0, count("SELECT count(*) FROM client_notification WHERE client_id = :i::uuid", quiet), "their switch is off: a message, no notice");
    }

    @Test
    @DisplayName("the list: newest first with readAt, keyset-paged, deleted ones and other clients' and other trainers' left out")
    void list() throws Exception {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) ids.add(message(c, "line " + i, i + 1));    // i+1 days ago: line 0 is the newest
        jdbc.update("UPDATE client_message SET read_at = now() WHERE id = :i::uuid", Map.of("i", ids.get(0).toString()));
        mvc.perform(delete("/v1/clients/" + c + "/messages/" + ids.get(4))).andExpect(status().isNoContent());
        UUID elsewhere = client(me, "Another", "+919841027020");
        message(elsewhere, "not for this client", 1);

        String all = mvc.perform(get("/v1/clients/" + c + "/messages")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(ids.get(0), ids.get(1), ids.get(2), ids.get(3)).stream().map(UUID::toString).toList(), JsonPath.<List<String>>read(all, "$.items[*].id"));
        assertNotNull(JsonPath.read(all, "$.items[0].readAt"));
        assertNull(JsonPath.read(all, "$.items[1].readAt"));
        assertNull(JsonPath.read(all, "$.nextCursor"));

        var seen = new ArrayList<String>();
        String cursor = null;
        for (int i = 0; i < 6; i++) {
            String page = mvc.perform(get("/v1/clients/" + c + "/messages?limit=2" + (cursor == null ? "" : "&cursor=" + cursor))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            seen.addAll(JsonPath.<List<String>>read(page, "$.items[*].id"));
            cursor = JsonPath.read(page, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(JsonPath.<List<String>>read(all, "$.items[*].id"), seen, "the pages walk the list once");

        for (String bad : new String[]{"?limit=0", "?limit=201", "?cursor=nope"}) {
            mvc.perform(get("/v1/clients/" + c + "/messages" + bad)).andExpect(status().isBadRequest());
        }
        UUID theirs = client(other, "Theirs", "+919841027021");
        mvc.perform(get("/v1/clients/" + theirs + "/messages")).andExpect(status().isNotFound());
        mvc.perform(get("/v1/clients/" + UUID.randomUUID() + "/messages")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("edit: the wording changes while unread, a stale If-Match is 412; once opened it is 409 MESSAGE_ALREADY_READ")
    void edit() throws Exception {
        UUID m = message(c, "first draft", 1);
        String edited = patch(c, m, "{\"body\":\"  second draft  \"}", null).andExpect(status().isOk()).andExpect(jsonPath("$.body").value("second draft"))
                .andExpect(jsonPath("$.kind").value("note")).andReturn().getResponse().getContentAsString();
        assertEquals(m.toString(), JsonPath.read(edited, "$.id"));

        // a test shares one transaction, so now() cannot move; a version that was never this message's is stale all the same
        patch(c, m, "{\"body\":\"third\"}", "\"1\"").andExpect(status().isPreconditionFailed());
        String now = JsonPath.read(edited, "$.version");
        patch(c, m, "{\"body\":\"third\"}", "\"" + now + "\"").andExpect(status().isOk());

        patch(c, m, "{\"body\":\"  \"}", null).andExpect(status().isBadRequest());
        patch(c, m, "{\"body\":\"" + "x".repeat(1001) + "\"}", null).andExpect(status().isBadRequest());
        patch(c, m, "{\"kind\":\"weekly\"}", null).andExpect(status().isBadRequest());

        jdbc.update("UPDATE client_message SET read_at = now() WHERE id = :i::uuid", Map.of("i", m.toString()));
        patch(c, m, "{\"body\":\"too late\"}", null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MESSAGE_ALREADY_READ"));
        assertEquals("third", jdbc.queryForObject("SELECT body FROM client_message WHERE id = :i::uuid", Map.of("i", m.toString()), String.class));

        mvc.perform(delete("/v1/clients/" + c + "/messages/" + m)).andExpect(status().isNoContent());
        patch(c, m, "{\"body\":\"gone\"}", null).andExpect(status().isNotFound());
        patch(c, UUID.randomUUID(), "{\"body\":\"x\"}", null).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("delete: allowed at any time (read or not), a repeat is 204, an unknown id and a stranger's message are 404")
    void deleteAnyTime() throws Exception {
        UUID unread = message(c, "unread", 1), read = message(c, "read", 2);
        jdbc.update("UPDATE client_message SET read_at = now() WHERE id = :i::uuid", Map.of("i", read.toString()));
        for (UUID m : new UUID[]{unread, read}) {
            mvc.perform(delete("/v1/clients/" + c + "/messages/" + m)).andExpect(status().isNoContent());
            mvc.perform(delete("/v1/clients/" + c + "/messages/" + m)).andExpect(status().isNoContent());
            assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM client_message WHERE id = :i::uuid", Map.of("i", m.toString()), java.sql.Timestamp.class), "soft: the row stays");
        }
        mvc.perform(delete("/v1/clients/" + c + "/messages/" + UUID.randomUUID())).andExpect(status().isNotFound());

        UUID theirs = client(other, "Theirs", "+919841027030");
        UUID foreign = UUID.randomUUID();
        jdbc.update("INSERT INTO client_message (id, trainer_id, client_id, body, kind) VALUES (:id::uuid, :t::uuid, :c::uuid, 'hi', 'note')",
                Map.of("id", foreign.toString(), "t", other.toString(), "c", theirs.toString()));
        mvc.perform(delete("/v1/clients/" + c + "/messages/" + foreign)).andExpect(status().isNotFound());   // another trainer's message, through my client
        mvc.perform(delete("/v1/clients/" + theirs + "/messages/" + foreign)).andExpect(status().isNotFound());   // and through theirs
        assertNull(jdbc.queryForObject("SELECT deleted_at FROM client_message WHERE id = :i::uuid", Map.of("i", foreign.toString()), java.sql.Timestamp.class));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private ResultActions post(UUID client, String body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/v1/clients/" + client + "/messages").contentType("application/json").content(body));
    }

    private ResultActions patch(UUID client, UUID message, String body, String ifMatch) throws Exception {
        var req = MockMvcRequestBuilders.patch("/v1/clients/" + client + "/messages/" + message).contentType("application/json").content(body);
        if (ifMatch != null) req.header("If-Match", ifMatch);
        return mvc.perform(req);
    }

    private int count(String sql, UUID id) {
        var p = new HashMap<String, Object>();
        p.put("i", id.toString());
        p.put("c", id.toString());
        return jdbc.queryForObject(sql, p, Integer.class);
    }

    private UUID message(UUID client, String body, int daysAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client_message (id, trainer_id, client_id, body, kind, at) VALUES (:id::uuid, :t::uuid, :c::uuid, :b, 'note', now() - CAST(:d AS interval))",
                Map.of("id", id.toString(), "t", me.toString(), "c", client.toString(), "b", body, "d", daysAgo + " days"));
        return id;
    }

    private UUID session(UUID clientId, int daysAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status) VALUES (:id::uuid, :t::uuid, :c::uuid, now() - CAST(:d AS interval), 60, now() - CAST(:d AS interval), 'done')",
                Map.of("id", id.toString(), "t", me.toString(), "c", clientId.toString(), "d", daysAgo + " days"));
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
