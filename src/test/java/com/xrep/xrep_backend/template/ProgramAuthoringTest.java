package com.xrep.xrep_backend.template;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V31 · the program builder, over HTTP.
 *
 * Six facts, and every one of them is a bug this pass found rather than a
 * feature it invented:
 *
 * <ol>
 *   <li><b>The wire is camelCase.</b> `API.md` has documented `exerciseId` since
 *       the endpoint existed and the implementation answered `exercise_id`,
 *       because `TemplateResponse.exercises` handed out the storage map. Its
 *       only REST consumer read every field as undefined.</li>
 *   <li><b>Storage stays snake_case.</b> The phone's `parseBlueprint` keys on
 *       `exercise_id` and friends, so the jsonb must not move with the wire. The
 *       test reads the column, not the response.</li>
 *   <li><b>`week` survives a round trip.</b> It had no field on
 *       `TemplateExerciseInput`, so a multi-week template could not be authored
 *       over REST at all — every entry came back as week 1 however it was sent.
 *       This is the one that makes the Program → Week → Day hierarchy
 *       possible.</li>
 *   <li><b>`weeks` and `trainingDays` are writable.</b> Both columns predate the
 *       DTO and neither was ever settable, so a day existed only where an
 *       exercise had landed — and the first exercise landing on Day 1 made Day 1
 *       the only day the program had.</li>
 *   <li><b>Apply is a snapshot.</b> Editing the blueprint afterwards must not
 *       reach the client's copy. This is the brief's own rule and the reason the
 *       two tables are two tables.</li>
 *   <li><b>Resync is the override, and it keeps the client's schedule.</b> Same
 *       weekday, same time; only the plan moves.</li>
 * </ol>
 *
 * Security filters are deliberately out of this chain, per
 * {@code PhoneAvailabilityTest}: the controllers read the trainer off the
 * `SecurityContextHolder`, so setting it here tests the routing and the answer
 * without re-testing the JWT filter.
 */
