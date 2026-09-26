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

/**
 * V29 · the trainer's own notes, over HTTP.
 *
 * The property worth a regression test is not the CRUD — it is that a note is
 * private to the trainer who wrote it even when another trainer can legitimately
 * see the client. A team widens reads over a teammate's roster and it must not
 * widen this, for the same reason no role ever sees a teammate's money book. The
 * repository states the author in every predicate; these fail if anybody ever
 * drops it and lets client-ownership alone stand in for note-ownership.
 *
 * Security filters are deliberately out of this chain, per
 * {@link PhoneAvailabilityTest} — the controller reads the trainer off the
 * `SecurityContextHolder`, so setting it here tests the routing and the answer
 * without re-testing the JWT filter.
 */
@SpringBootTest
@Transactional
class ClientNoteTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private static final String OWNER_PHONE = "9100000020";
    private static final String OTHER_PHONE = "9100000021";

    private UUID owner;
    private UUID other;
    private UUID client;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer(OWNER_PHONE);
        other = trainer(OTHER_PHONE);
        client = client(owner, "Meera");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a note round-trips, unpinned by default")
    void addAndList() throws Exception {
        mvc.perform(post("/v1/clients/%s/notes".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"prefers mornings, hates burpees\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("prefers mornings, hates burpees"))
                .andExpect(jsonPath("$.pinned").value(false));

        mvc.perform(get("/v1/clients/%s/notes".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("a note can be pinned at write time — that is the strip")
    void pinnedOnCreate() throws Exception {
        mvc.perform(post("/v1/clients/%s/notes".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"left knee - no deep squats\",\"pinned\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    @DisplayName("omitting `pinned` on an edit leaves the pin alone")
    void pinSurvivesABodyEdit() throws Exception {
        var id = note("prefers mornings", true);

        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"prefers mornings, before 7\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("prefers mornings, before 7"))
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    @DisplayName("omitting `body` on an edit unpins without touching the text")
    void unpinWithoutSendingTheText() throws Exception {
        var id = note("wife Priya, wedding in Nov", true);

        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pinned\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("wife Priya, wedding in Nov"))
                .andExpect(jsonPath("$.pinned").value(false));
    }

    @Test
    @DisplayName("V7 · a note is private unless the trainer says exactly true")
    void privateByDefault() throws Exception {
        mvc.perform(post("/v1/clients/%s/notes".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"prefers mornings\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sharedWithClient").value(false));

        mvc.perform(post("/v1/clients/%s/notes".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"great week, keep it up\",\"sharedWithClient\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sharedWithClient").value(true));
    }

    @Test
    @DisplayName("V7 · sharing is its own toggle — the text and the pin survive it, and it retracts")
    void shareToggleLeavesTheRestAlone() throws Exception {
        var id = note("left knee - no deep squats", true);

        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sharedWithClient\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("left knee - no deep squats"))
                .andExpect(jsonPath("$.pinned").value(true))
                .andExpect(jsonPath("$.sharedWithClient").value(true));

        // A body edit does not un-share it…
        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"left knee - box squats only\"}"))
                .andExpect(jsonPath("$.sharedWithClient").value(true));

        // …and false retracts it.
        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sharedWithClient\":false}"))
                .andExpect(jsonPath("$.sharedWithClient").value(false));
    }

    @Test
    @DisplayName("an empty note is a typed 400 whose sentence reaches the trainer")
    void emptyNoteSaysWhy() throws Exception {
        var id = note("hates burpees", false);
        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value("A note needs some text"));
    }

    @Test
    @DisplayName("a deleted note leaves the list")
    void deleteRemovesItFromTheList() throws Exception {
        var id = note("hates burpees", false);

        mvc.perform(delete("/v1/clients/%s/notes/%s".formatted(client, id)))
                .andExpect(status().isNoContent());

        mvc.perform(get("/v1/clients/%s/notes".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("an empty note is a 400, not a blank row")
    void blankBodyIsRefused() throws Exception {
        mvc.perform(post("/v1/clients/%s/notes".formatted(client))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    /* ── the rule this file exists for ─────────────────────────────────────── */

    @Test
    @DisplayName("another trainer cannot read this trainer's notes on their own client")
    void notesDoNotTravelWithClientVisibility() throws Exception {
        note("wife Priya, wedding in Nov", true);

        /* `other` is given the same client row to hold — the strongest form of
           the case, because every client-level ownership check now passes and
           only the note's own author predicate stands between them. */
        jdbc.update("UPDATE client SET trainer_id = :tid::uuid WHERE id = :cid::uuid",
                Map.of("tid", other.toString(), "cid", client.toString()));
        signedInAs(other);

        mvc.perform(get("/v1/clients/%s/notes".formatted(client)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("another trainer editing a note they cannot see gets a 404, not a 403")
    void somebodyElsesNoteIsNotEvenAdmittedTo() throws Exception {
        var id = note("prefers mornings", false);

        jdbc.update("UPDATE client SET trainer_id = :tid::uuid WHERE id = :cid::uuid",
                Map.of("tid", other.toString(), "cid", client.toString()));
        signedInAs(other);

        mvc.perform(put("/v1/clients/%s/notes/%s".formatted(client, id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"rewritten\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a note on somebody else's client is a 404 at the client, before the note")
    void notesOnAClientYouDoNotHoldAre404() throws Exception {
        var theirClient = client(other, "Rajesh");

        mvc.perform(get("/v1/clients/%s/notes".formatted(theirClient)))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID note(String body, boolean pinned) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client_note (id, client_id, trainer_id, body, pinned)
                VALUES (:id::uuid, :cid::uuid, :tid::uuid, :body, :pinned)
                """, Map.of("id", id.toString(), "cid", client.toString(),
                "tid", owner.toString(), "body", body, "pinned", pinned));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
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
