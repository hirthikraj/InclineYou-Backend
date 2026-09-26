package com.inclineyou.inclineyou_backend.trainer;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;


/**
 * V6 · trainer gender, over HTTP.
 *
 * The regression this guards is the one that made the column: the setup flow's
 * step 1 counts as answered only with a gender, so a PATCH that silently drops
 * the field is a trainer who can never finish setup. Beyond the round trip, two
 * rules: {@code undisclosed} is stored as an answer rather than read as a
 * blank, and an id outside the four is refused with a sentence rather than
 * stored verbatim.
 */
@SpringBootTest
@Transactional
class TrainerGenderTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100000601', 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of());
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = '+919100000601'", Map.of(), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, 'G')
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId));
        UUID me = UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("never asked reads back null")
    void absentByDefault() throws Exception {
        mvc.perform(get("/v1/trainers/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gender").doesNotExist());
    }

    @Test
    @DisplayName("undisclosed is an answer, and null on a later PATCH leaves it alone")
    void undisclosedSticks() throws Exception {
        patchMe("{\"name\":\"Asha\",\"gender\":\"undisclosed\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gender").value("undisclosed"));
        patchMe("{\"headline\":\"Coach\"}")
                .andExpect(jsonPath("$.gender").value("undisclosed"));
    }

    @Test
    @DisplayName("an empty string clears it")
    void blankClears() throws Exception {
        patchMe("{\"gender\":\"woman\"}").andExpect(jsonPath("$.gender").value("woman"));
        patchMe("{\"gender\":\"\"}").andExpect(jsonPath("$.gender").doesNotExist());
    }

    @Test
    @DisplayName("an unknown id is a typed 400 with a sentence, and stores nothing")
    void unknownRefused() throws Exception {
        patchMe("{\"gender\":\"Prefer not to say\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("undisclosed")));
        mvc.perform(get("/v1/trainers/me")).andExpect(jsonPath("$.gender").doesNotExist());
    }

    private org.springframework.test.web.servlet.ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }
}
