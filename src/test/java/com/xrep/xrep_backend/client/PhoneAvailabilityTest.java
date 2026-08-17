package com.xrep.xrep_backend.client;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The add form's pre-flight, over HTTP.
 *
 * The rule itself is pinned in {@code SyncMembershipTest}; what this covers is
 * the wiring, which failed in a way worth a regression test. Asked as
 * `GET /v1/clients/phone-availability?phone=…`, the path was matched against
 * `GET /v1/clients/{id}`, Spring could not turn "phone-availability" into a
 * UUID, and the answer was a 400 that looked exactly like a rejected phone
 * number. It is a POST now — a phone number does not belong in a URL — and
 * these fail loudly if it ever resolves to the wrong handler again.
 *
 * The security filters are deliberately not in this chain. The controller reads
 * the trainer straight off the `SecurityContextHolder`, so setting it here
 * tests the routing and the answer without also re-testing the JWT filter.
 */
@SpringBootTest
@Transactional
class PhoneAvailabilityTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private static final String TRAINER_PHONE = "9100000011";
    private static final String FREE_PHONE = "9100000012";
    private static final String ROSTER_PHONE = "9100000013";

    private UUID asker;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();

        asker = trainer("9100000010");
        trainer(TRAINER_PHONE);
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", TRAINER_PHONE));

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        asker.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a free number comes back available")
    void freeNumber() throws Exception {
        ask(FREE_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    @DisplayName("a trainer's number comes back with the reason, not a 400")
    void trainersNumber() throws Exception {
        ask(TRAINER_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.code").value(ClientPhoneGuard.CODE_TRAINER))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    @DisplayName("a number already on the asker's own roster names the client who has it")
    void ownRosterNumber() throws Exception {
        ownClient(ROSTER_PHONE, "Meera", "accepted");

        ask(ROSTER_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.code").value(ClientPhoneGuard.CODE_OWN_ROSTER))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Meera")));
    }

    @Test
    @DisplayName("the asker's own ARCHIVED client frees the number again")
    void ownArchivedClientDoesNotBlock() throws Exception {
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, status, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'archived', 'removed')
                """, Map.of("tid", asker.toString(), "p", ROSTER_PHONE));

        ask(ROSTER_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    @DisplayName("an empty number is a 400 — and now that is the only thing a 400 means")
    void emptyNumber() throws Exception {
        ask("").andExpect(status().isBadRequest());
    }

    /* ------------------------------------------------------------- fixtures */

    private ResultActions ask(String phone) throws Exception {
        return mvc.perform(post("/v1/clients/phone-availability")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"%s\"}".formatted(phone)));
    }

    private void ownClient(String phone, String name, String membership) {
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, :name, :p, :m)
                """, Map.of("tid", asker.toString(), "name", name, "p", phone, "m", membership));
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone",
                Map.of("phone", phone), String.class));
    }
}
