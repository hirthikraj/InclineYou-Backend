package com.xrep.xrep_backend.session;

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

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The three workout-log routes the online half could not do without.
 *
 * <p>All three were gaps the web app had already written a workaround for, and
 * each workaround was wrong in a way a test can state:
 *
 * <ul>
 *   <li><b>Closing a log.</b> {@code PUT /v1/workouts/{id}} wrote {@code notes}
 *       and nothing else, so nothing on the wire could stamp {@code ended_at} and
 *       every log read as permanently open — a session logged on Tuesday still
 *       said <i>In session</i> on Sunday. The web closed logs by posting whole
 *       rows back through the sync envelope instead.</li>
 *   <li><b>Reading a client's sets.</b> One request per session meant ~150 for a
 *       year of training, so the web read a 40-session window and patched the
 *       hole with {@code /progress}, which is capped at 30 exercises and ignores
 *       reps-only work.</li>
 *   <li><b>Today's card list.</b> {@code workout_exercise} had no route, so the
 *       grid was reconstructed from the plan plus whatever had a set logged
 *       against it — which cannot represent an added exercise nobody has typed
 *       into yet, and turns a swap into a skip.</li>
 * </ul>
 *
 * <p>Security filters are out of this chain, per {@code PhoneAvailabilityTest}:
 * the controller reads the trainer off the {@code SecurityContextHolder}.
 */