@SpringBootTest
@Transactional
class ProgramAuthoringTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private static final String OWNER_PHONE = "9100000040";
    private static final String OTHER_PHONE = "9100000041";

    private UUID owner;
    private UUID other;
    private UUID client;
    private UUID bench;
    private UUID row;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer(OWNER_PHONE);
        other = trainer(OTHER_PHONE);
        client = client(owner, "Meera");
        bench = exercise("Bench press");
        row = exercise("Barbell row");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ---------------------------------------------------------- 1, 2 and 3 */

    @Test
    @DisplayName("the wire is camelCase, the column stays snake_case, and week round-trips")
    void wireAndStorageDisagreeOnPurpose() throws Exception {
        var id = createTemplate("""
                {"name":"Push / Pull / Legs","goal":"Strength","weeks":4,"trainingDays":[1,2],
                 "dayLabels":{"1":"Push","2":"Pull"},
                 "exercises":[
                   {"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,"sets":3,"reps":8,
                    "restSeconds":90,"tempo":"3010"},
                   {"exerciseId":"%s","dayOfWeek":1,"week":2,"orderIndex":0,"sets":3,"reps":10,
                    "restSeconds":90}]}
                """.formatted(bench, row));

        mvc.perform(get("/v1/templates/" + id))
                .andExpect(status().isOk())
                // 1 · the wire the contract has always documented
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(bench.toString()))
                .andExpect(jsonPath("$.exercises[0].dayOfWeek").value(1))
                .andExpect(jsonPath("$.exercises[0].restSeconds").value(90))
                .andExpect(jsonPath("$.exercises[0].orderIndex").value(0))
                .andExpect(jsonPath("$.exercises[0].tempo").value("3010"))
                // 3 · week 2 is week 2, not week 1
                .andExpect(jsonPath("$.exercises[1].week").value(2))
                // 4 · both columns are readable back
                .andExpect(jsonPath("$.weeks").value(4))
                .andExpect(jsonPath("$.trainingDays[0]").value(1))
                .andExpect(jsonPath("$.trainingDays[1]").value(2));

        // 2 · what the phone reads is untouched
        String stored = jdbc.queryForObject(
                "SELECT structure::text FROM template WHERE id = :id::uuid",
                Map.of("id", id), String.class);
        assertThat(stored).contains("\"exercise_id\"")
                          .contains("\"day_of_week\"")
                          .contains("\"rest_seconds\"")
                          .contains("\"order_index\"")
                          .doesNotContain("\"exerciseId\"");
    }

    @Test
    @DisplayName("a day laid out with nothing on it is still a day")
    void anEmptyDayIsADay() throws Exception {
        var id = createTemplate("""
                {"name":"Upper / Lower","weeks":6,"trainingDays":[1,2,3],"exercises":[]}
                """);

        mvc.perform(get("/v1/templates/" + id))
                .andExpect(jsonPath("$.trainingDays.length()").value(3));
    }

    /* -------------------------------------------------------------------- 5 */

    @Test
    @DisplayName("apply snapshots — editing the template afterwards leaves the client's copy alone")
    void applyIsASnapshot() throws Exception {
        var id = createTemplate("""
                {"name":"Full body","weeks":4,"trainingDays":[1],
                 "exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,
                               "sets":3,"reps":8,"restSeconds":90}]}
                """.formatted(bench));

        String programId = applyTo(id, """
                {"clientId":"%s","schedule":[{"day":1,"weekday":3,"time":"06:30"}]}
                """.formatted(client));

        // The blueprint moves on. The client's copy must not.
        mvc.perform(put("/v1/templates/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,
                                               "sets":5,"reps":5,"restSeconds":180}]}
                                """.formatted(row)))
                .andExpect(status().isOk());

        mvc.perform(get("/v1/programs/%s/exercises".formatted(programId)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].exerciseId").value(bench.toString()))
                .andExpect(jsonPath("$[0].sets").value(3))
                .andExpect(jsonPath("$[0].reps").value(8))
                // and the ordinal slot became the weekday the trainer chose
                .andExpect(jsonPath("$[0].dayOfWeek").value(3));
    }

    /* -------------------------------------------------------------------- 6 */

    @Test
    @DisplayName("resync pushes the blueprint and keeps the client's own weekday")
    void resyncKeepsTheSchedule() throws Exception {
        var id = createTemplate("""
                {"name":"Full body","weeks":4,"trainingDays":[1],
                 "exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,
                               "sets":3,"reps":8,"restSeconds":90}]}
                """.formatted(bench));

        String programId = applyTo(id, """
                {"clientId":"%s","schedule":[{"day":1,"weekday":3,"time":"06:30"}]}
                """.formatted(client));

        mvc.perform(put("/v1/templates/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,
                                               "sets":5,"reps":5,"restSeconds":180}]}
                                """.formatted(row)))
                .andExpect(status().isOk());

        mvc.perform(post("/v1/programs/%s/resync".formatted(programId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removed").value(1))
                .andExpect(jsonPath("$.added").value(1));

        mvc.perform(get("/v1/programs/%s/exercises".formatted(programId)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].exerciseId").value(row.toString()))
                .andExpect(jsonPath("$[0].sets").value(5))
                // Wednesday is still Wednesday. A blueprint edit is not a reason
                // to move somebody's training day.
                .andExpect(jsonPath("$[0].dayOfWeek").value(3));
    }

    @Test
    @DisplayName("a blueprint that grew a day refuses the resync rather than inventing a weekday")
    void resyncRefusesAnUnscheduledDay() throws Exception {
        var id = createTemplate("""
                {"name":"Full body","weeks":4,"trainingDays":[1],
                 "exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,"sets":3,"reps":8}]}
                """.formatted(bench));

        String programId = applyTo(id, """
                {"clientId":"%s","schedule":[{"day":1,"weekday":3,"time":"06:30"}]}
                """.formatted(client));

        mvc.perform(put("/v1/templates/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trainingDays\":[1,2]}"))
                .andExpect(status().isOk());

        mvc.perform(post("/v1/programs/%s/resync".formatted(programId)))
                .andExpect(status().isBadRequest());
    }

    /* ------------------------------------------------------ duplicate, count */

    @Test
    @DisplayName("duplicate copies the blueprint and takes nobody with it")
    void duplicateCarriesNoClients() throws Exception {
        var id = createTemplate("""
                {"name":"Push / Pull / Legs","weeks":8,"trainingDays":[1],
                 "exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,"sets":3,"reps":8}]}
                """.formatted(bench));
        applyTo(id, """
                {"clientId":"%s","schedule":[{"day":1,"weekday":3,"time":"06:30"}]}
                """.formatted(client));

        mvc.perform(get("/v1/templates/" + id))
                .andExpect(jsonPath("$.assignedCount").value(1))
                .andExpect(jsonPath("$.activeAssignedCount").value(1));

        mvc.perform(post("/v1/templates/%s/duplicate".formatted(id)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Push / Pull / Legs (copy)"))
                .andExpect(jsonPath("$.weeks").value(8))
                .andExpect(jsonPath("$.exercises.length()").value(1))
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(bench.toString()))
                // The copy is safe to edit precisely because nobody is on it.
                .andExpect(jsonPath("$.assignedCount").value(0));

        // A second copy is numbered rather than allowed to collide.
        mvc.perform(post("/v1/templates/%s/duplicate".formatted(id)))
                .andExpect(jsonPath("$.name").value("Push / Pull / Legs (copy 2)"));
    }

    @Test
    @DisplayName("assignments name the client, and a stale copy admits it")
    void assignmentsReportStaleness() throws Exception {
        var id = createTemplate("""
                {"name":"Full body","weeks":4,"trainingDays":[1],
                 "exercises":[{"exerciseId":"%s","dayOfWeek":1,"week":1,"orderIndex":0,"sets":3,"reps":8}]}
                """.formatted(bench));
        applyTo(id, """
                {"clientId":"%s","schedule":[{"day":1,"weekday":3,"time":"06:30"}]}
                """.formatted(client));

        mvc.perform(get("/v1/templates/%s/assignments".formatted(id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].clientName").value("Meera"))
                .andExpect(jsonPath("$[0].behindTemplate").value(false));

        /* Age the copy by an hour, which is what a real edit does the other way
           round. It has to be done with the trigger off and it cannot be done
           with NOW(): `set_updated_at` forces `NEW.updated_at = NOW()` on every
           UPDATE, and inside this one test transaction `NOW()` is a constant —
           so template and program stamp to the identical instant and `<` ties.
           In production each request is its own transaction and they differ. */
        jdbc.getJdbcTemplate().execute("ALTER TABLE program DISABLE TRIGGER trg_program_updated_at");
        jdbc.update("UPDATE program SET updated_at = NOW() - INTERVAL '1 hour' WHERE template_id = :id::uuid",
                Map.of("id", id));
        jdbc.getJdbcTemplate().execute("ALTER TABLE program ENABLE TRIGGER trg_program_updated_at");

        mvc.perform(get("/v1/templates/%s/assignments".formatted(id)))
                .andExpect(jsonPath("$[0].behindTemplate").value(true));
    }

    @Test
    @DisplayName("another trainer's template is a 404 on every new route")
    void ownershipHolds() throws Exception {
        var id = createTemplate("{\"name\":\"Mine\",\"exercises\":[]}");
        signedInAs(other);

        mvc.perform(post("/v1/templates/%s/duplicate".formatted(id)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/templates/%s/assignments".formatted(id)))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- fixtures */

    private String createTemplate(String body) throws Exception {
        String json = mvc.perform(post("/v1/templates")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^\\{\"id\":\"([^\"]+)\".*$", "$1");
    }

    private String applyTo(String templateId, String body) throws Exception {
        String json = mvc.perform(post("/v1/templates/%s/apply".formatted(templateId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^\\{\"id\":\"([^\"]+)\".*$", "$1");
    }

    private UUID exercise(String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, :name, false)
                """, Map.of("id", id.toString(), "name", name));
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

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
