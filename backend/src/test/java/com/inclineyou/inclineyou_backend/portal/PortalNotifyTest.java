package com.inclineyou.inclineyou_backend.portal;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;


/**
 * Module 11d · the client's settings and bell, and the trainer routes that ring
 * it. Pinned: the gate acts at the moment of sending (a switched-off kind writes
 * nothing, and switching it back on refills nothing); one booking run is one
 * notification; the trainer never reads `client_prefs`; the bell reads 21 days.
 */
@SpringBootTest
@Transactional
class PortalNotifyTest {

    private static final String PHONE = "9100001801";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID asha;
    private UUID meera;

    @BeforeEach
    void setUp() {
        /* Some controllers take `Authentication` as a method argument, which MockMvc
           fills from the request principal — so every request carries whatever the
           test is currently signed in as. */
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").with(r -> {
                    r.setUserPrincipal(SecurityContextHolder.getContext().getAuthentication());
                    return r;
                }))
                .build();
        asha = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, '9100001811', 'Asha')", Map.of("id", asha.toString()));
        meera = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status, accepted_at)
                VALUES (:id::uuid, :t::uuid, 'Meera', :p, 'accepted', now())
                """, Map.of("id", meera.toString(), "t", asha.toString(), "p", PHONE));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── prefs ───────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("prefs: defaults until written; notify merges; nominee is validated, clipped and clearable")
    void prefs() throws Exception {
        asClient();
        mvc.perform(get("/v1/me")).andExpect(jsonPath("$.prefs.notify.sessionReminder").value(true));
        patchPrefs("{\"hideWeight\":true,\"notify\":{\"sessionReminder\":false}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hideWeight").value(true))
                .andExpect(jsonPath("$.notify.sessionReminder").value(false))
                .andExpect(jsonPath("$.notify.programUpdated").value(true));
        patchPrefs("{\"notify\":{\"packChanged\":false}}")
                .andExpect(jsonPath("$.notify.sessionReminder").value(false))
                .andExpect(jsonPath("$.notify.packChanged").value(false))
                .andExpect(jsonPath("$.hideWeight").value(true));
        patchPrefs("{\"nominee\":{\"name\":\"  Ravi Iyer  \",\"phone\":\"+91 98450 12345\"}}")
                .andExpect(jsonPath("$.nominee.name").value("Ravi Iyer"))
                .andExpect(jsonPath("$.nominee.phone").value("9845012345"));
        patchPrefs("{\"nominee\":{\"name\":\" \",\"phone\":\"9845012345\"}}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("nominee.name: required"));
        patchPrefs("{\"nominee\":{\"name\":\"Ravi\",\"phone\":\"12345\"}}").andExpect(status().isBadRequest());
        patchPrefs("{\"hideWeight\":false}").andExpect(jsonPath("$.nominee.name").value("Ravi Iyer"));
        patchPrefs("{\"nominee\":null}").andExpect(jsonPath("$.nominee").doesNotExist());
        mvc.perform(get("/v1/me")).andExpect(jsonPath("$.prefs.notify.packChanged").value(false));
    }

    /* ── the trainer routes that ring the client's bell ──────────────────── */

    @Test
    @DisplayName("sessions: booked, moved and cancelled each ring once; a switched-off kind writes nothing, ever")
    void sessions() throws Exception {
        asTrainer();
        long at = System.currentTimeMillis() + 86_400_000L;
        String id = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + meera + "\",\"scheduledAt\":" + at + "}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(put("/v1/sessions/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"scheduledAt\":" + (at + 3_600_000L) + "}")).andExpect(status().isOk());
        mvc.perform(put("/v1/sessions/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"notes\":\"bring a band\"}")).andExpect(status().isOk());       // bookkeeping: nothing
        mvc.perform(put("/v1/sessions/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"cancelled\"}")).andExpect(status().isOk());

        asClient();
        mvc.perform(get("/v1/me/notifications"))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[*].text", org.hamcrest.Matchers.containsInAnyOrder("booked", "moved", "cancelled")))
                .andExpect(jsonPath("$[?(@.text == 'moved')].subjectAt", org.hamcrest.Matchers.contains(at + 3_600_000L)));

        patchPrefs("{\"notify\":{\"sessionReminder\":false}}");
        asTrainer();
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + meera + "\",\"scheduledAt\":" + (at + 7 * 86_400_000L) + "}")).andExpect(status().isCreated());
        asClient();
        mvc.perform(get("/v1/me/notifications")).andExpect(jsonPath("$.length()").value(3));
        patchPrefs("{\"notify\":{\"sessionReminder\":true}}");
        mvc.perform(get("/v1/me/notifications")).andExpect(jsonPath("$.length()").value(3));   // nothing refilled
    }

    @Test
    @DisplayName("a pack sold, and money recorded, each ring once with the amount")
    void money() throws Exception {
        asTrainer();
        String pkg = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/clients/" + meera + "/packages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"session_pack\",\"sessionsTotal\":12,\"amount\":6000}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/v1/packages/" + pkg + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount\":2000,\"method\":\"cash\",\"collectedBy\":\"trainer\",\"paidAt\":" + System.currentTimeMillis() + "}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/v1/packages/" + pkg + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount\":500,\"method\":\"upi_intent\",\"collectedBy\":\"trainer\"}"))
                .andExpect(status().isCreated());                                      // pending: not news yet
        asClient();
        mvc.perform(get("/v1/me/notifications"))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.text == 'sold')].amount", org.hamcrest.Matchers.contains(6000.0)))
                .andExpect(jsonPath("$[?(@.text == 'cash')].amount", org.hamcrest.Matchers.contains(2000.0)));
    }

    @Test
    @DisplayName("plans: apply is NEW (subjectAt == at); a rename is CHANGED; notify answers sent:false when switched off")
    void plans() throws Exception {
        asTrainer();
        String tpl = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/templates").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Foundations\"}")).andReturn().getResponse().getContentAsString(), "$.id");
        String program = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/templates/" + tpl + "/apply")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + meera + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.update("UPDATE program SET created_at = now() - interval '3 days' WHERE id = :id::uuid", Map.of("id", program));
        mvc.perform(put("/v1/programs/" + program).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Foundations II\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/v1/programs/" + program + "/notify")).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(true));

        asClient();
        String feed = mvc.perform(get("/v1/me/notifications")).andExpect(jsonPath("$.length()").value(3))
                .andReturn().getResponse().getContentAsString();
        java.util.List<Map<String, Object>> rows = com.jayway.jsonpath.JsonPath.read(feed, "$[?(@.text == 'Foundations')]");
        org.assertj.core.api.Assertions.assertThat(rows).singleElement()
                .satisfies(r -> org.assertj.core.api.Assertions.assertThat(r.get("subjectAt")).isEqualTo(r.get("at")));

        patchPrefs("{\"notify\":{\"programUpdated\":false}}");
        asTrainer();
        mvc.perform(post("/v1/programs/" + program + "/notify")).andExpect(jsonPath("$.sent").value(false));
        signedInAs(UUID.randomUUID().toString(), "ROLE_TRAINER");
        mvc.perform(post("/v1/programs/" + program + "/notify")).andExpect(status().isNotFound());
    }

    /* ── the client's bell ───────────────────────────────────────────────── */

    @Test
    @DisplayName("the bell: 21 days, newest first; mark one is idempotent; mark all is one call; not theirs is 404")
    void bell() throws Exception {
        mint("booked", "now() - interval '2 hours'");
        mint("moved", "now() - interval '1 hour'");
        mint("old", "now() - interval '22 days'");
        asClient();
        String feed = mvc.perform(get("/v1/me/notifications"))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].text").value("moved"))
                .andExpect(jsonPath("$[0].clientId").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(feed, "$[0].id");
        mvc.perform(post("/v1/me/notifications/" + id + "/read")).andExpect(jsonPath("$.readAt").isNumber());
        mvc.perform(post("/v1/me/notifications/" + UUID.randomUUID() + "/read")).andExpect(status().isNotFound());
        mvc.perform(post("/v1/me/notifications/read")).andExpect(status().isOk()).andExpect(jsonPath("$.readAt").isNumber());
        mvc.perform(get("/v1/me/notifications")).andExpect(jsonPath("$[1].readAt").isNumber());
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private void mint(String text, String at) {
        jdbc.queryForObject("SELECT mint_client_notification(:c::uuid, 'session', NULL, now(), :t)::text",
                Map.of("c", meera.toString(), "t", text), String.class);
        jdbc.update("UPDATE client_notification SET at = %s WHERE text = :t AND client_id = :c::uuid".formatted(at),
                Map.of("t", text, "c", meera.toString()));
    }

    private org.springframework.test.web.servlet.ResultActions patchPrefs(String body) throws Exception {
        asClient();
        return mvc.perform(patch("/v1/me/prefs").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void asTrainer() { signedInAs(asha.toString(), "ROLE_TRAINER"); }

    private void asClient() { signedInAs(PHONE, "ROLE_CLIENT"); }

    private void signedInAs(String subject, String role) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(subject, null, AuthorityUtils.createAuthorityList(role)));
    }
}