@SpringBootTest
@Transactional
class WorkoutLogRestTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private UUID owner;
    private UUID other;
    private UUID client;
    private UUID bench;
    private UUID chinUp;

    @BeforeEach
    void setUp() {
        owner = trainer("9100000040");
        other = trainer("9100000041");
        client = client(owner, "Meera");
        bench = exercise(owner, "Bench press");
        chinUp = exercise(owner, "Chin-up");
        signedInAs(owner);

        /* This controller takes `Authentication` as a METHOD ARGUMENT, unlike the
           ones that read `SecurityContextHolder` themselves — Spring MVC resolves
           that from the request's principal, which only the security filter chain
           normally sets. The filters stay out of the chain for the reason
           PhoneAvailabilityTest gives, so the principal is supplied directly
           instead of re-testing the JWT filter here. */
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(token(owner)))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ────────────────────────────────────────── closing a log (gap 4) ── */

    @Test
    @DisplayName("a log can be closed, and comes back with the instant it closed at")
    void endedAtIsWritable() throws Exception {
        var log = workout(client, "2026-08-20", null);
        long at = 1_756_000_000_000L;

        mvc.perform(put("/v1/workouts/" + log)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endedAt\":" + at + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").value(at));
    }

    @Test
    @DisplayName("an open log reads as null, never 0 — 0 is a log closed at the epoch")
    void openLogIsNull() throws Exception {
        var log = workout(client, "2026-08-20", null);

        mvc.perform(get("/v1/workouts/" + log))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").doesNotExist());
    }

    /**
     * The regression that had to be prevented in the same commit that added the
     * field: every caller written before it sends `{notes}` alone, and if an
     * absent `endedAt` meant "clear" each of them would silently reopen a closed
     * log — putting the trainer back *In session* on a Tuesday session.
     */
    @Test
    @DisplayName("editing the notes of a closed log does not reopen it")
    void notesEditDoesNotReopen() throws Exception {
        var log = workout(client, "2026-08-20", null);
        long at = 1_756_000_000_000L;

        mvc.perform(put("/v1/workouts/" + log)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"endedAt\":" + at + "}"));

        mvc.perform(put("/v1/workouts/" + log)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"notes\":\"good session\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("good session"))
                .andExpect(jsonPath("$.endedAt").value(at));
    }

    /** The mirror image: closing a log must not erase what was written in it. */
    @Test
    @DisplayName("closing a log does not erase its notes")
    void closingDoesNotEraseNotes() throws Exception {
        var log = workout(client, "2026-08-20", "shoulder felt fine today");

        mvc.perform(put("/v1/workouts/" + log)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endedAt\":1756000000000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("shoulder felt fine today"));
    }

    @Test
    @DisplayName("endedAt 0 reopens a log — mis-tapping Finish is not permanent")
    void zeroReopens() throws Exception {
        var log = workout(client, "2026-08-20", null);

        mvc.perform(put("/v1/workouts/" + log)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"endedAt\":1756000000000}"));

        mvc.perform(put("/v1/workouts/" + log)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endedAt\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").doesNotExist());
    }

    /* ──────────────────────────────── a client's whole history (gap 3) ── */

    @Test
    @DisplayName("one request returns every set across every session, oldest first")
    void bulkSetsSpanSessions() throws Exception {
        var march = workout(client, "2026-03-02", null);
        var august = workout(client, "2026-08-20", null);
        set(march, bench, 1, "60.0", 8);
        set(august, bench, 1, "80.0", 8);
        set(august, chinUp, 1, null, 12);

        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // Oldest first, so a caller folding these into a running best or
                // a per-set-number "previous" does it in one pass.
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"))
                .andExpect(jsonPath("$[0].loadKg").value(60.0))
                .andExpect(jsonPath("$[2].sessionDate").value("2026-08-20"));
    }

    /**
     * The date has to be the SESSION's, never the row's `created_at`: a Tuesday
     * session typed up on Thursday is a Tuesday session, and both *Previous* and
     * the record test order by when the training happened.
     */
    @Test
    @DisplayName("each set carries its session's date, not the date it was typed")
    void setsCarrySessionDate() throws Exception {
        var log = workout(client, "2026-03-02", null);
        set(log, bench, 1, "60.0", 8);

        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"));

        // And the per-session read agrees with it.
        mvc.perform(get("/v1/workouts/" + log + "/sets"))
                .andExpect(jsonPath("$[0].sessionDate").value("2026-03-02"));
    }

    @Test
    @DisplayName("exerciseId narrows it to one movement")
    void bulkSetsNarrowByExercise() throws Exception {
        var log = workout(client, "2026-08-20", null);
        set(log, bench, 1, "80.0", 8);
        set(log, chinUp, 1, null, 12);

        mvc.perform(get("/v1/workouts/sets")
                        .param("clientId", client.toString())
                        .param("exerciseId", chinUp.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].exerciseId").value(chinUp.toString()));
    }

    /**
     * Ownership is the join, not a second check — the house rule. Another
     * trainer's client matches no session of ours and therefore no set.
     */
    @Test
    @DisplayName("another trainer's client yields nothing, not somebody else's sets")
    void bulkSetsAreTrainerScoped() throws Exception {
        var theirClient = client(other, "Rajesh");
        var theirLog = workout(other, theirClient, "2026-08-20", null);
        set(theirLog, bench, 1, "80.0", 8);

        mvc.perform(get("/v1/workouts/sets").param("clientId", theirClient.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** `/v1/workouts/sets` is a literal and must not be parsed as `/{id}`. */
    @Test
    @DisplayName("the bulk route wins the match against /{id}")
    void bulkRouteBeatsTheIdTemplate() throws Exception {
        mvc.perform(get("/v1/workouts/sets").param("clientId", client.toString()))
                .andExpect(status().isOk());
    }

    /* ─────────────────────────────────── today's card list (gap 7) ── */

    @Test
    @DisplayName("an exercise can be added to today before any set exists")
    void addExerciseToTheGrid() throws Exception {
        var log = workout(client, "2026-08-20", null);

        mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + chinUp + "\",\"source\":\"unplanned\","
                                + "\"orderIndex\":3,\"restSeconds\":90}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.exerciseId").value(chinUp.toString()))
                .andExpect(jsonPath("$.source").value("unplanned"))
                .andExpect(jsonPath("$.restSeconds").value(90))
                .andExpect(jsonPath("$.removedAt").doesNotExist());

        mvc.perform(get("/v1/workouts/" + log + "/exercises"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    /**
     * A swap is the thing reconstruction could not represent. The rack was busy,
     * so the bench press was not skipped — it was replaced, and adherence reads
     * `swapped_from_exercise_id` rather than the absence of the original.
     */
    @Test
    @DisplayName("a swap records what it replaced")
    void swapRecordsTheOriginal() throws Exception {
        var log = workout(client, "2026-08-20", null);

        mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + chinUp + "\",\"swappedFromExerciseId\":\""
                                + bench + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.swappedFromExerciseId").value(bench.toString()));
    }

    /**
     * The table's unique index is partial — `(workout_session_id, exercise_id)
     * WHERE deleted_at IS NULL` — so a second POST of the same pair would be a
     * 500 without the upsert. Adding one that is already there is what "add it
     * back" means to a trainer, so it clears `removed_at` too.
     */
    @Test
    @DisplayName("adding the same exercise twice updates the row and un-removes it")
    void addIsIdempotentOnThePair() throws Exception {
        var log = workout(client, "2026-08-20", null);

        var first = mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + bench + "\",\"targetSets\":3}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String rowId = idOf(first);

        mvc.perform(put("/v1/workouts/" + log + "/exercises/" + rowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"removedAt\":1756000000000}"))
                .andExpect(jsonPath("$.removedAt").value(1756000000000L));

        mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + bench + "\",\"targetSets\":4}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(rowId))
                .andExpect(jsonPath("$.targetSets").value(4))
                .andExpect(jsonPath("$.removedAt").doesNotExist());

        mvc.perform(get("/v1/workouts/" + log + "/exercises"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    /**
     * Removed is not deleted. The row stays as the record that the trainer
     * decided against it, and the toast's Undo needs something to put back.
     */
    @Test
    @DisplayName("removedAt 0 puts a removed card back — that is Undo")
    void removeAndRestore() throws Exception {
        var log = workout(client, "2026-08-20", null);
        String rowId = idOf(mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + bench + "\"}"))
                .andReturn().getResponse().getContentAsString());

        mvc.perform(put("/v1/workouts/" + log + "/exercises/" + rowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"removedAt\":1756000000000}"))
                .andExpect(jsonPath("$.removedAt").value(1756000000000L));

        // Still in the list — the card is drawn struck through, not gone.
        mvc.perform(get("/v1/workouts/" + log + "/exercises"))
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(put("/v1/workouts/" + log + "/exercises/" + rowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"removedAt\":0}"))
                .andExpect(jsonPath("$.removedAt").doesNotExist());
    }

    @Test
    @DisplayName("a deleted card is tombstoned and leaves the list")
    void deleteTombstones() throws Exception {
        var log = workout(client, "2026-08-20", null);
        String rowId = idOf(mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + bench + "\"}"))
                .andReturn().getResponse().getContentAsString());

        mvc.perform(delete("/v1/workouts/" + log + "/exercises/" + rowId))
                .andExpect(status().isNoContent());

        mvc.perform(get("/v1/workouts/" + log + "/exercises"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    /**
     * Left to the foreign key this would be a 500, and it would not notice
     * another trainer's private exercise at all.
     */
    @Test
    @DisplayName("an exercise this trainer cannot see is a 404, not a 500")
    void invisibleExerciseIs404() throws Exception {
        var log = workout(client, "2026-08-20", null);
        var theirs = exercise(other, "Their private lift");

        mvc.perform(post("/v1/workouts/" + log + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseId\":\"" + theirs + "\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("another trainer's log is a 404 at the session, before the card")
    void somebodyElsesLogIs404() throws Exception {
        var theirLog = workout(other, client(other, "Rajesh"), "2026-08-20", null);

        mvc.perform(get("/v1/workouts/" + theirLog + "/exercises"))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    private static String idOf(String json) {
        int at = json.indexOf("\"id\":\"") + 6;
        return json.substring(at, json.indexOf('"', at));
    }

    private UUID workout(UUID clientId, String date, String notes) {
        return workout(owner, clientId, date, notes);
    }

    private UUID workout(UUID trainerId, UUID clientId, String date, String notes) {
        var id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("date", java.sql.Date.valueOf(date));
        p.put("notes", notes);
        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, logged_by, session_date, notes)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'trainer', :date, :notes)
                """, p);
        return id;
    }

    private void set(UUID workoutId, UUID exerciseId, int number, String load, Integer reps) {
        var p = new HashMap<String, Object>();
        p.put("id", UUID.randomUUID().toString());
        p.put("wid", workoutId.toString());
        p.put("exId", exerciseId.toString());
        p.put("n", number);
        p.put("load", load == null ? null : new java.math.BigDecimal(load));
        p.put("reps", reps);
        jdbc.update("""
                INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps)
                VALUES (:id::uuid, :wid::uuid, :exId::uuid, :n, :load, :reps)
                """, p);
    }

    private UUID exercise(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO exercise (id, name, is_custom, trainer_id)
                VALUES (:id::uuid, :name, true, :tid::uuid)
                """, Map.of("id", id.toString(), "name", name, "tid", trainerId.toString()));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name) VALUES (:id::uuid, :tid::uuid, :name)
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
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

    private static UsernamePasswordAuthenticationToken token(UUID trainerId) {
        return new UsernamePasswordAuthenticationToken(
                trainerId.toString(), null,
                AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(token(trainerId));
    }
}
