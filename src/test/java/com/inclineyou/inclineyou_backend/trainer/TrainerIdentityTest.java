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
 * V33 · trainer identity — headline, bio and the intro video, over HTTP.
 *
 * Three properties are worth a regression test, and none of them is the CRUD:
 *
 * <ol>
 *   <li><b>null leaves alone, "" clears.</b> The whole profile endpoint rests on
 *       that distinction — one PATCH serves both a setup step writing one field
 *       and a Settings screen clearing one — and it is exactly the kind of rule
 *       a later refactor collapses into "ignore blanks";</li>
 *   <li><b>the video is stored canonical.</b> Six paste shapes, one row. If this
 *       ever regresses to storing the paste, every consumer has to learn the six
 *       shapes and they will not all agree;</li>
 *   <li><b>an over-long bio is refused, not truncated.</b> The other string
 *       fields on this endpoint truncate, so this one reads like an
 *       inconsistency and would be "fixed" by somebody who had not read why.</li>
 * </ol>
 *
 * Security filters are out of this chain, per the other controller tests — the
 * controller reads the trainer off the {@code SecurityContextHolder}.
 */
@SpringBootTest
@Transactional
class TrainerIdentityTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("9100000330");
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a trainer who predates V33 reads back with three nulls, not blanks")
    void absentByDefault() throws Exception {
        mvc.perform(get("/v1/trainers/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headline").doesNotExist())
                .andExpect(jsonPath("$.bio").doesNotExist())
                .andExpect(jsonPath("$.introVideoUrl").doesNotExist())
                .andExpect(jsonPath("$.introVideoId").doesNotExist());
    }

    @Test
    @DisplayName("headline and bio round-trip")
    void roundTrip() throws Exception {
        patchMe("""
                {"headline":"  Strength & fat-loss coach · Indiranagar  ",
                 "bio":"Twelve years on the floor in Bengaluru."}
                """)
                .andExpect(status().isOk())
                // Trimmed, but otherwise exactly what was sent — the interpunct
                // and the ampersand survive, which is the whole example headline.
                .andExpect(jsonPath("$.headline").value("Strength & fat-loss coach · Indiranagar"))
                .andExpect(jsonPath("$.bio").value("Twelve years on the floor in Bengaluru."));
    }

    @Test
    @DisplayName("omitting a field leaves it alone; sending \"\" clears it")
    void nullLeavesBlankClears() throws Exception {
        patchMe("""
                {"headline":"Strength coach","bio":"A bio."}
                """).andExpect(status().isOk());

        // A Settings screen saving only the bio must not wipe the headline.
        patchMe("""
                {"bio":"A different bio."}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headline").value("Strength coach"))
                .andExpect(jsonPath("$.bio").value("A different bio."));

        // Emptying the field in the UI and saving is a real instruction.
        patchMe("""
                {"headline":""}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headline").doesNotExist())
                .andExpect(jsonPath("$.bio").value("A different bio."));
    }

    @Test
    @DisplayName("every YouTube paste shape reduces to one canonical watch URL")
    void videoIsCanonicalised() throws Exception {
        String[] pastes = {
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "https://youtu.be/dQw4w9WgXcQ?t=42",
                "youtu.be/dQw4w9WgXcQ",
                "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
                "https://www.youtube.com/shorts/dQw4w9WgXcQ",
                "https://www.youtube.com/embed/dQw4w9WgXcQ",
                // The id is not the first query parameter here.
                "https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ&list=PL123",
        };
        for (String paste : pastes) {
            patchMe("{\"introVideoUrl\":\"%s\"}".formatted(paste))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.introVideoUrl")
                            .value("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
                    // Derived, so a card can embed without re-parsing.
                    .andExpect(jsonPath("$.introVideoId").value("dQw4w9WgXcQ"));
        }
    }

    @Test
    @DisplayName("a link that is not YouTube is refused, and the message says which field")
    void videoRefusesOthers() throws Exception {
        for (String bad : new String[] {
                "https://vimeo.com/123456789",
                "https://www.youtube.com/watch?v=tooshort",
                // An 11-character prefix of a longer blob must not be accepted.
                "https://www.youtube.com/watch?v=dQw4w9WgXcQextra",
                "not a link at all",
                // Right host, no video.
                "https://www.youtube.com/",
        }) {
            patchMe("{\"introVideoUrl\":\"%s\"}".formatted(bad))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("an over-long bio is refused rather than silently truncated")
    void bioIsBounded() throws Exception {
        patchMe("{\"bio\":\"%s\"}".formatted("a".repeat(1201)))
                .andExpect(status().isBadRequest());

        // The boundary itself is allowed.
        patchMe("{\"bio\":\"%s\"}".formatted("a".repeat(1200)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("identity does not disturb the V8 answers beside it")
    void leavesTheSetupAnswersAlone() throws Exception {
        patchMe("""
                {"experienceBand":"3_5","languages":["ta","en"]}
                """).andExpect(status().isOk());

        patchMe("""
                {"headline":"Strength coach","introVideoUrl":"https://youtu.be/dQw4w9WgXcQ"}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.experienceBand").value("3_5"))
                .andExpect(jsonPath("$.languages[0]").value("ta"))
                .andExpect(jsonPath("$.languages[1]").value("en"));
    }

    /* ------------------------------------------------------------ fixtures */

    private org.springframework.test.web.servlet.ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
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

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
