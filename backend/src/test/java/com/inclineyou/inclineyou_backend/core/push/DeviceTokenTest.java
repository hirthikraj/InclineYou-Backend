package com.inclineyou.inclineyou_backend.core.push;

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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@code /v1/devices/token}: the app registers its FCM token after sign-in, replaces it on refresh and clears it on sign-out. */
@SpringBootTest
@Transactional
class DeviceTokenTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired jakarta.persistence.EntityManager em;

    private MockMvc mvc;
    private UUID me;

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), '+919100000903', 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of());
        String appUser = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = '+919100000903'", Map.of(), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUser));
        me = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUser), String.class));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private String token() {
        em.flush();   // the trainer is a JPA entity: its change reaches the row only when flushed
        return jdbc.queryForObject("SELECT fcm_token FROM trainer WHERE id = :id::uuid", Map.of("id", me.toString()), String.class);
    }

    @Test
    @DisplayName("register stores the token, a refresh replaces it, and sign-out clears it (twice is fine)")
    void lifecycle() throws Exception {
        mvc.perform(post("/v1/devices/token").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"  abc123  \",\"platform\":\"android\"}"))
                .andExpect(status().isNoContent());
        assertEquals("abc123", token());
        mvc.perform(post("/v1/devices/token").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"def456\"}"))
                .andExpect(status().isNoContent());
        assertEquals("def456", token());
        mvc.perform(delete("/v1/devices/token")).andExpect(status().isNoContent());
        assertNull(token());
        mvc.perform(delete("/v1/devices/token")).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("a blank or missing token is a 400 and changes nothing")
    void blankIsRefused() throws Exception {
        mvc.perform(post("/v1/devices/token").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"keep\"}")).andExpect(status().isNoContent());
        for (String body : new String[]{"{\"token\":\"   \"}", "{\"platform\":\"ios\"}", "{}"}) {
            mvc.perform(post("/v1/devices/token").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        assertEquals("keep", token());
    }
}
