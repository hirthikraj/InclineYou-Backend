package com.inclineyou.inclineyou_backend.core.client;

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

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * `membershipStatus` on the roster response.
 *
 * <p>V18's column has always travelled in the sync envelope and never on this
 * response, and the omission cost the roster a whole attention band. The band
 * fires on {@code 'unavailable'} — a number the trainer typed that already signs
 * in as a trainer account, so the invitation can never be delivered. The row
 * needs a <i>Fix number</i> action rather than a silent wait, and the online half
 * had no way to know it was in that state at all.
 *
 * <p>It is the state of the INVITATION, which is why it is a second field rather
 * than more values on {@code status}: that one is the trainer's view of the
 * arrangement, and a single column would have to answer to two people who can
 * disagree.
 */
@SpringBootTest
@Transactional
class RosterFieldsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000070");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("an unreachable number reaches the roster as `unavailable`")
    void membershipStatusIsOnTheList() throws Exception {
        client("Meera", "unavailable");

        mvc.perform(get("/v1/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].membershipStatus").value("unavailable"))
                // Distinct from `status`, which says nothing about the invite.
                .andExpect(jsonPath("$[0].status").value("active"));
    }

    @Test
    @DisplayName("the client file carries it too")
    void membershipStatusIsOnTheDetail() throws Exception {
        var id = client("Rajesh", "invited");

        mvc.perform(get("/v1/clients/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.membershipStatus").value("invited"));
    }

    /**
     * V18 defaults it to accepted, because every row that predates consent is a
     * live arrangement — putting a wall in front of somebody who has trained for
     * months is the one outcome that must not happen.
     */
    @Test
    @DisplayName("a client added before consent existed reads as accepted")
    void defaultsToAccepted() throws Exception {
        var id = client("Ananya", null);

        mvc.perform(get("/v1/clients/" + id))
                .andExpect(jsonPath("$.membershipStatus").value("accepted"));
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID client(String name, String membershipStatus) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", owner.toString(), "name", name));
        if (membershipStatus != null) {
            jdbc.update("UPDATE client SET membership_status = :ms WHERE id = :id::uuid",
                    Map.of("ms", membershipStatus, "id", id.toString()));
        }
        return id;
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

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
