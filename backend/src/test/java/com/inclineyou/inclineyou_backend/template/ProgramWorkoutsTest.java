package com.inclineyou.inclineyou_backend.template;

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

import static org.hamcrest.Matchers.contains;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Module 6 of the redesign's backend pass — the program builder's new shape and
 * the two things `apply` now does on its own.
 *
 * <ol>
 *   <li><b>A day holds named workouts</b>, and `workoutId` / `workoutName`
 *       survive every save and the copy onto a client (V10);</li>
 *   <li><b>`apply` with no schedule</b> pairs the client's standing week with
 *       the template's days by position, and refuses a count that does not
 *       match with a typed {@code SCHEDULE_MISMATCH};</li>
 *   <li><b>`apply` ends the caller's previous plan</b> for that client — and
 *       never a teammate's;</li>
 *   <li><b>the shelf's avatar sample</b> is at most six active clients, in a
 *       total order, and only the caller's own.</li>
 * </ol>
 */
@SpringBootTest
@Transactional
class ProgramWorkoutsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner;
    private UUID other;
    private UUID client;
    private UUID bench;
    private UUID row;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100001001");
        other = trainer("9100001002");
        client = client(owner, "Meera");
        bench = exercise("Bench press");
        row = exercise("Barbell row");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── 1 · workouts on a day ───────────────────────────────────────────── */

    @Test
    @DisplayName("two named workouts on one day survive a template save and a re-read")
    void templateKeepsWorkouts() throws Exception {
        String tpl = twoWorkoutTemplate();
        mvc.perform(get("/v1/templates/" + tpl))
                .andExpect(jsonPath("$.exercises[0].workoutId").value("w-upper"))
                .andExpect(jsonPath("$.exercises[0].workoutName").value("Upper A"))
                .andExpect(jsonPath("$.exercises[1].workoutId").value("w-cond"))
                .andExpect(jsonPath("$.exercises[1].workoutName").value("Conditioning"));

        // …and a duplicate carries them, because it copies the blob as stored.
        String json = mvc.perform(post("/v1/templates/" + tpl + "/duplicate"))
                .andReturn().getResponse().getContentAsString();
        assertEquals("Conditioning", com.jayway.jsonpath.JsonPath.read(json, "$.exercises[1].workoutName"));
    }

    @Test
    @DisplayName("apply copies the blocks onto the client's rows, and the copy's own save keeps them")
    void copyKeepsWorkouts() throws Exception {
        String program = apply(twoWorkoutTemplate(),
                "\"schedule\":[{\"day\":1,\"weekday\":2,\"time\":\"07:00\"}]");

        mvc.perform(get("/v1/programs/" + program + "/exercises"))
                .andExpect(jsonPath("$[*].workoutName", contains("Upper A", "Conditioning")))
                .andExpect(jsonPath("$[0].dayOfWeek").value(2));

        mvc.perform(put("/v1/programs/" + program + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"exercises":[
                                  {"exerciseId":"%s","dayOfWeek":2,"orderIndex":0,"sets":4,
                                   "workoutId":"w-upper","workoutName":"Upper A (heavy)"}]}
                                """.formatted(bench)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].workoutName").value("Upper A (heavy)"))
                .andExpect(jsonPath("$[0].workoutId").value("w-upper"));

        String rowId = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(get("/v1/programs/" + program + "/exercises"))
                        .andReturn().getResponse().getContentAsString(), "$[0].id");
        mvc.perform(put("/v1/programs/" + program + "/exercises/" + rowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workoutName\":\"\"}"))
                .andExpect(jsonPath("$.workoutName").doesNotExist())
                .andExpect(jsonPath("$.workoutId").value("w-upper"));
    }

    /* ── 2 · apply with no schedule ──────────────────────────────────────── */

    @Test
    @DisplayName("no schedule sent: the client's Mon/Thu takes the template's Day 1 / Day 2 by position")
    void derivesScheduleFromStandingWeek() throws Exception {
        standingWeek("[{\"templateDay\":1,\"weekday\":4,\"time\":\"18:00\"}," +
                     "{\"templateDay\":2,\"weekday\":1,\"time\":\"07:00\"}]");
        String program = apply(pushPull(), null);

        var days = jdbc.queryForList("""
                SELECT e.name, pe.day_of_week FROM program_exercise pe JOIN exercise e ON e.id = pe.exercise_id
                WHERE pe.program_id = :pid::uuid AND pe.deleted_at IS NULL ORDER BY pe.day_of_week
                """, Map.of("pid", program));
        // Monday is the week's first slot, so it takes Day 1 (bench); Thursday takes Day 2 (row).
        assertEquals("Bench press", days.get(0).get("name"));
        assertEquals(1, days.get(0).get("day_of_week"));
        assertEquals("Barbell row", days.get(1).get("name"));
        assertEquals(4, days.get(1).get("day_of_week"));
    }

    @Test
    @DisplayName("no schedule and a week of a different size is a typed 400 that names both numbers")
    void mismatchIsTyped() throws Exception {
        standingWeek("[{\"templateDay\":1,\"weekday\":1,\"time\":\"07:00\"}]");
        mvc.perform(post("/v1/templates/" + pushPull() + "/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + client + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SCHEDULE_MISMATCH"))
                .andExpect(jsonPath("$.detail").value(
                        "This program trains 2 days a week and this client trains 1. Choose which days it goes on."));
    }

    @Test
    @DisplayName("an explicit schedule that does not fit is the same typed 400, with its sentence")
    void explicitMismatchIsTyped() throws Exception {
        mvc.perform(post("/v1/templates/" + pushPull() + "/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + client + "\",\"schedule\":[" +
                                 "{\"day\":1,\"weekday\":1,\"time\":\"07:00\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SCHEDULE_MISMATCH"));
    }

    /* ── 3 · one live plan ───────────────────────────────────────────────── */

    @Test
    @DisplayName("a second apply completes the first plan — and leaves a teammate's plan alone")
    void applyEndsOnlyTheCallersPriorPlan() throws Exception {
        String sched = "\"schedule\":[{\"day\":1,\"weekday\":1,\"time\":\"07:00\"}," +
                       "{\"day\":2,\"weekday\":4,\"time\":\"07:00\"}]";
        String first = apply(pushPull(), sched);
        UUID teammates = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Their plan', 'active')
                """, Map.of("id", teammates.toString(), "tid", other.toString(), "cid", client.toString()));

        String second = apply(pushPull(), sched);

        assertEquals("completed", statusOf(first));
        assertEquals("active", statusOf(second));
        assertEquals("active", statusOf(teammates.toString()), "not the caller's to end");
        assertEquals(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).toString(),
                jdbc.queryForObject("SELECT end_date::text FROM program WHERE id = :id::uuid",
                        Map.of("id", first), String.class));
    }

    /* ── 4 · the shelf's sample ──────────────────────────────────────────── */

    @Test
    @DisplayName("the shelf samples at most six active clients by name, and only the caller's")
    void assignedSample() throws Exception {
        String tpl = pushPull();
        String[] names = {"Zara", "Anil", "Kiran", "Bhavna", "Farah", "Dev", "Esha"};
        for (String n : names) activeCopy(tpl, client(owner, n), owner, "active");
        activeCopy(tpl, client(owner, "Aaron"), owner, "completed");     // not active
        activeCopy(tpl, client(other, "Aadya"), other, "active");        // a teammate's

        mvc.perform(get("/v1/templates"))
                .andExpect(jsonPath("$[?(@.id == '" + tpl + "')].assignedClients[*].name",
                        contains("Anil", "Bhavna", "Dev", "Esha", "Farah", "Kiran")));
        mvc.perform(get("/v1/templates/" + tpl))
                .andExpect(jsonPath("$.assignedClients.length()").value(6))
                .andExpect(jsonPath("$.activeAssignedCount").value(8));
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private String twoWorkoutTemplate() throws Exception {
        return create("""
                {"name":"Upper + conditioning","trainingDays":[1],
                 "exercises":[
                   {"exerciseId":"%s","dayOfWeek":1,"orderIndex":0,"sets":3,
                    "workoutId":"w-upper","workoutName":"  Upper A  "},
                   {"exerciseId":"%s","dayOfWeek":1,"orderIndex":1,"sets":3,
                    "workoutId":"w-cond","workoutName":"Conditioning"}]}
                """.formatted(bench, row));
    }

    private String pushPull() throws Exception {
        return create("""
                {"name":"Push Pull","trainingDays":[1,2],
                 "exercises":[
                   {"exerciseId":"%s","dayOfWeek":1,"orderIndex":0,"sets":3},
                   {"exerciseId":"%s","dayOfWeek":2,"orderIndex":0,"sets":3}]}
                """.formatted(bench, row));
    }

    private String create(String body) throws Exception {
        String json = mvc.perform(post("/v1/templates").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private String apply(String tpl, String scheduleFragment) throws Exception {
        String body = "{\"clientId\":\"" + client + "\"" + (scheduleFragment == null ? "" : "," + scheduleFragment) + "}";
        String json = mvc.perform(post("/v1/templates/" + tpl + "/apply")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private void activeCopy(String tpl, UUID clientId, UUID trainerId, String status) {
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, template_id, name, status)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :tpl::uuid, 'copy', :status)
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString(), "tpl", tpl, "status", status));
    }

    private void standingWeek(String json) {
        jdbc.update("UPDATE client SET weekly_schedule = CAST(:w AS jsonb) WHERE id = :id::uuid",
                Map.of("w", json, "id", client.toString()));
    }

    private String statusOf(String programId) {
        return jdbc.queryForObject("SELECT status FROM program WHERE id = :id::uuid",
                Map.of("id", programId), String.class);
    }

    private UUID exercise(String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, :name, false)",
                Map.of("id", id.toString(), "name", name));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name) VALUES (:id::uuid, :tid::uuid, :name)",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone", Map.of("phone", phone), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
