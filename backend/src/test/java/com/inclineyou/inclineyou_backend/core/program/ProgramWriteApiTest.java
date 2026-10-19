package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code PATCH /v1/programs/{id}} (A3) and the id-conflict path of {@code PUT /v1/programs/{id}} (A2). Pins that a PATCH
 * writes only the fields that were sent and only the caller's own row, that a template refuses a plan's dates, that a bad
 * date pair writes nothing, and that a PUT naming a workout id owned by another program — the caller's or anyone's — is a
 * plain 409 that leaves the other row untouched and says nothing about whose it is. Also pins the ceiling on a tree save
 * (400 workouts, 60 exercises a workout), and that removing a workout re-points only the future, live sessions booked on it.
 */
@SpringBootTest
@Transactional
class ProgramWriteApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ProgramJdbcRepository programs;

    private MockMvc mvc;
    private UUID me, other, tenant;
    private UUID myTemplate, myPlan, theirPlan, theirWorkout;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001951", "Write Trainer");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001952", "Someone Else");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        myTemplate = template(me, tenant, "My template");
        myPlan = plan(client(me, "Mine", "+919841095001"), me, tenant, "My plan");
        theirPlan = plan(client(other, "Theirs", "+919841095002"), other, tenantOf(other), "Their plan");
        theirWorkout = workout(theirPlan, other, tenantOf(other), "Their day");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("PATCH writes the fields sent, clears one sent as null, leaves the rest, and moves the version")
    void patchWritesOnlyWhatWasSent() throws Exception {
        // revised_at backdated: now() is fixed for the test's one transaction, so it could not move otherwise
        jdbc.update("UPDATE program SET goal = 'strength', description = 'old', start_date = '2026-10-01', "
                        + "revised_at = now() - interval '1 day' WHERE id = :p::uuid",
                Map.of("p", myPlan.toString()));
        String before = row(myPlan).get("revised_at").toString();

        mvc.perform(patch("/v1/programs/" + myPlan).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Renamed  \",\"description\":null,\"endDate\":\"2026-12-31\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"));

        var after = row(myPlan);
        assertEquals("Renamed", after.get("name"));
        assertNull(after.get("description"), "sent as null, so cleared");
        assertEquals("strength", after.get("goal"), "not sent, so left alone");
        assertEquals("2026-10-01", after.get("start_date").toString(), "merged from the row, not cleared");
        assertEquals("2026-12-31", after.get("end_date").toString());
        assertEquals("active", after.get("status"));
        assertNotEquals(before, after.get("revised_at").toString());
    }

    @Test
    @DisplayName("PATCH on another trainer's plan is a 404 and their row is unchanged")
    void patchAnotherTrainersPlan() throws Exception {
        var before = row(theirPlan);
        mvc.perform(patch("/v1/programs/" + theirPlan).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hijacked\",\"status\":\"completed\",\"startDate\":\"2026-01-01\"}"))
                .andExpect(status().isNotFound());
        assertEquals(before, row(theirPlan));
    }

    @Test
    @DisplayName("PATCH a template's dates or status is 422 PROGRAM_IS_TEMPLATE and writes nothing")
    void patchTemplateDates() throws Exception {
        var before = row(myTemplate);
        mvc.perform(patch("/v1/programs/" + myTemplate).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\",\"startDate\":\"2026-11-01\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PROGRAM_IS_TEMPLATE"));
        assertEquals(before, row(myTemplate));
    }

    @Test
    @DisplayName("PATCH an end before the stored start is 400 and writes nothing, the name sent with it included")
    void patchEndBeforeStart() throws Exception {
        jdbc.update("UPDATE program SET start_date = '2026-10-10' WHERE id = :p::uuid", Map.of("p", myPlan.toString()));
        var before = row(myPlan);
        mvc.perform(patch("/v1/programs/" + myPlan).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\",\"endDate\":\"2026-10-01\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(before, row(myPlan));
    }

    @Test
    @DisplayName("PUT naming another trainer's workout id is a plain 409 ID_CONFLICT; their workout is untouched and nothing says whose it is")
    void putWithAnotherTrainersWorkoutId() throws Exception {
        var before = workoutRow(theirWorkout);
        mvc.perform(put("/v1/programs/" + myTemplate).header("If-Match", versionOf(myTemplate))
                        .contentType(MediaType.APPLICATION_JSON).content(treeWith(theirWorkout)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ID_CONFLICT"))
                .andExpect(jsonPath("$.detail").value("That id is already in use."));
        assertEquals(before, workoutRow(theirWorkout));
    }

    @Test
    @DisplayName("PUT naming a workout id from the trainer's own other program is a 409 too — a workout never moves between programs")
    void putWithOwnOtherProgramsWorkoutId() throws Exception {
        UUID myWorkout = workout(myPlan, me, tenant, "Plan day");
        var before = workoutRow(myWorkout);
        mvc.perform(put("/v1/programs/" + myTemplate).header("If-Match", versionOf(myTemplate))
                        .contentType(MediaType.APPLICATION_JSON).content(treeWith(myWorkout)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ID_CONFLICT"));
        assertEquals(before, workoutRow(myWorkout));
    }

    @Test
    @DisplayName("PUT on the trainer's own template saves the shape and the tree")
    void putOwnTemplate() throws Exception {
        UUID fresh = UUID.randomUUID();
        mvc.perform(put("/v1/programs/" + myTemplate).header("If-Match", versionOf(myTemplate))
                        .contentType(MediaType.APPLICATION_JSON).content(treeWith(fresh)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days").value(3))
                .andExpect(jsonPath("$.workouts[0].id").value(fresh.toString()));
        assertEquals(3, jdbc.queryForObject("SELECT days FROM program WHERE id = :p::uuid", Map.of("p", myTemplate.toString()), Integer.class));
        assertEquals(myTemplate.toString(), workoutRow(fresh).get("program_id"));
    }

    @Test
    @DisplayName("PATCH status moves the trainer's own plan; another trainer's is a 404 and keeps its status")
    void patchStatus() throws Exception {
        mvc.perform(patch("/v1/programs/" + myPlan).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"paused\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("paused"));
        assertEquals("paused", row(myPlan).get("status"));
        mvc.perform(patch("/v1/programs/" + theirPlan).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"paused\"}"))
                .andExpect(status().isNotFound());
        assertEquals("active", row(theirPlan).get("status"));
    }

    @Test
    @DisplayName("DELETE retires the trainer's own template and its workouts; another trainer's template is a 404 and stays live")
    void retire() throws Exception {
        UUID day = workout(myTemplate, me, tenant, "Template day");
        mvc.perform(delete("/v1/programs/" + myTemplate))
                .andExpect(status().isNoContent());
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM program WHERE id = :p::uuid", Map.of("p", myTemplate.toString()), Object.class));
        assertNotNull(workoutRow(day).get("deleted_at"));

        UUID theirTemplate = template(other, tenantOf(other), "Their template");
        UUID theirDay = workout(theirTemplate, other, tenantOf(other), "Their template day");
        mvc.perform(delete("/v1/programs/" + theirTemplate))
                .andExpect(status().isNotFound());
        assertNull(jdbc.queryForObject("SELECT deleted_at FROM program WHERE id = :p::uuid", Map.of("p", theirTemplate.toString()), Object.class));
        assertNull(workoutRow(theirDay).get("deleted_at"));
    }

    @Test
    @DisplayName("The sessions re-pointed when a workout is removed are the future, live, un-started ones only — never a past or deleted one")
    void relinkTouchesOnlyFutureLiveSessions() {
        UUID client = UUID.fromString(jdbc.queryForObject("SELECT client_id::text FROM program WHERE id = :p::uuid",
                Map.of("p", myPlan.toString()), String.class));
        UUID day = workout(myPlan, me, tenant, "Plan day");
        UUID future = session(client, day, "now() + interval '2 days'", false);
        session(client, day, "now() - interval '2 days'", false);   // missed, never marked: its history keeps the workout
        session(client, day, "now() + interval '3 days'", true);    // deleted: nothing to re-point

        assertEquals(List.of(future.toString()), programs.futureSessionsOn(client.toString(), List.of(day)));
    }

    @Test
    @DisplayName("PUT with more than 400 workouts is a 400 and writes nothing")
    void putTooManyWorkouts() throws Exception {
        var workouts = new StringBuilder();
        for (int i = 0; i < 401; i++) {
            workouts.append(i == 0 ? "" : ",").append("{\"name\":\"Day\",\"week\":1,\"day\":1,\"exercises\":[]}");
        }
        String before = versionOf(myTemplate);
        mvc.perform(put("/v1/programs/" + myTemplate).header("If-Match", before).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"My template\",\"weeks\":4,\"days\":3,\"workouts\":[" + workouts + "]}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, liveWorkouts(myTemplate));
        assertEquals(before, versionOf(myTemplate));
    }

    @Test
    @DisplayName("PUT with more than 60 exercises on one workout is a 400 and writes nothing")
    void putTooManyExercisesOnAWorkout() throws Exception {
        var exercises = new StringBuilder();
        for (int i = 0; i < 61; i++) {
            exercises.append(i == 0 ? "" : ",").append("{\"exerciseId\":\"").append(UUID.randomUUID()).append("\"}");
        }
        String before = versionOf(myTemplate);
        mvc.perform(put("/v1/programs/" + myTemplate).header("If-Match", before).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"My template\",\"weeks\":4,\"days\":3,\"workouts\":[{\"name\":\"Day\",\"week\":1,"
                                + "\"day\":1,\"exercises\":[" + exercises + "]}]}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, liveWorkouts(myTemplate));
        assertEquals(before, versionOf(myTemplate));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private int liveWorkouts(UUID program) {
        return jdbc.queryForObject("SELECT count(*) FROM workout WHERE program_id = :p::uuid AND deleted_at IS NULL",
                Map.of("p", program.toString()), Integer.class);
    }

    /** {@code at} is SQL, relative to the test transaction's {@code now()}, which is the same instant the query reads. */
    private UUID session(UUID clientId, UUID workoutId, String at, boolean deleted) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, deleted_at) "
                        + "VALUES (:id::uuid, :t::uuid, :c::uuid, :w::uuid, " + at + ", 60, " + at + " + interval '60 minutes', "
                        + (deleted ? "now()" : "NULL") + ")",
                Map.of("id", id.toString(), "t", me.toString(), "c", clientId.toString(), "w", workoutId.toString()));
        return id;
    }

    private static String treeWith(UUID workoutId) {
        return "{\"name\":\"My template\",\"weeks\":4,\"days\":3,\"workouts\":[{\"id\":\"" + workoutId
                + "\",\"name\":\"Stolen\",\"week\":1,\"day\":1,\"exercises\":[]}]}";
    }

    private String versionOf(UUID program) throws Exception {
        return mvc.perform(get("/v1/programs/" + program)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
    }

    private Map<String, Object> row(UUID program) {
        return jdbc.queryForMap("SELECT name, goal, description, status, start_date, end_date, revised_at, trainer_id::text AS trainer_id "
                + "FROM program WHERE id = :p::uuid", Map.of("p", program.toString()));
    }

    private Map<String, Object> workoutRow(UUID workout) {
        return jdbc.queryForMap("SELECT program_id::text AS program_id, trainer_id::text AS trainer_id, name, week, day, position, deleted_at "
                + "FROM workout WHERE id = :w::uuid", Map.of("w", workout.toString()));
    }

    private UUID workout(UUID program, UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) "
                        + "VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, 1, 1, 0, :n)",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenantId.toString(), "p", program.toString(), "n", name));
        return id;
    }

    private UUID template(UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :n, 4)",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenantId.toString(), "n", name));
        return id;
    }

    private UUID plan(UUID clientId, UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantId.toString());
        p.put("c", clientId.toString()); p.put("n", name);
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) "
                + "VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', :n, 4)", p);
        return id;
    }

    private UUID client(UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantOf(trainerId).toString());
        p.put("n", name); p.put("ph", phone);
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, :ph, 'independent')", p);
        return id;
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
