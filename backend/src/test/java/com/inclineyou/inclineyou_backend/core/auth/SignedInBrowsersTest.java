package com.inclineyou.inclineyou_backend.core.auth;

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

import jakarta.persistence.EntityManager;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Settings v1.1 · the signed-in browsers — {@code /v1/auth/sessions}.
 *
 * <p>The properties worth pinning, none of them the CRUD: the list says which row is
 * THIS browser; revoking is scoped to the caller so another account's session id is
 * indistinguishable from a gone one (204, nothing to probe); {@code current} is
 * sign-out; {@code ?scope=others} keeps this one; and every revoke writes a reason,
 * because {@code web_session_revoked} refuses a revoked row without one.
 *
 * <p>Runs without the security filter chain (the suite's convention): the caller is
 * set on the context and the raw token goes in as the request attribute the filter
 * would have set.
 */
@SpringBootTest
@Transactional
class SignedInBrowsersTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired EntityManager em;

    private MockMvc mvc;
    private UUID trainerId;
    private UUID appUserId;
    private UUID otherAppUserId;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        trainerId = newTrainer();
        appUserId = appUserOf(trainerId);
        otherAppUserId = appUserOf(newTrainer());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("the list is the caller's live sessions only, with exactly one marked current")
    void listMarksCurrent() throws Exception {
        String here = session(appUserId, "Chrome");
        session(appUserId, "Safari");
        session(otherAppUserId, "Firefox");          // somebody else's — must not appear
        revokedSession(appUserId);                   // ended — must not appear

        mvc.perform(get("/v1/auth/sessions").requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[?(@.current == true)].userAgent").value("Chrome"))
                .andExpect(jsonPath("$.items[?(@.current == false)].userAgent").value("Safari"));
    }

    @Test
    @DisplayName("revoking one writes a reason; somebody else's id is a quiet 204 that changes nothing")
    void revokeOne() throws Exception {
        String here = session(appUserId, "Chrome");
        String other = session(appUserId, "Safari");
        String strangers = session(otherAppUserId, "Firefox");

        mvc.perform(delete("/v1/auth/sessions/" + idOf(other))
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());
        assertThat(reasonOf(other)).isEqualTo("sign_out");

        mvc.perform(delete("/v1/auth/sessions/" + idOf(strangers))
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());
        assertThat(reasonOf(strangers)).isNull();

        // Idempotent: the same id again, and an id that never existed.
        mvc.perform(delete("/v1/auth/sessions/" + idOf(other))
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/v1/auth/sessions/" + UUID.randomUUID())
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());

        // A malformed id is the caller's bug, not a missing session.
        mvc.perform(delete("/v1/auth/sessions/not-a-uuid")
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("\"current\" is sign-out: this browser's session ends")
    void revokeCurrent() throws Exception {
        String here = session(appUserId, "Chrome");
        mvc.perform(delete("/v1/auth/sessions/current")
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());
        assertThat(reasonOf(here)).isEqualTo("sign_out");
    }

    @Test
    @DisplayName("?scope=others ends everything but this browser; any other scope is a 400")
    void revokeOthers() throws Exception {
        String here = session(appUserId, "Chrome");
        String a = session(appUserId, "Safari");
        String b = session(appUserId, "Edge");
        String strangers = session(otherAppUserId, "Firefox");

        mvc.perform(delete("/v1/auth/sessions").param("scope", "all")
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/v1/auth/sessions")
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isBadRequest());

        mvc.perform(delete("/v1/auth/sessions").param("scope", "others")
                        .requestAttr(AuthTokenFilter.TOKEN_ATTRIBUTE, here))
                .andExpect(status().isNoContent());

        assertThat(reasonOf(here)).isNull();
        assertThat(reasonOf(a)).isEqualTo("sign_out_all");
        assertThat(reasonOf(b)).isEqualTo("sign_out_all");
        assertThat(reasonOf(strangers)).isNull();
    }

    /* ------------------------------------------------------------ fixtures */

    private UUID newTrainer() {
        String phone = "+919" + String.format("%09d", ThreadLocalRandom.current().nextInt(0, 1_000_000_000));
        UUID user = UUID.randomUUID();
        UUID trainer = UUID.randomUUID();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (:id::uuid, :p, 'trainer')",
                Map.of("id", user.toString(), "p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (:id::uuid, :u::uuid, :n)",
                Map.of("id", trainer.toString(), "u", user.toString(), "n", phone));
        return trainer;
    }

    private UUID appUserOf(UUID trainer) {
        return UUID.fromString(jdbc.queryForObject("SELECT app_user_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
    }

    /** A live session; returns its raw token. */
    private String session(UUID user, String userAgent) {
        String raw = SessionTokenIssuer.PREFIX + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO web_session (token_hash, app_user_id, role, issued_at, last_seen_at, expires_at, user_agent)
                VALUES (:h, :u::uuid, 'trainer', now() - interval '1 hour', now(), now() + interval '1 day', :ua)
                """, Map.of("h", SessionTokenIssuer.hash(raw), "u", user.toString(), "ua", userAgent));
        return raw;
    }

    private void revokedSession(UUID user) {
        String raw = session(user, "Old");
        jdbc.update("UPDATE web_session SET revoked_at = now(), revoked_reason = 'sign_out' WHERE token_hash = :h",
                Map.of("h", SessionTokenIssuer.hash(raw)));
    }

    private String idOf(String raw) {
        return jdbc.queryForObject("SELECT id::text FROM web_session WHERE token_hash = :h",
                Map.of("h", SessionTokenIssuer.hash(raw)), String.class);
    }

    private String reasonOf(String raw) {
        em.flush();
        return jdbc.queryForObject("SELECT revoked_reason FROM web_session WHERE token_hash = :h",
                Map.of("h", SessionTokenIssuer.hash(raw)), String.class);
    }
}
