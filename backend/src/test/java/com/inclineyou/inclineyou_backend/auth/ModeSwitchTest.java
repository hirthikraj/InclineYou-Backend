package com.inclineyou.inclineyou_backend.auth;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * `POST /v1/auth/mode/trainer` and `/mode/client` — the two endpoints a phone
 * that holds both identities uses to flip between them without a fresh
 * sign-in. The security filters are deliberately not in this chain (see
 * {@code PhoneAvailabilityTest}); {@code AuthController#callerPhone} is what
 * is under test, so the authentication is set directly, once as a trainer
 * token (subject = trainer UUID) and once as a client token (subject = phone).
 */
@SpringBootTest
@Transactional
class ModeSwitchTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private static final String TRAINER_PHONE = "9300000001";
    private static final String COACH_PHONE = "9300000002";

    private UUID trainerId;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        trainerId = trainer(TRAINER_PHONE);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a trainer with a live membership elsewhere switches into client mode")
    void trainerSwitchesToClient() throws Exception {
        UUID coach = trainer(COACH_PHONE);
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status, invited_at, accepted_at, client_type)
                VALUES (gen_random_uuid(), :tid::uuid, 'Ravi', :p, 'accepted', NOW(), NOW(), 'independent')
                """, Map.of("tid", coach.toString(), "p", "+91" + TRAINER_PHONE));

        authenticateAsTrainer(trainerId);

        mvc.perform(post("/v1/auth/mode/client"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("client"))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.clientOf[0].trainerId").value(coach.toString()));
    }

    @Test
    @DisplayName("a trainer with no membership anywhere gets a 404 switching to client mode")
    void trainerWithNoMembershipCannotSwitch() throws Exception {
        authenticateAsTrainer(trainerId);

        mvc.perform(post("/v1/auth/mode/client"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a client whose number also owns a trainer account switches into trainer mode")
    void clientSwitchesToTrainer() throws Exception {
        authenticateAsClient("+91" + TRAINER_PHONE);

        mvc.perform(post("/v1/auth/mode/trainer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("trainer"))
                .andExpect(jsonPath("$.trainerId").value(trainerId.toString()));
    }

    @Test
    @DisplayName("a number with no trainer account gets a 404 switching to trainer mode")
    void nonTrainerCannotSwitchToTrainer() throws Exception {
        authenticateAsClient("9300000099");

        mvc.perform(post("/v1/auth/mode/trainer"))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    private void authenticateAsTrainer(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    private void authenticateAsClient(String phone) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        phone, null, AuthorityUtils.createAuthorityList("ROLE_CLIENT")));
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", e164));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }
}
