package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.token.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A step-up ticket is a second factor carried beside the bearer token, never one (20 Nov 2026). Through the security
 * chain: presented as the Authorization header it signs nobody in, even on the routes that admit any signed-in caller
 * (/v1/auth/sessions, POST /v1/trainers); the same trainer's real token still does.
 */
@SpringBootTest
@Transactional
class StepUpTicketBearerTest {

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired JwtService jwt;

    private MockMvc mvc;
    private UUID trainer;
    private final String phone = "+919100001082";

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
    }

    @Test
    @DisplayName("a ticket as the bearer token is refused on the any-signed-in routes; the trainer's own token is not")
    void ticketIsNotABearer() throws Exception {
        String ticket = jwt.generateStepUpTicket(trainer, phone, "account_deletion", "x");
        mvc.perform(get("/v1/auth/sessions").header("Authorization", "Bearer " + ticket))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/trainers").header("Authorization", "Bearer " + ticket)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());

        String token = jwt.build(trainer.toString(), phone, JwtService.ROLE_TRAINER, null);
        mvc.perform(get("/v1/auth/sessions").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
    }
}
