package com.inclineyou.inclineyou_backend.core.invite;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, inv-a1: opening an invite link. Pins what the card says (the trainer, a masked number, when it lapses, the
 * notice and its plain lines), that every kind of dead link answers the same thing byte for byte, that {@code used} is its own
 * answer, and that opening a link changes nothing — WhatsApp fetches the links it is shown.
 */
@SpringBootTest
@Transactional
class InviteCardApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc trainerMvc;
    /** No principal at all: the invite page has no session. */
    private MockMvc publicMvc;
    private UUID me, client;

    @BeforeEach
    void setUp() {
        me = trainer("+919100002101", "Arun Prakash");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        trainerMvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        publicMvc = MockMvcBuilders.webAppContextSetup(context).build();
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class));
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya Nair', '+919841022119', 'independent')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a live link: the trainer's card, the number masked to its last four, the expiry, the notice and five plain lines — and no hash, no id of the client, no full number")
    void validCard() throws Exception {
        jdbc.update("""
                UPDATE trainer_business SET headline = 'Strength & fat-loss, Koramangala', bio = 'Ten years on the floor.',
                       intro_video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', instagram_url = 'https://www.instagram.com/arun.fit/',
                       certifications = '["acsm_cpt"]'::jsonb, specialities = '["strength"]'::jsonb, languages = '["en","ta"]'::jsonb
                 WHERE trainer_id = :t::uuid""", Map.of("t", me.toString()));
        String token = mint();
        String body = publicMvc.perform(get("/v1/invites/" + token)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.state").value("valid"))
                .andExpect(jsonPath("$.phoneMasked").value("•••••2119"))
                .andExpect(jsonPath("$.expiresAt").isNumber())
                .andExpect(jsonPath("$.inviteId").isString())
                .andExpect(jsonPath("$.policyVersion").value("2026-09"))
                .andExpect(jsonPath("$.privacySummary.length()").value(5))
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash"))
                .andExpect(jsonPath("$.trainer.headline").value("Strength & fat-loss, Koramangala"))
                .andExpect(jsonPath("$.trainer.bio").value("Ten years on the floor."))
                .andExpect(jsonPath("$.trainer.introVideoId").value("dQw4w9WgXcQ"))
                .andExpect(jsonPath("$.trainer.instagramHandle").value("@arun.fit"))
                .andExpect(jsonPath("$.trainer.youtubeHandle").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.trainer.certifications[0]").value("acsm_cpt"))
                .andExpect(jsonPath("$.trainer.languages.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        long expiresAt = ((Number) JsonPath.read(body, "$.expiresAt")).longValue();
        long fourteenDays = 14L * 24 * 3600 * 1000;
        assertTrue(Math.abs(expiresAt - (System.currentTimeMillis() + fourteenDays)) < 5 * 60_000, "14 days from now, give or take: " + expiresAt);
        assertFalse(body.contains("919841022119"), "the full number never reaches the page");
        assertFalse(body.contains(client.toString()), "nor does the client's id");
        assertFalse(body.contains(token), "nor the token, nor its hash");
    }

    @Test
    @DisplayName("a trainer with nothing written yet still has a card: blanks are null, never invented")
    void bareTrainer() throws Exception {
        publicMvc.perform(get("/v1/invites/" + mint())).andExpect(status().isOk())
                .andExpect(jsonPath("$.trainer.name").value("Arun Prakash"))
                .andExpect(jsonPath("$.trainer.headline").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.trainer.introVideoId").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @DisplayName("every dead link is the same answer: unknown, malformed, expired, replaced, revoked and declined read {state: expired}, byte for byte")
    void deadLinksAreOneAnswer() throws Exception {
        String expired = "{\"state\":\"expired\"}";

        assertEquals(expired, body("/v1/invites/" + "A".repeat(43)), "unknown");
        assertEquals(expired, body("/v1/invites/short"), "malformed, never reaches the database");
        assertEquals(expired, body("/v1/invites/" + "!".repeat(43)), "malformed");

        String replaced = mint();
        String live = mint();
        assertEquals(expired, body("/v1/invites/" + replaced), "replaced by a resend");
        publicMvc.perform(get("/v1/invites/" + live)).andExpect(jsonPath("$.state").value("valid"));

        jdbc.update("UPDATE client_invite SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals(expired, body("/v1/invites/" + live), "past its 14 days");

        String again = mint();
        publicMvc.perform(get("/v1/invites/" + again)).andExpect(jsonPath("$.state").value("valid"));
        jdbc.update("UPDATE client_invite SET status = 'declined', declined_at = now(), decline_reason = 'not_for_me' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals(expired, body("/v1/invites/" + again), "declined");

        String revoked = mint();
        jdbc.update("UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals(expired, body("/v1/invites/" + revoked), "revoked by the trainer");
    }

    @Test
    @DisplayName("an accepted link is `used`, which tells the page to say Sign in — and nothing else about it")
    void usedLink() throws Exception {
        String token = mint();
        jdbc.update("UPDATE client_invite SET status = 'accepted', accepted_at = now(), policy_version = '2026-09' WHERE status = 'pending' AND client_id = :c::uuid", Map.of("c", client.toString()));
        assertEquals("{\"state\":\"used\"}", body("/v1/invites/" + token));
    }

    @Test
    @DisplayName("opening a link changes nothing: no row, no timestamp, no membership moves, however many times")
    void readsOnly() throws Exception {
        String token = mint();
        String before = snapshot();
        for (int i = 0; i < 3; i++) publicMvc.perform(get("/v1/invites/" + token)).andExpect(status().isOk());
        publicMvc.perform(get("/v1/invites/" + "B".repeat(43))).andExpect(status().isOk());
        assertEquals(before, snapshot());
        assertEquals("invited", jdbc.queryForObject("SELECT membership_status FROM client WHERE id = :c::uuid", Map.of("c", client.toString()), String.class));
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private String body(String path) throws Exception {
        return publicMvc.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String snapshot() {
        return jdbc.queryForList("SELECT status, updated_at::text AS u, expires_at::text AS e FROM client_invite ORDER BY id", Map.of()).toString()
                + jdbc.queryForList("SELECT membership_status, updated_at::text AS u FROM client ORDER BY id", Map.of()).toString();
    }

    /** A real link, minted through the trainer's own route — the only way the product ever makes one. */
    private String mint() throws Exception {
        String link = JsonPath.read(trainerMvc.perform(post("/v1/clients/" + client + "/invites")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.link");
        return link.substring(link.lastIndexOf('/') + 1);
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
