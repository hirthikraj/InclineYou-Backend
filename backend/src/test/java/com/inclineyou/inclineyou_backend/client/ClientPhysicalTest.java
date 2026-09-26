package com.inclineyou.inclineyou_backend.client;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.containsString;

/**
 * V7 · the client file's *Physical information* card, and the contact card's
 * phone check, over {@code PUT /v1/clients/{id}}.
 *
 * <ol>
 *   <li><b>A birth date round-trips, and "" clears it.</b> Null keeps meaning
 *       "leave it alone" on this endpoint, so clearing needs a sentinel.</li>
 *   <li><b>A birth date that cannot be one is refused with a sentence</b> —
 *       the future, or more than 120 years back, is a typo in the year.</li>
 *   <li><b>Height 0 clears it</b>, for the same reason as the "".</li>
 *   <li><b>Moving a number onto one already on the roster is a 409 with a
 *       code</b> — the web's contact card branches on it.</li>
 * </ol>
 */
@SpringBootTest
@Transactional
class ClientPhysicalTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;
    private UUID client;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), '9100000701', 'P')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of());
        me = UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = '9100000701'", Map.of(), String.class));
        client = client("Meera", "9100000711");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a birth date round-trips on PUT and GET, and \"\" clears it")
    void birthDateRoundTrip() throws Exception {
        putClient("{\"dateOfBirth\":\"1994-03-12\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dateOfBirth").value("1994-03-12"));
        mvc.perform(get("/v1/clients/" + client))
                .andExpect(jsonPath("$.dateOfBirth").value("1994-03-12"));

        // A PUT about something else leaves it alone.
        putClient("{\"goal\":\"Run 10k\"}").andExpect(jsonPath("$.dateOfBirth").value("1994-03-12"));

        putClient("{\"dateOfBirth\":\"\"}").andExpect(jsonPath("$.dateOfBirth").doesNotExist());
    }

    @Test
    @DisplayName("a birth date in the future, past 120 years, or not a date is a typed 400")
    void impossibleBirthDates() throws Exception {
        for (String bad : new String[]{"2091-03-12", "1896-03-12", "12/03/1994"}) {
            putClient("{\"dateOfBirth\":\"" + bad + "\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION"))
                    .andExpect(jsonPath("$.detail").value(containsString("dateOfBirth")));
        }
        mvc.perform(get("/v1/clients/" + client)).andExpect(jsonPath("$.dateOfBirth").doesNotExist());
    }

    @Test
    @DisplayName("height 0 clears it; null leaves it alone")
    void heightClears() throws Exception {
        putClient("{\"heightCm\":172.5}").andExpect(jsonPath("$.heightCm").value(172.5));
        putClient("{\"goal\":\"Strength\"}").andExpect(jsonPath("$.heightCm").value(172.5));
        putClient("{\"heightCm\":0}").andExpect(jsonPath("$.heightCm").doesNotExist());
    }

    @Test
    @DisplayName("moving a number onto another client on this roster is a 409 with a code")
    void phoneTakenOnPut() throws Exception {
        client("Ravi", "9100000712");
        putClient("{\"name\":\"Meera\",\"phone\":\"9100000712\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHONE_ON_YOUR_ROSTER"));

        // Re-saving the number the row already holds is not a move.
        putClient("{\"name\":\"Meera K\",\"phone\":\"9100000711\"}").andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions putClient(String body) throws Exception {
        return mvc.perform(put("/v1/clients/" + client)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private UUID client(String name, String phone) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone) VALUES (:id::uuid, :tid::uuid, :name, :phone)
                """, Map.of("id", id.toString(), "tid", me.toString(), "name", name, "phone", phone));
        return id;
    }
}
