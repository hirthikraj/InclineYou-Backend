package com.xrep.xrep_backend.trainer;

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
 * V35 · the two social profiles.
 *
 * Five properties, and none of them is the CRUD:
 *
 * <ol>
 *   <li><b>Every spelling of one account stores one string.</b> The share-sheet
 *       URL with its {@code igsh=} token, the desktop URL, the bare
 *       {@code @handle} — one column value, or every consumer that ever renders
 *       this re-implements the parse and they will not all agree;</li>
 *   <li><b>the share token does not survive.</b> It is a tracking parameter on a
 *       profile a client reads, in a column that will outlive it;</li>
 *   <li><b>a YouTube channel keeps its addressing shape.</b> {@code /@handle},
 *       {@code /channel/UC…}, {@code /c/…} and {@code /user/…} are not
 *       interchangeable, and mapping between them needs a network call this
 *       write path must never make;</li>
 *   <li><b>a watch URL is refused, and the refusal says why.</b> It is the most
 *       likely paste mistake in the field — the intro video is two tabs away and
 *       wants exactly that string;</li>
 *   <li><b>null leaves alone, "" clears.</b> The rule the whole endpoint rests
 *       on, checked once per migration because a later refactor collapses it
 *       into "ignore blanks".</li>
 * </ol>
 */
@SpringBootTest
@Transactional
class TrainerSocialTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("9100000350");
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a trainer who predates V35 reads back with neither link")
    void absentByDefault() throws Exception {
        mvc.perform(get("/v1/trainers/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instagramUrl").doesNotExist())
                .andExpect(jsonPath("$.youtubeUrl").doesNotExist())
                .andExpect(jsonPath("$.instagramHandle").doesNotExist());
    }

    @Test
    @DisplayName("every spelling of one Instagram account stores the same canonical URL")
    void instagramIsCanonical() throws Exception {
        for (String paste : new String[] {
                "https://www.instagram.com/ravi.trains",
                "https://www.instagram.com/ravi.trains/",
                "https://instagram.com/ravi.trains?igsh=MXY3ZmZ2bWx6cWJkdA==",
                "instagram.com/ravi.trains",
                "https://m.instagram.com/ravi.trains/",
                "@ravi.trains",
                "ravi.trains",
                "  @ravi.trains  ",
        }) {
            patchMe("{\"instagramUrl\":\"%s\"}".formatted(paste))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.instagramUrl").value("https://www.instagram.com/ravi.trains"))
                    // Derived, so nothing downstream has to parse the URL to
                    // render the handle — the `introVideoId` argument again.
                    .andExpect(jsonPath("$.instagramHandle").value("@ravi.trains"));
        }
    }

    @Test
    @DisplayName("a post or reel is refused — it is a link to one video, not to an account")
    void instagramRefusesNonProfiles() throws Exception {
        for (String bad : new String[] {
                "https://www.instagram.com/p/CxYz123abc/",
                "https://www.instagram.com/reel/CxYz123abc/",
                "https://www.instagram.com/explore/tags/fitness/",
                "https://www.facebook.com/ravi.trains",
                "ravi trains",          // a name, not a handle
                "not a link at all",
        }) {
            patchMe("{\"instagramUrl\":\"%s\"}".formatted(bad))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("a YouTube channel keeps whichever of the four shapes it has")
    void youtubeKeepsItsShape() throws Exception {
        Map<String, String> cases = Map.of(
                "https://www.youtube.com/@ravitrains", "https://www.youtube.com/@ravitrains",
                "youtube.com/@ravitrains?si=abc123", "https://www.youtube.com/@ravitrains",
                "@ravitrains", "https://www.youtube.com/@ravitrains",
                // Not rewritten to a handle: resolving one of these to the other
                // needs a lookup against YouTube, and a write path here never
                // reaches the network.
                "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
                        "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
                "https://www.youtube.com/c/RaviTrains", "https://www.youtube.com/c/RaviTrains",
                "https://m.youtube.com/user/ravitrains/", "https://www.youtube.com/user/ravitrains");

        for (var entry : cases.entrySet()) {
            patchMe("{\"youtubeUrl\":\"%s\"}".formatted(entry.getKey()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.youtubeUrl").value(entry.getValue()));
        }

        // A /channel/ URL has no handle to show, and an honest null beats an
        // invented one.
        patchMe("{\"youtubeUrl\":\"https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.youtubeHandle").doesNotExist());
    }

    @Test
    @DisplayName("a watch URL is refused, and the refusal names the field that wants it")
    void youtubeRefusesAVideo() throws Exception {
        // The reason is read off the resolved exception rather than the body:
        // this chain is built without the error dispatch, so a
        // ResponseStatusException renders an empty entity here and its
        // ProblemDetail only exists over the wire.
        var refusal = patchMe("{\"youtubeUrl\":\"https://youtu.be/dQw4w9WgXcQ\"}")
                .andExpect(status().isBadRequest())
                .andReturn().getResolvedException();
        org.junit.jupiter.api.Assertions.assertNotNull(refusal);
        org.junit.jupiter.api.Assertions.assertTrue(
                refusal.getMessage().contains("that is a video, not a channel"),
                "the refusal has to name the mistake, not just the field: " + refusal.getMessage());

        patchMe("{\"youtubeUrl\":\"https://vimeo.com/ravitrains\"}")
                .andExpect(status().isBadRequest());

        // Refused over the cap rather than truncated. This is the one field
        // where truncating would not fail loudly: a canonicaliser handed a cut
        // URL reads the shortened handle as a real one and stores a link to
        // somebody else's account.
        patchMe("{\"instagramUrl\":\"https://www.instagram.com/ravi.trains?igsh=%s\"}"
                .formatted("a".repeat(500)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("\"\" clears one link and leaves the other, and neither touches V33 or V34")
    void nullLeavesAloneAndEmptyClears() throws Exception {
        patchMe("""
                {"instagramUrl":"@ravi.trains","youtubeUrl":"@ravitrains",
                 "introVideoUrl":"https://youtu.be/dQw4w9WgXcQ",
                 "mapLink":"https://maps.app.goo.gl/AbCdEf123",
                 "trainingModes":["online"],"headline":"Strength coach"}
                """).andExpect(status().isOk());

        // A PATCH that names neither leaves both standing.
        patchMe("{\"headline\":\"Strength & conditioning\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instagramUrl").value("https://www.instagram.com/ravi.trains"))
                .andExpect(jsonPath("$.youtubeUrl").value("https://www.youtube.com/@ravitrains"));

        patchMe("{\"instagramUrl\":\"\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instagramUrl").doesNotExist())
                .andExpect(jsonPath("$.youtubeUrl").value("https://www.youtube.com/@ravitrains"))
                // The channel and the one chosen video are different columns and
                // different promises; clearing one must not disturb the other.
                .andExpect(jsonPath("$.introVideoUrl").value("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
                .andExpect(jsonPath("$.mapLink").value("https://maps.app.goo.gl/AbCdEf123"))
                .andExpect(jsonPath("$.trainingModes[0]").value("online"));
    }

    /* ------------------------------------------------------------ fixtures */

    private ResultActions patchMe(String body) throws Exception {
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
