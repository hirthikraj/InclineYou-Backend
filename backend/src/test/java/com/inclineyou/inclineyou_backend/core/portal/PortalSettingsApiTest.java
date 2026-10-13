package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.OtpSender;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, ps-l1 … ps-a4: the client's settings, what their trainer can see, leaving, the data download, closing the account behind a
 * step-up, and browser push. Through the security chain; the suite runs as the schema owner, so the row-level walls (the column guard on prefs,
 * what a client may call) are asserted live as the request role.
 */
@SpringBootTest(properties = "app.otp.resend-ladder-seconds=0")
@org.springframework.context.annotation.Import(PortalSettingsApiTest.CapturingSender.class)
@Transactional
class PortalSettingsApiTest {

    private static final String WEB = "X-InclineYou-Client";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private UUID arun, divya;
    private UUID me, tenant;
    private int seq = 0;

    @BeforeEach
    void setUp() {
        sender.sent.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        phone = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        arun = trainer("+919100002501", "Arun Prakash", "Strength");
        divya = trainer("+919100002502", "Divya Rao", null);
    }

    private ResultActions get(String token, String url) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private ResultActions patchPrefs(String token, String ifMatch, String json) throws Exception {
        var r = patch("/v1/portal/prefs").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json);
        if (ifMatch != null) r = r.header("If-Match", "\"" + ifMatch + "\"");
        return mvc.perform(r);
    }

    private ResultActions postJson(String token, String url, String json) throws Exception {
        return mvc.perform(post(url).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String body(ResultActions a) throws Exception {
        return a.andReturn().getResponse().getContentAsString();
    }

    private static Instant ago(int days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    private UUID note(UUID client, String text, boolean shared, boolean deleted, Instant at) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("c", client.toString()); m.put("t", arun.toString()); m.put("b", text); m.put("s", shared); m.put("d", deleted); m.put("at", java.sql.Timestamp.from(at));
        jdbc.update("""
                INSERT INTO client_note (id, tenant_id, client_id, trainer_id, body, shared_with_client, shared_at, created_at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, :b, :s, CASE WHEN :s THEN CAST(:at AS timestamptz) END, CAST(:at AS timestamptz), CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }


    @Test
    @DisplayName("prefs: a client with no row reads every switch on; a PATCH names only what it changes (nested too), makes the row, and returns the whole with a new version; an unknown key, a half nominee or a stale If-Match is refused")
    void prefs() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        get(token, "/v1/portal/prefs").andExpect(status().isOk()).andExpect(header().string("ETag", "\"0\"")).andExpect(jsonPath("$.hideWeight").value(false)).andExpect(jsonPath("$.autoRestTimer").value(true))
                .andExpect(jsonPath("$.notify.programUpdated").value(true)).andExpect(jsonPath("$.notify.assessment").value(true)).andExpect(jsonPath("$.channels.whatsapp").value(true))
                .andExpect(jsonPath("$.whatsapp.optedIn").value(false)).andExpect(jsonPath("$.nominee").value(nullValue())).andExpect(jsonPath("$.version").value("0"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class), "a read makes no row");

        patchPrefs(token, null, "{\"hideWeight\":true,\"notify\":{\"sessionReminder\":false}}").andExpect(status().isOk()).andExpect(jsonPath("$.hideWeight").value(true))
                .andExpect(jsonPath("$.notify.sessionReminder").value(false)).andExpect(jsonPath("$.notify.trainerNote").value(true)).andExpect(jsonPath("$.autoRestTimer").value(true));
        patchPrefs(token, null, "{\"notify\":{\"assessment\":false},\"autoRestTimer\":false}").andExpect(jsonPath("$.notify.assessment").value(false)).andExpect(jsonPath("$.notify.sessionReminder").value(false))
                .andExpect(jsonPath("$.hideWeight").value(true));
        assertEquals(false, jdbc.queryForObject("SELECT notify_checkin FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), Boolean.class), "assessment is stored as checkin");
        patchPrefs(token, null, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.hideWeight").value(true));

        // nominee: both or neither, a number with its country code, removed with null
        patchPrefs(token, null, "{\"nominee\":{\"name\":\"Meera Nair\",\"phone\":\"+919841000001\"}}").andExpect(jsonPath("$.nominee.name").value("Meera Nair")).andExpect(jsonPath("$.nominee.phone").value("+919841000001"));
        patchPrefs(token, null, "{\"nominee\":{\"name\":\"Meera\"}}").andExpect(status().isBadRequest());
        patchPrefs(token, null, "{\"nominee\":{\"name\":\"Meera\",\"phone\":\"98410\"}}").andExpect(status().isBadRequest());
        patchPrefs(token, null, "{\"nominee\":null}").andExpect(jsonPath("$.nominee").value(nullValue()));
        // refusals
        patchPrefs(token, null, "{\"channelz\":{}}").andExpect(status().isBadRequest());
        patchPrefs(token, null, "{\"notify\":{\"sessionReminders\":true}}").andExpect(status().isBadRequest());
        patchPrefs(token, null, "{\"hideWeight\":\"yes\"}").andExpect(status().isBadRequest());
        patchPrefs(token, "1", "{\"hideWeight\":false}").andExpect(status().isPreconditionFailed());
        String v = com.jayway.jsonpath.JsonPath.read(body(get(token, "/v1/portal/prefs")), "$.version");
        patchPrefs(token, v, "{\"hideWeight\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.hideWeight").value(false));
    }

    @Test
    @DisplayName("WhatsApp: turning it on records the opt-in once, turning it off stops it without clearing the consent; the reminder opt-in is offered only while the trainer sends reminders and has not left this client out")
    void whatsapp() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        jdbc.update("UPDATE trainer SET session_reminders = false WHERE id = :t::uuid", Map.of("t", arun.toString()));
        get(token, "/v1/portal/prefs").andExpect(jsonPath("$.whatsapp.reminderOffered").value(false));
        jdbc.update("UPDATE trainer SET session_reminders = true WHERE id = :t::uuid", Map.of("t", arun.toString()));
        get(token, "/v1/portal/prefs").andExpect(jsonPath("$.whatsapp.reminderOffered").value(true));
        jdbc.update("UPDATE client SET reminders_excluded = true WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/prefs").andExpect(jsonPath("$.whatsapp.reminderOffered").value(false));

        patchPrefs(token, null, "{\"channels\":{\"whatsapp\":false}}").andExpect(jsonPath("$.channels.whatsapp").value(false)).andExpect(jsonPath("$.whatsapp.optedIn").value(false));
        assertNull(jdbc.queryForObject("SELECT whatsapp_opt_in_at FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), java.sql.Timestamp.class), "off is not consent");
        patchPrefs(token, null, "{\"channels\":{\"whatsapp\":true}}").andExpect(jsonPath("$.channels.whatsapp").value(true)).andExpect(jsonPath("$.whatsapp.optedIn").value(true));
        var first = jdbc.queryForObject("SELECT whatsapp_opt_in_at FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), java.sql.Timestamp.class);
        assertNotNull(first);
        jdbc.update("UPDATE client_prefs SET whatsapp_opt_in_at = whatsapp_opt_in_at - interval '3 days' WHERE client_id = :c::uuid", Map.of("c", c.toString()));
        var backdated = jdbc.queryForObject("SELECT whatsapp_opt_in_at FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), java.sql.Timestamp.class);
        patchPrefs(token, null, "{\"channels\":{\"whatsapp\":false}}").andExpect(jsonPath("$.whatsapp.optedIn").value(true));
        patchPrefs(token, null, "{\"channels\":{\"whatsapp\":true}}").andExpect(status().isOk());
        assertEquals(backdated, jdbc.queryForObject("SELECT whatsapp_opt_in_at FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), java.sql.Timestamp.class), "on again is not a second consent");
        patchPrefs(token, null, "{\"channels\":{\"push\":false}}").andExpect(jsonPath("$.channels.push").value(false)).andExpect(jsonPath("$.channels.whatsapp").value(true));
    }

    @Test
    @DisplayName("privacy: what the trainer sees as data — the health items only if the client's own forms ask any, the count of notes shared and not the private ones, and whether money is the client's to see")
    void privacy() throws Exception {
        UUID c = live();
        note(c, "Shared", true, false, ago(1));
        note(c, "Private one", false, false, ago(1));
        note(c, "Private two", false, false, ago(1));
        String token = tokenFor(phone);
        String out = body(get(token, "/v1/portal/privacy").andExpect(status().isOk()).andExpect(jsonPath("$.trainerName").value("Arun Prakash")).andExpect(jsonPath("$.policyVersion").value("2026-09"))
                .andExpect(jsonPath("$.acceptedAt").isNumber()).andExpect(jsonPath("$.sees", hasSize(5))).andExpect(jsonPath("$.sees[0].key").value("profile")).andExpect(jsonPath("$.sees[2].key").value("assessments"))
                .andExpect(jsonPath("$.sees[2].healthItems").doesNotExist()).andExpect(jsonPath("$.sees[4].key").value("money")).andExpect(jsonPath("$.sees[4].clientCanSee").value(true))
                .andExpect(jsonPath("$.doesNotSee[0]").value("Your other trainers")).andExpect(jsonPath("$.sharedNotes").value(1)).andExpect(jsonPath("$.privateNotesKept").value(true)));
        assertFalse(out.contains("Private") || out.contains("\"2\""), "never the count of private notes");
        // a form that asks a health item names it, in the client's own words
        UUID tpl = UUID.randomUUID();
        jdbc.update("INSERT INTO assessment_template (id, tenant_id, trainer_id, name) SELECT :t::uuid, home_tenant_id, id, 'Health' FROM trainer WHERE id = :tr::uuid", Map.of("t", tpl.toString(), "tr", arun.toString()));
        UUID a = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
                SELECT :a::uuid, tenant_id, trainer_id, id, :t::uuid, 'Health', '{"measurements":[{"key":"visceral","label":"Visceral fat","group":"Body composition","unit":""}],"questions":[{"id":"q_pain","text":"Did anything hurt?","kind":"yesno","scale":null,"options":[],"allowMultiple":false,"allowCustom":false}]}'::jsonb, current_date, now()
                  FROM client WHERE id = :c::uuid""", Map.of("a", a.toString(), "t", tpl.toString(), "c", c.toString()));
        get(token, "/v1/portal/privacy").andExpect(jsonPath("$.sees[2].healthItems", hasSize(2))).andExpect(jsonPath("$.sees[2].healthItems[*]", org.hamcrest.Matchers.hasItems("Visceral fat", "Did anything hurt?")));
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/privacy").andExpect(jsonPath("$.sees[4].clientCanSee").value(false));
    }

    @Test
    @DisplayName("leave: refused until confirmed; then the arrangement ends by the client, the nominee goes, a pending invite is revoked, the money book does not move — and a repeat answers the same 200; the wall follows")
    void leave() throws Exception {
        UUID c = live();
        pack(c);
        patchPrefsDirect(c);
        UUID inv = UUID.randomUUID();
        jdbc.update("INSERT INTO client_invite (id, tenant_id, trainer_id, client_id, phone, token_hash) SELECT :i::uuid, tenant_id, trainer_id, id, phone, md5(random()::text) || md5(random()::text) FROM client WHERE id = :c::uuid", Map.of("i", inv.toString(), "c", c.toString()));
        String token = tokenFor(phone);
        postJson(token, "/v1/portal/leave", "{\"confirm\":false}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("LEAVE_NOT_CONFIRMED"));
        postJson(token, "/v1/portal/leave", "{}").andExpect(status().isBadRequest());
        assertEquals("accepted", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));

        String first = body(postJson(token, "/v1/portal/leave", "{\"confirm\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.access").value("removed")).andExpect(jsonPath("$.removedBy").value("client")).andExpect(jsonPath("$.removedAt").isNumber()));
        var row = jdbc.queryForMap("SELECT membership_status, removed_by FROM client WHERE id = :c::uuid", Map.of("c", c.toString()));
        assertEquals("removed", row.get("membership_status"));
        assertEquals("client", row.get("removed_by"));
        assertNull(jdbc.queryForObject("SELECT nominee_name FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertEquals("revoked", jdbc.queryForObject("SELECT status FROM client_invite WHERE id = :i::uuid", Map.of("i", inv.toString()), String.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM package WHERE client_id = :c::uuid AND deleted_at IS NULL", Map.of("c", c.toString()), Integer.class), "the money book does not move");
        // a repeat: the same body, 200
        assertEquals(first, body(postJson(token, "/v1/portal/leave", "{\"confirm\":true}").andExpect(status().isOk())));
        postJson(token, "/v1/portal/leave", "{\"confirm\":false}").andExpect(status().isOk());
        // now on the removed wall: the portal is closed, the shell's own read is not
        get(token, "/v1/portal/prefs").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_REMOVED"));
        get(token, "/v1/portal/me").andExpect(jsonPath("$.access").value("removed"));
    }

    private void patchPrefsDirect(UUID c) {
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id, nominee_name, nominee_phone) SELECT id, tenant_id, 'Meera Nair', '+919841000001' FROM client WHERE id = :c::uuid", Map.of("c", c.toString()));
    }

    private void pack(UUID c) {
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, '12 sessions', 'floor', 'sessions', 12, 7, 12000, 'INR', current_date, current_date + 60)""", Map.of("t", arun.toString(), "c", c.toString()));
    }

    @Test
    @DisplayName("export: an attachment with only this person's own data — never a private note, never another client, the money only while it is theirs to see — and still available after they have left")
    void export() throws Exception {
        UUID c = live();
        pack(c);
        note(c, "Shared with Priya", true, false, ago(1));
        note(c, "Private to Arun", false, false, ago(1));
        message(c, "note", "See you Friday.", null, ago(1), false);
        UUID s = session(c, null, ago(2), 60, "done", "trainer", ago(2), ago(2).plusSeconds(3000));
        setDone(s, c, ex("Back squat", "quads", "weight_reps"), 60, 8, ago(2));
        UUID other = liveOther();
        note(other, "Somebody else's note", true, false, ago(1));
        message(other, "note", "Somebody else's message", null, ago(1), false);
        pack(other);
        String token = tokenFor(phone);

        var res = get(token, "/v1/portal/export").andExpect(status().isOk()).andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("application/json")))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment; filename=\"inclineyou-data-"))).andExpect(jsonPath("$.arrangements", hasSize(1)))
                .andExpect(jsonPath("$.arrangements[0].trainer").value("Arun Prakash")).andExpect(jsonPath("$.messages[0].body").value("See you Friday.")).andExpect(jsonPath("$.shared_notes", hasSize(1)))
                .andExpect(jsonPath("$.sessions", hasSize(1))).andExpect(jsonPath("$.sessions[0].exercises[0].name").value("Back squat")).andExpect(jsonPath("$.sessions[0].exercises[0].sets[0].load").value(60))
                .andExpect(jsonPath("$.packages", hasSize(1))).andExpect(jsonPath("$.payments", hasSize(0)));
        String out = body(res);
        assertFalse(out.contains("Private to Arun") || out.contains("Somebody else"), "nothing that is not theirs");
        // the money switch off: the keys are null, not an empty list that hints at a book
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", c.toString()));
        get(token, "/v1/portal/export").andExpect(jsonPath("$.packages").value(nullValue())).andExpect(jsonPath("$.payments").value(nullValue())).andExpect(jsonPath("$.messages", hasSize(1)));
        // after leaving, the history is still theirs to take
        postJson(token, "/v1/portal/leave", "{\"confirm\":true}").andExpect(status().isOk());
        get(token, "/v1/portal/export").andExpect(status().isOk()).andExpect(jsonPath("$.messages[0].body").value("See you Friday.")).andExpect(jsonPath("$.arrangements[0].status").value("removed"));
    }

    @Test
    @DisplayName("deleting the account: no ticket is 403, a client can only prove account_deletion, a code and a ticket let it through for the session it was made on, and then the person is erased and every session ends")
    void deleteAccount() throws Exception {
        UUID c = live();
        message(c, "note", "See you Friday.", null, ago(1), false);
        String token = tokenFor(phone);

        mvc.perform(delete("/v1/portal/me").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("STEP_UP_REQUIRED"));
        mvc.perform(delete("/v1/portal/me").header("Authorization", "Bearer " + token).header("X-Step-Up-Ticket", "forged")).andExpect(status().isForbidden());
        postJson(token, "/v1/auth/step-up", "{\"purpose\":\"phone_change\"}").andExpect(status().isBadRequest());
        postJson(token, "/v1/auth/step-up", "{\"purpose\":\"account_deletion\"}").andExpect(status().isNoContent());
        String ticket = com.jayway.jsonpath.JsonPath.read(body(postJson(token, "/v1/auth/step-up/verify", "{\"purpose\":\"account_deletion\",\"otp\":\"" + sender.codeFor(phone) + "\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresAt").isNumber())), "$.ticket");
        // a ticket is for the session it was made on
        String otherSession = tokenFor(phone);
        mvc.perform(delete("/v1/portal/me").header("Authorization", "Bearer " + otherSession).header("X-Step-Up-Ticket", ticket)).andExpect(status().isForbidden());

        // The suite is one long transaction, so now() is the test's first instant — before the sessions it signed in; a real request starts after them.
        jdbc.update("UPDATE web_session SET issued_at = issued_at - interval '1 hour'", Map.of());
        mvc.perform(delete("/v1/portal/me").header("Authorization", "Bearer " + token).header("X-Step-Up-Ticket", ticket)).andExpect(status().isNoContent());
        assertNotNull(jdbc.queryForObject("SELECT erased_at FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), java.sql.Timestamp.class));
        assertNull(jdbc.queryForObject("SELECT name FROM client WHERE id = :c::uuid", Map.of("c", c.toString()), String.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client_message WHERE client_id = :c::uuid", Map.of("c", c.toString()), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM web_session s JOIN app_user u ON u.id = s.app_user_id WHERE u.erased_at IS NOT NULL AND s.revoked_at IS NULL", Map.of(), Integer.class));
        get(token, "/v1/portal/me").andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("push: a subscription belongs to the person and a browser — 201, 200 on a replay, taken over by the same browser coming back; an http address or oversize keys are 400; turning it off revokes, never deletes, and only their own")
    void push() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        UUID id = UUID.randomUUID();
        String sub = "{\"id\":\"" + id + "\",\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc\",\"keys\":{\"p256dh\":\"BN12345\",\"auth\":\"authsecret\"},\"userAgent\":\"Chrome 126 / Android\"}";
        postJson(token, "/v1/portal/push-subscriptions", sub).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id.toString()));
        postJson(token, "/v1/portal/push-subscriptions", sub).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM push_subscription WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/abc'", Map.of(), Integer.class));
        postJson(token, "/v1/portal/push-subscriptions", sub.replace("https://", "http://")).andExpect(status().isBadRequest());
        postJson(token, "/v1/portal/push-subscriptions", sub.replace("BN12345", "B".repeat(101)).replace("/abc", "/def").replace(id.toString(), UUID.randomUUID().toString())).andExpect(status().isBadRequest());
        postJson(token, "/v1/portal/push-subscriptions", sub.replace("\"keys\"", "\"kez\"")).andExpect(status().isBadRequest());

        mvc.perform(delete("/v1/portal/push-subscriptions/" + id).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        var row = jdbc.queryForMap("SELECT revoked_at, revoked_reason FROM push_subscription WHERE id = :i::uuid", Map.of("i", id.toString()));
        assertNotNull(row.get("revoked_at"));
        assertEquals("user", row.get("revoked_reason"));
        mvc.perform(delete("/v1/portal/push-subscriptions/" + id).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        // the same browser turns it back on: re-enabled, not a second row
        postJson(token, "/v1/portal/push-subscriptions", sub).andExpect(status().isOk());
        assertNull(jdbc.queryForObject("SELECT revoked_at FROM push_subscription WHERE id = :i::uuid", Map.of("i", id.toString()), java.sql.Timestamp.class));
        // somebody else's subscription is not theirs to turn off
        UUID other = liveOther2();
        String t2 = tokenFor(phoneOf(other));
        mvc.perform(delete("/v1/portal/push-subscriptions/" + id).header("Authorization", "Bearer " + t2)).andExpect(status().isNotFound());
        assertNull(jdbc.queryForObject("SELECT revoked_at FROM push_subscription WHERE id = :i::uuid", Map.of("i", id.toString()), java.sql.Timestamp.class));
        mvc.perform(delete("/v1/portal/push-subscriptions/" + UUID.randomUUID()).header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the walls: a paused client is 403 PORTAL_PAUSED on prefs and privacy, and only a client session is admitted")
    void walls() throws Exception {
        UUID c = live();
        String token = tokenFor(phone);
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :c::uuid", Map.of("c", c.toString()));
        for (String u : new String[]{"/v1/portal/prefs", "/v1/portal/privacy"}) get(token, u).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PORTAL_PAUSED"));
        patchPrefs(token, null, "{\"hideWeight\":true}").andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/portal/prefs")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/v1/portal/me")).andExpect(status().isUnauthorized());
    }

    private UUID ex(String name, String muscle, String logType) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, muscle_group, equipment, source_id) VALUES (:id::uuid, :n, 'inclineyou', :lt, :m, 'barbell', :src)",
                Map.of("id", id.toString(), "n", name, "lt", logType, "m", muscle, "src", "t-" + id));
        return id;
    }

    private UUID liveOther2() {
        String p = "+9198" + String.format("%08d", (int) (Math.random() * 100_000_000));
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", p));
        return liveRow(arun, p);
    }

    private String phoneOf(UUID client) {
        return jdbc.queryForObject("SELECT phone FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class);
    }

    private String tokenFor(String p) throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + p + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(p) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private UUID live() {
        trainerOnce();
        jdbc.update("INSERT INTO app_user (id, phone, role, privacy_accepted_at, privacy_policy_version) VALUES (gen_random_uuid(), :p, 'client', now(), '2026-09')", Map.of("p", phone));
        return liveRow(arun, phone);
    }

    private UUID liveOther() {
        return liveRow(arun, "+91980000" + String.format("%04d", 1000 + (++seq)));
    }

    private UUID liveRow(UUID trainerId, String p) {
        UUID id = client(trainerId, p, "invited");
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now(), name = 'Priya Nair' WHERE id = :c::uuid", Map.of("c", id.toString()));
        return id;
    }

    private void trainerOnce() {
        me = arun;
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", arun.toString()), String.class));
    }

    private String token() throws Exception {
        return signInToken();
    }

    private UUID program(UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "c", clientId.toString()));
        return id;
    }

    private UUID workout(UUID prog, int week, int day, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, :d, 0, :n)",
                Map.of("id", id.toString(), "t", arun.toString(), "ten", tenant.toString(), "p", prog.toString(), "w", week, "d", day, "n", name));
        return id;
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, :n, 'inclineyou', 'weight_reps', :src)", Map.of("id", id.toString(), "n", name, "src", "t-" + id));
        return id;
    }

    private UUID workoutExercise(UUID workout, UUID ex, int pos) {
        UUID id = UUID.randomUUID();
        // one exercise row per call would make four exercises; the test wants one exercise with four sets, so reuse the row after the first
        var found = jdbc.queryForList("SELECT id::text FROM workout_exercise WHERE workout_id = :w::uuid AND exercise_id = :e::uuid", Map.of("w", workout.toString(), "e", ex.toString()), String.class);
        if (!found.isEmpty()) return UUID.fromString(found.getFirst());
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, :p)",
                Map.of("id", id.toString(), "ten", tenant.toString(), "w", workout.toString(), "e", ex.toString(), "p", pos));
        return id;
    }

    private void workoutSet(UUID we, int rest) {
        int pos = jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", we.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, effort_kind, load_value, effort_value, rest_seconds) VALUES (:ten::uuid, :w::uuid, :p, 'weight', 'reps', 20, 10, :r)",
                Map.of("ten", tenant.toString(), "w", we.toString(), "p", pos, "r", rest));
    }

    private UUID session(UUID clientId, UUID workoutId, Instant at, int minutes, String status, String loggedBy, Instant started, Instant ended) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("w", workoutId == null ? null : workoutId.toString());
        m.put("at", java.sql.Timestamp.from(at)); m.put("m", minutes); m.put("e", java.sql.Timestamp.from(at.plusSeconds(minutes * 60L))); m.put("s", status); m.put("lb", loggedBy);
        m.put("st", started == null ? null : java.sql.Timestamp.from(started)); m.put("en", ended == null ? null : java.sql.Timestamp.from(ended));
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at, ended_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, CAST(:w AS uuid), :at, :m, :e, :s, :lb, :st, :en)""", m);
        return id;
    }

    private void setDone(UUID sessionId, UUID clientId, UUID ex, int load, int reps, Instant at) {
        UUID sx = UUID.fromString(jdbc.queryForList("SELECT id::text FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid",
                Map.of("s", sessionId.toString(), "e", ex.toString()), String.class).stream().findFirst().orElseGet(() -> {
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                    Map.of("x", id.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", ex.toString()));
            return id.toString();
        }));
        int pos = jdbc.queryForObject("SELECT count(*) FROM set_log WHERE session_exercise_id = :x::uuid", Map.of("x", sx.toString()), Integer.class) + 1;
        jdbc.update("INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at) VALUES (:x::uuid, :p, false, 'weight', 'reps', :l, :r, :at)",
                Map.of("x", sx.toString(), "p", pos, "l", load, "r", reps, "at", java.sql.Timestamp.from(at)));
    }

    private UUID message(UUID clientId, String kind, String body, UUID sessionId, Instant at, boolean deleted) {
        UUID id = UUID.randomUUID();
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", arun.toString()); m.put("c", clientId.toString()); m.put("k", kind); m.put("b", body);
        m.put("s", sessionId == null ? null : sessionId.toString()); m.put("at", java.sql.Timestamp.from(at)); m.put("d", deleted);
        jdbc.update("""
                INSERT INTO client_message (id, tenant_id, client_id, trainer_id, session_id, body, kind, at, deleted_at)
                SELECT :id::uuid, tenant_id, id, :t::uuid, CAST(:s AS uuid), :b, :k, :at, CASE WHEN :d THEN now() END FROM client WHERE id = :c::uuid""", m);
        return id;
    }

    private void pack(UUID clientId, int total, int left) {
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining, amount, currency, start_date, end_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, 'Pack', 'floor', 'sessions', :tot, :left, 12000, 'INR', current_date, current_date + 60)""",
                Map.of("t", arun.toString(), "c", clientId.toString(), "tot", total, "left", left));
    }

    private void milestone(UUID clientId, String kind, String label, Instant at) {
        jdbc.update("INSERT INTO milestone (tenant_id, client_id, kind, label, at) SELECT tenant_id, id, :k, :l, :at FROM client WHERE id = :c::uuid",
                Map.of("k", kind, "l", label, "at", java.sql.Timestamp.from(at), "c", clientId.toString()));
    }

    private void assessment(UUID clientId, boolean sent, java.time.LocalDate due) {
        jdbc.update("""
                INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
                SELECT gen_random_uuid(), c.tenant_id, c.trainer_id, c.id, t.id, 'Weekly check-in', '{"measurements":[],"questions":[]}'::jsonb, :d::date, now()
                  FROM client c JOIN assessment_template t ON t.trainer_id = c.trainer_id WHERE c.id = :c::uuid LIMIT 1""",
                Map.of("d", due.toString(), "c", clientId.toString()));
    }

    /** The credential verify answers for this number. */
    private String signInToken() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/v1/auth/otp/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"" + phone + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return JsonPath.read(mvc.perform(post("/v1/auth/otp/verify").header(WEB, "web").contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"" + id + "\",\"otp\":\"" + sender.codeFor(phone) + "\"}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private UUID client(UUID trainerId, String p, String membership) {
        UUID id = UUID.randomUUID();
        String ten = jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :t::uuid", Map.of("t", trainerId.toString()), String.class);
        var m = new java.util.HashMap<String, Object>();
        m.put("id", id.toString()); m.put("t", trainerId.toString()); m.put("ten", ten); m.put("p", p);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', :p, 'independent')", m);
        if ("invited".equals(membership)) jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", m);
        return id;
    }

    private UUID trainer(String p, String name, String headline) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", p));
        String au = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", p), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", au, "n", name));
        UUID id = UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t WHERE app_user_id = :a::uuid", Map.of("a", au), String.class));
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (gen_random_uuid(), :t::uuid, 'Weekly')", Map.of("t", id.toString()));
        return id;
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender portalSettingsCapturingSender() {
            return this;
        }

        @Override
        public void send(String phone, String code) {
            sent.put(phone, code);
        }

        String codeFor(String phone) {
            String code = sent.get(phone);
            if (code == null) throw new AssertionError("no code was sent to " + phone);
            return code;
        }
    }
}
