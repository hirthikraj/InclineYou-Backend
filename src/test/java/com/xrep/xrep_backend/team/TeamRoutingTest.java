package com.xrep.xrep_backend.team;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The wiring, over HTTP — because this namespace has the exact shape of a bug
 * this repo has already had once.
 *
 * `/v1/team/members/me` sits beside `/v1/team/members/{id}`, and
 * `/v1/team/invites/phone-availability` beside `/v1/team/invites/{id}`. That is
 * how `GET /v1/clients/phone-availability` came to be matched against
 * `GET /v1/clients/{id}`: Spring could not turn "phone-availability" into a UUID
 * and answered a 400 that looked exactly like a rejected phone number. These
 * fail loudly if either literal ever resolves to the wrong handler.
 *
 * Also pinned here: the 204 for a trainer with no team, which is a status the app
 * branches on and not an error.
 *
 * The security filters are deliberately not in this chain — the controller reads
 * the trainer straight off the `SecurityContextHolder`, so setting it here tests
 * the routing and the answer without re-testing the JWT filter.
 */
@SpringBootTest
@Transactional
class TeamRoutingTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, 'Ravi')",
                Map.of("id", owner.toString(), "p", "9400000001"));
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", "9400000001"));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        owner.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @Test
    @DisplayName("no team is a 204, not an error and not an empty object")
    void noTeamIs204() throws Exception {
        mvc.perform(get("/v1/team")).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("create then read round-trips through the real routes")
    void createAndRead() throws Exception {
        mvc.perform(post("/v1/team")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Iron House\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.myRole").value("owner"))
                .andExpect(jsonPath("$.activeMembers").value(1));

        mvc.perform(get("/v1/team"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Iron House"));

        mvc.perform(get("/v1/team/members"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].role").value("owner"));
    }

    @Test
    @DisplayName("`invites/phone-availability` is not parsed as an invite id")
    void phoneAvailabilityIsNotAnId() throws Exception {
        mvc.perform(post("/v1/team").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Iron House\"}"));

        mvc.perform(post("/v1/team/invites/phone-availability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"9400000009\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));

        // Its own number, through the same route: available:false with a code,
        // and still a 200 — nothing failed, a question was answered.
        mvc.perform(post("/v1/team/invites/phone-availability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"9400000001\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.code").value(TeamPhoneGuard.CODE_IS_SELF));
    }

    @Test
    @DisplayName("`members/me` is not parsed as a member id")
    void leaveIsNotAnId() throws Exception {
        mvc.perform(post("/v1/team").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Iron House\"}"));

        // The owner cannot leave — 422 with a code, which is the answer from the
        // handler and proof the literal route was matched. A 400 here would mean
        // "me" had been handed to the UUID converter instead.
        mvc.perform(delete("/v1/team/members/me"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CANNOT_REMOVE_OWNER"));
    }

    @Test
    @DisplayName("a team rule refusal is RFC-7807 with the code the app branches on")
    void refusalsCarryTheirCode() throws Exception {
        mvc.perform(get("/v1/team/members"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TEAM_MEMBERSHIP_REQUIRED"))
                .andExpect(jsonPath("$.detail").isString());
    }
}
