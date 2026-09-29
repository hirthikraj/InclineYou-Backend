package com.inclineyou.inclineyou_backend.core.client;

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

    private static final String ASKER_PHONE = "+919100000010";
    private static final String TRAINER_PHONE = "+919100000011";
    private static final String FREE_PHONE = "+919100000012";
    private static final String ROSTER_PHONE = "+919100000013";

    private UUID asker;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();

        asker = trainer(ASKER_PHONE);
        trainer(TRAINER_PHONE);

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
    @DisplayName("another trainer's number is addable now — trainer/client duality is allowed")
    void anotherTrainersNumberIsAvailable() throws Exception {
        ask(TRAINER_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    @DisplayName("the asker's own number still comes back with the reason, not a 400")
    void ownNumber() throws Exception {
        ask(ASKER_PHONE)
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
    @DisplayName("the asker's own ARCHIVED client is named, so the flow can offer a restore (1.1 A4)")
    void ownArchivedClientIsOffered() throws Exception {
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, status, archived_at, archive_reason,
                                    membership_status, removed_at, client_type)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'archived', now(), 'other',
                        'removed', now(), 'independent')
                """, Map.of("tid", asker.toString(), "p", ROSTER_PHONE));

        ask(ROSTER_PHONE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.code").value(ClientPhoneGuard.CODE_OWN_ROSTER))
                .andExpect(jsonPath("$.clientStatus").value("archived"));
    }

    @Test
    @DisplayName("an empty number is a 400 — and now that is the only thing a 400 means")
    void emptyNumber() throws Exception {
        ask("").andExpect(status().isBadRequest());
    }

    /* ------------------------------------------------------------- fixtures */

    private ResultActions ask(String phone) throws Exception {
        return mvc.perform(post("/v1/clients/phone-check")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"%s\"}".formatted(phone)));
    }

    private void ownClient(String phone, String name, String membership) {
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status, invited_at, accepted_at, client_type)
                VALUES (gen_random_uuid(), :tid::uuid, :name, :p, :m, now(),
                        CASE WHEN :m = 'accepted' THEN now() END, 'independent')
                """, Map.of("tid", asker.toString(), "name", name, "p", phone, "m", membership));
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", phone), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }
}
