package com.inclineyou.inclineyou_backend.core.trainer;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V34 · where a trainer works — the map link, the training modes and the areas.
 *
 * The CRUD is not what is worth a regression test here. Four properties are:
 *
 * <ol>
 *   <li><b>`map_link` is stored verbatim.</b> It sits one field away from
 *       `intro_video_url`, which is canonicalised on write, so the obvious
 *       "consistency" fix is to normalise this one too — and a normaliser that
 *       met a `maps.app.goo.gl` redirect, an Apple Maps URL or a
 *       `/maps/place/…@lat,lng/data=` blob would eventually break a link that
 *       worked. Every shape below has to come back exactly as sent;</li>
 *   <li><b>but it is still refused when it is not a URL.</b> The one failure a
 *       trainer would not otherwise discover until a client tapped it;</li>
 *   <li><b>`gym_name` and `training_modes` are two fields</b> that touch only
 *       through {@code trainer_business_gym_needs_floor} — a gym name needs
 *       {@code gym_floor} among the modes, and nothing else about one writes
 *       the other;</li>
 *   <li><b>null leaves alone, [] clears.</b> The rule the entire profile
 *       endpoint rests on, and the one a later refactor collapses into "ignore
 *       blanks".</li>
 * </ol>
 *
 * Security filters are out of this chain, per the other controller tests — the
 * controller reads the trainer off the {@code SecurityContextHolder}.
 */
@SpringBootTest
@Transactional
class TrainerPlaceTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100000340");
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a trainer who predates V34 reads back with a null link and two empty lists")
    void absentByDefault() throws Exception {
        mvc.perform(get("/v1/trainers/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mapLink").doesNotExist())
                .andExpect(jsonPath("$.trainingModes").isEmpty())
                .andExpect(jsonPath("$.serviceAreas").isEmpty());
    }

    @Test
    @DisplayName("a map link is stored exactly as pasted, whatever shape it is")
    void mapLinkIsVerbatim() throws Exception {
        String[] pastes = {
                "https://maps.app.goo.gl/AbCdEf123",
                "https://www.google.com/maps/place/Iron+House/@12.99,80.25,17z/data=!3m1!4b1",
                "https://maps.apple.com/?ll=12.99,80.25&q=Iron%20House",
                "https://www.openstreetmap.org/#map=19/12.99/80.25",
                "http://example.gym/where",
        };
        for (String paste : pastes) {
            patchMe("{\"mapLink\":\"%s\"}".formatted(paste))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.mapLink").value(paste));
        }
    }

    @Test
    @DisplayName("something that is not a link is refused, and \"\" clears the field")
    void mapLinkRefusesNonLinks() throws Exception {
        for (String bad : new String[] {
                "12 Kasturba Road, Adyar",
                "maps.app.goo.gl/AbCdEf123", // no scheme — a paste that lost its head
                "ftp://example.gym/where",
                "javascript:alert(1)",
        }) {
            patchMe("{\"mapLink\":\"%s\"}".formatted(bad))
                    .andExpect(status().isBadRequest());
        }

        // Refused over the cap rather than truncated: a URL cut short is broken.
        patchMe("{\"mapLink\":\"https://example.gym/%s\"}".formatted("a".repeat(500)))
                .andExpect(status().isBadRequest());

        patchMe("{\"mapLink\":\"https://maps.app.goo.gl/AbCdEf123\"}")
                .andExpect(status().isOk());
        patchMe("{\"mapLink\":\"\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mapLink").doesNotExist());
    }

    @Test
    @DisplayName("training modes are cleaned like every other list, and [] clears them")
    void trainingModesAreAList() throws Exception {
        patchMe("""
                {"trainingModes":["gym_floor","  home_visit  ","gym_floor","","custom:Beach sessions"]}
                """)
                .andExpect(status().isOk())
                // Trimmed, de-duplicated, blanks dropped, order kept.
                .andExpect(jsonPath("$.trainingModes[0]").value("gym_floor"))
                .andExpect(jsonPath("$.trainingModes[1]").value("home_visit"))
                .andExpect(jsonPath("$.trainingModes[2]").value("custom:Beach sessions"))
                .andExpect(jsonPath("$.trainingModes[3]").doesNotExist());

        patchMe("""
                {"trainingModes":[]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trainingModes").isEmpty());
    }

    @Test
    @DisplayName("the gym name and the training modes are two fields, and neither writes the other")
    void trainingModesAreNotWorkMode() throws Exception {
        // `trainer_business_gym_needs_floor` is the one place they touch: a
        // gym name needs `gym_floor` among the modes, checked in the service
        // so a trainer meets a sentence rather than a raw constraint violation.
        patchMe("""
                {"gymName":"Iron House","trainingModes":["gym_floor"]}
                """).andExpect(status().isOk());

        patchMe("""
                {"trainingModes":["gym_floor","home_visit"],"serviceAreas":["Adyar","Besant Nagar"]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").value("Iron House"));

        // And back the other way: renaming the gym leaves the delivery alone.
        patchMe("""
                {"gymName":"Iron House Gym"}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trainingModes[1]").value("home_visit"))
                .andExpect(jsonPath("$.serviceAreas[0]").value("Adyar"));
    }

    @Test
    @DisplayName("a gym name needs gym_floor among the modes, or it is refused")
    void gymNameNeedsGymFloor() throws Exception {
        patchMe("""
                {"gymName":"Iron House"}
                """).andExpect(status().isBadRequest());

        patchMe("""
                {"trainingModes":["home_visit"],"gymName":"Iron House"}
                """).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("leaving the gym clears its name")
    void clearingTheGymClearsItsName() throws Exception {
        patchMe("""
                {"gymName":"Iron House","trainingModes":["gym_floor"]}
                """).andExpect(status().isOk());

        // The Work & hours tab sends this when a trainer picks "on my own".
        patchMe("""
                {"gymName":"","mapLink":""}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").doesNotExist());
    }

    @Test
    @DisplayName("where does not disturb the V8 answers or the V33 identity beside it")
    void leavesTheRestAlone() throws Exception {
        patchMe("""
                {"experienceBand":"3_5","languages":["ta"],"headline":"Strength coach"}
                """).andExpect(status().isOk());

        patchMe("""
                {"mapLink":"https://maps.app.goo.gl/AbCdEf123",
                 "trainingModes":["online"],"serviceAreas":["Adyar"]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.experienceBand").value("3_5"))
                .andExpect(jsonPath("$.languages[0]").value("ta"))
                .andExpect(jsonPath("$.headline").value("Strength coach"));
    }

    /* ------------------------------------------------------------ fixtures */

    private ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone",
                Map.of("phone", phone), String.class);
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
