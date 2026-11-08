package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/programs} (Programs L1): which read answers for each combination of {@code kind}, {@code clientId} and
 * {@code status}. Pins the default shelf, the three refusals (a template has no client, a template has no status, and a status
 * never brings templates along), the client file's all-statuses read with its order and progress, and that another trainer's
 * programs and a deleted client's plans never show.
 */
@SpringBootTest
@Transactional
class ProgramListApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant;
    private UUID tplA, tplB;
    private UUID active, paused, completed, deletedClient, clientWithTwo;
    private UUID twoActive, twoOld;

    @BeforeEach
    void setUp() {
        me = trainer("+919100001901", "List Trainer");
        var auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        other = trainer("+919100001902", "Someone Else");
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));

        tplA = template(me, tenant, "Template A");
        tplB = template(me, tenant, "Template B");
        template(other, tenantOf(other), "Not mine");

        active = plan(client("Active Client", "+919841090001"), "Active plan", "active");
        paused = plan(client("Paused Client", "+919841090002"), "Paused plan", "paused");
        completed = plan(client("Done Client", "+919841090003"), "Completed plan", "completed");
        UUID gone = client("Deleted Client", "+919841090004");
        deletedClient = plan(gone, "Plan of a deleted client", "active");
        jdbc.update("UPDATE client SET deleted_at = now() WHERE id = :c::uuid", Map.of("c", gone.toString()));
        plan(client(other, "Theirs", "+919841090005"), other, tenantOf(other), "Their plan", "active");

        clientWithTwo = client("Two Plans", "+919841090006");
        twoOld = plan(clientWithTwo, "Old plan", "completed");
        twoActive = plan(clientWithTwo, "Current plan", "active");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("default shelf: the templates and the plans in progress — not completed plans, not a deleted client's, not another trainer's")
    void defaultShelf() throws Exception {
        assertEquals(ids(tplA, tplB, active, paused, twoActive), idsOf("/v1/programs"));
    }

    @Test
    @DisplayName("kind=template: only templates")
    void templates() throws Exception {
        assertEquals(ids(tplA, tplB), idsOf("/v1/programs?kind=template"));
    }

    @Test
    @DisplayName("kind=client: plans in progress by default; a named status replaces that")
    void plans() throws Exception {
        assertEquals(ids(active, paused, twoActive), idsOf("/v1/programs?kind=client"));
        assertEquals(ids(completed, twoOld), idsOf("/v1/programs?kind=client&status=completed"));
        assertEquals(ids(active, paused, completed, twoActive, twoOld), idsOf("/v1/programs?kind=client&status=active,paused,completed"));
    }

    @Test
    @DisplayName("a status without a kind is plans only — it used to bring every template along")
    void statusNeverBringsTemplates() throws Exception {
        assertEquals(ids(completed, twoOld), idsOf("/v1/programs?status=completed"));
        assertEquals(ids(paused), idsOf("/v1/programs?status=paused"));
    }

    @Test
    @DisplayName("a template has no client and no status: asking for either is a 400, not an empty list or a filter that does nothing")
    void contradictions() throws Exception {
        mvc.perform(get("/v1/programs?kind=template&clientId=" + clientWithTwo))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("clientId: a template has no client"));
        mvc.perform(get("/v1/programs?kind=template&status=completed"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("status: a template has no status"));
    }

    @Test
    @DisplayName("clientId: that client's plans, every status, the active one first, each with progress")
    void clientFile() throws Exception {
        String body = mvc.perform(get("/v1/programs?clientId=" + clientWithTwo)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].progress").exists()).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(twoActive.toString(), twoOld.toString()), JsonPath.<List<String>>read(body, "$.items[*].id"));
        assertEquals(ids(twoOld), idsOf("/v1/programs?clientId=" + clientWithTwo + "&status=completed"));
        assertEquals(ids(twoActive), idsOf("/v1/programs?clientId=" + clientWithTwo + "&kind=client&status=active"));
    }

    @Test
    @DisplayName("a client who is not on the roster, or was deleted, is a 404; a stranger's id is a 404")
    void rosterScope() throws Exception {
        mvc.perform(get("/v1/programs?clientId=" + UUID.randomUUID())).andExpect(status().isNotFound());
        mvc.perform(get("/v1/programs?clientId=" + clientOf(deletedClient))).andExpect(status().isNotFound());
        mvc.perform(get("/v1/programs?clientId=" + clientOf(plan(client(other, "X", "+919841090099"), other, tenantOf(other), "Y", "active"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a bad kind, a bad status (including an empty one in a list) and a bad id are 400; a blank status is no status")
    void validation() throws Exception {
        mvc.perform(get("/v1/programs?kind=bogus")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/programs?status=bogus")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/programs?status=active,,paused")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/programs?clientId=zzz")).andExpect(status().isBadRequest());
        assertEquals(ids(tplA, tplB, active, paused, twoActive), idsOf("/v1/programs?status="));
    }

    @Test
    @DisplayName("a template counts every live copy onto a client, finished ones too; a plan reads 0, and no client list is served")
    void usedCount() throws Exception {
        UUID onIt = plan(client("On A", "+919841090010"), "Copy of A", "active");
        UUID finished = plan(client("Done A", "+919841090011"), "Old copy of A", "completed");
        UUID gone = plan(client("Gone A", "+919841090012"), "Deleted copy of A", "active");
        for (UUID copy : List.of(onIt, finished, gone)) {
            jdbc.update("UPDATE program SET copied_from_program_id = :s::uuid, synced_at = now() WHERE id = :p::uuid",
                    Map.of("s", tplA.toString(), "p", copy.toString()));
        }
        jdbc.update("UPDATE program SET deleted_at = now() WHERE id = :p::uuid", Map.of("p", gone.toString()));

        String body = mvc.perform(get("/v1/programs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(2), JsonPath.<List<Integer>>read(body, "$.items[?(@.id=='" + tplA + "')].assignedCount"));
        assertEquals(List.of(0), JsonPath.<List<Integer>>read(body, "$.items[?(@.id=='" + tplB + "')].assignedCount"));
        assertEquals(List.of(0), JsonPath.<List<Integer>>read(body, "$.items[?(@.id=='" + onIt + "')].assignedCount"));
        assertEquals(List.of(), JsonPath.<List<Object>>read(body, "$.items[?(@.activeAssignedCount)]"));
        assertEquals(List.of(), JsonPath.<List<Object>>read(body, "$.items[?(@.assignedClients)]"));
        mvc.perform(get("/v1/programs/" + tplA)).andExpect(status().isOk()).andExpect(jsonPath("$.assignedCount").value(2));
        mvc.perform(get("/v1/programs/" + tplA + "/assignments")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a summary counts live workouts and MAIN exercises only (not a deleted workout, not an alternative) and says where a copy came from")
    void summaryContent() throws Exception {
        UUID ex = UUID.fromString(jdbc.queryForObject("SELECT id::text FROM exercise LIMIT 1", Map.of(), String.class));
        UUID w1 = workout(tplA, 1, "Day 1", false);
        UUID w2 = workout(tplA, 2, "Day 2", false);
        UUID gone = workout(tplA, 3, "Deleted day", true);
        UUID main = exercise(w1, ex, 0, null);
        exercise(w1, ex, 1, null);
        exercise(w1, ex, 1, main);      // an alternative to the first: shown in the builder, not counted
        exercise(w2, ex, 0, null);
        exercise(gone, ex, 0, null);    // belongs to a deleted workout
        UUID copy = plan(client("Copy Of A", "+919841090020"), "Copy of A", "active");
        jdbc.update("UPDATE program SET copied_from_program_id = :s::uuid, synced_at = now() WHERE id = :p::uuid", Map.of("s", tplA.toString(), "p", copy.toString()));

        mvc.perform(get("/v1/programs?kind=template"))
                .andExpect(jsonPath("$.items[?(@.id=='" + tplA + "')].workoutCount").value(2))
                .andExpect(jsonPath("$.items[?(@.id=='" + tplA + "')].exerciseCount").value(3))
                .andExpect(jsonPath("$.items[?(@.id=='" + tplB + "')].workoutCount").value(0))
                .andExpect(jsonPath("$.items[?(@.id=='" + tplB + "')].exerciseCount").value(0));

        String body = mvc.perform(get("/v1/programs?clientId=" + clientOf(copy))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(0, (int) JsonPath.<Integer>read(body, "$.items[0].workoutCount"), "the copy has no workouts of its own");
        assertEquals("Template A", JsonPath.read(body, "$.items[0].copiedFrom.name"));
        assertEquals(tplA.toString(), JsonPath.read(body, "$.items[0].copiedFromProgramId"));
        assertEquals(Boolean.FALSE, JsonPath.read(body, "$.items[0].behind"));
        assertEquals(clientOf(copy).toString(), JsonPath.read(body, "$.items[0].clientId"));
        assertEquals(JsonPath.read(body, "$.items[0].revisedAt").toString(), JsonPath.read(body, "$.items[0].version"));

        jdbc.update("UPDATE program SET revised_at = now() + interval '1 minute' WHERE id = :s::uuid", Map.of("s", tplA.toString()));
        body = mvc.perform(get("/v1/programs?clientId=" + clientOf(copy))).andReturn().getResponse().getContentAsString();
        assertEquals(Boolean.TRUE, JsonPath.read(body, "$.items[0].behind"), "the template moved on after this copy was made");
    }

    @Test
    @DisplayName("the library: every item carries its certified block and a tree-sized count, and the one-item read agrees with the list")
    void library() throws Exception {
        String list = mvc.perform(get("/v1/programs/certified")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> summaries = JsonPath.read(list, "$.items[*].certified.summary");
        assertEquals(JsonPath.<List<String>>read(list, "$.items[*].id").size(), summaries.size());
        String id = JsonPath.read(list, "$.items[0].id");
        int listed = JsonPath.read(list, "$.items[0].workoutCount");
        int listedExercises = JsonPath.read(list, "$.items[0].exerciseCount");
        mvc.perform(get("/v1/programs/certified/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.workoutCount").value(listed)).andExpect(jsonPath("$.exerciseCount").value(listedExercises))
                .andExpect(jsonPath("$.certified.summary").value(JsonPath.<String>read(list, "$.items[0].certified.summary")));
        // a library id is not a trainer's program, on any route but /certified
        mvc.perform(get("/v1/programs/" + id)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("one program's tree: workouts in week/day order without a deleted one, mains in position order with their sets, an alternative nested under its main (and never listed as a main), a names dictionary that keeps a retired exercise, and the version as the ETag")
    void programTree() throws Exception {
        List<String> two = jdbc.queryForList("SELECT id::text FROM exercise WHERE deleted_at IS NULL ORDER BY id LIMIT 3", Map.of(), String.class);
        UUID squat = UUID.fromString(two.get(0)), press = UUID.fromString(two.get(1)), swap = UUID.fromString(two.get(2));
        UUID week2 = workout(tplA, 2, "Week two", false);     // inserted first, read second
        UUID week1 = workout(tplA, 1, "Week one", false);
        workout(tplA, 3, "Removed day", true);
        UUID second = exercise(week1, press, 1, null);         // inserted first, read second
        UUID first = exercise(week1, squat, 0, null);
        UUID alt = exercise(week1, swap, 1, first);
        set(first, 2, "weight", 60, "reps", 8);
        set(first, 1, "weight", 50, "reps", 10);
        set(alt, 1, "bodyweight", null, "max_reps", null);
        exercise(week2, squat, 0, null);
        // the press is retired after the plan prescribed it: the plan still reads its name (R83)
        jdbc.update("UPDATE exercise SET deleted_at = now() WHERE id = :e::uuid", Map.of("e", press.toString()));

        var res = mvc.perform(get("/v1/programs/" + tplA)).andExpect(status().isOk()).andReturn().getResponse();
        String body = res.getContentAsString();
        assertEquals(List.of(week1.toString(), week2.toString()), JsonPath.<List<String>>read(body, "$.workouts[*].id"));
        assertEquals(List.of(first.toString(), second.toString()), JsonPath.<List<String>>read(body, "$.workouts[0].exercises[*].id"),
                "mains only, by position — the alternative is not one of them");
        assertEquals(List.of(1, 2), JsonPath.<List<Integer>>read(body, "$.workouts[0].exercises[0].sets[*].position"));
        assertEquals(List.of(50.0, 60.0), JsonPath.<List<Double>>read(body, "$.workouts[0].exercises[0].sets[*].loadValue"));
        assertEquals(List.of(alt.toString()), JsonPath.<List<String>>read(body, "$.workouts[0].exercises[0].alternatives[*].id"));
        assertEquals(swap.toString(), JsonPath.read(body, "$.workouts[0].exercises[0].alternatives[0].exerciseId"));
        assertEquals("bodyweight", JsonPath.read(body, "$.workouts[0].exercises[0].alternatives[0].sets[0].loadKind"));
        assertEquals(List.of(), JsonPath.<List<Object>>read(body, "$.workouts[0].exercises[0].alternatives[?(@.alternatives)]"),
                "an alternative carries no alternatives key at all");
        assertEquals(List.of(), JsonPath.<List<Object>>read(body, "$.workouts[0].exercises[1].alternatives[*]"));
        for (UUID e : List.of(squat, press, swap)) {
            assertEquals(jdbc.queryForObject("SELECT name FROM exercise WHERE id = :e::uuid", Map.of("e", e.toString()), String.class),
                    JsonPath.read(body, "$.exercises['" + e + "'].name"));
        }
        assertEquals(3, JsonPath.<Map<String, Object>>read(body, "$.exercises").size(), "each exercise named once");
        String version = JsonPath.read(body, "$.version");
        assertEquals("\"" + version + "\"", res.getHeader("ETag"));
    }

    @Test
    @DisplayName("one library program: an unknown id, a trainer's own program and a retired library program are all 404 on /certified/{id}")
    void libraryOneNotFound() throws Exception {
        mvc.perform(get("/v1/programs/certified/" + UUID.randomUUID())).andExpect(status().isNotFound());
        // a trainer's program never answers on the library's route — the mirror of library()'s last line
        mvc.perform(get("/v1/programs/certified/" + tplA)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/programs/certified/" + active)).andExpect(status().isNotFound());

        String list = mvc.perform(get("/v1/programs/certified")).andReturn().getResponse().getContentAsString();
        UUID lib = UUID.fromString(JsonPath.read(list, "$.items[0].id"));
        mvc.perform(get("/v1/programs/certified/" + lib)).andExpect(status().isOk());
        jdbc.update("UPDATE program SET deleted_at = now() WHERE id = :s::uuid", Map.of("s", lib.toString()));   // the seeder retiring it
        mvc.perform(get("/v1/programs/certified/" + lib)).andExpect(status().isNotFound());
        list = mvc.perform(get("/v1/programs/certified")).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(), JsonPath.<List<String>>read(list, "$.items[?(@.id=='" + lib + "')].id"), "and it leaves the shelf");
    }

    @Test
    @DisplayName("the library's mine: this trainer's newest live template copy — not a deleted one, not another trainer's, not a plan — and stale once the library moves on")
    void libraryMine() throws Exception {
        String list = mvc.perform(get("/v1/programs/certified")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        UUID lib = UUID.fromString(JsonPath.read(list, "$.items[0].id"));
        UUID untouched = UUID.fromString(JsonPath.read(list, "$.items[1].id"));
        assertEquals(java.util.Collections.singletonList(null), mineOf(list, lib), "no copy yet");

        libraryCopy(me, tenant, lib, 3, false);                       // older
        UUID newest = libraryCopy(me, tenant, lib, 2, false);         // the one mine names
        libraryCopy(me, tenant, lib, 1, true);                        // newer, but deleted
        libraryCopy(other, tenantOf(other), lib, 0, false);           // newer, but not mine
        UUID plan = plan(client("On The Library", "+919841090030"), "Plan from the library", "active");
        jdbc.update("UPDATE program SET copied_from_program_id = :s::uuid, synced_at = now() WHERE id = :p::uuid",
                Map.of("s", lib.toString(), "p", plan.toString()));    // a plan, not a template: never mine

        list = mvc.perform(get("/v1/programs/certified")).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(newest.toString()), JsonPath.<List<String>>read(list, "$.items[?(@.id=='" + lib + "')].mine.id"));
        assertEquals(List.of(createdAt(newest)), JsonPath.<List<Long>>read(list, "$.items[?(@.id=='" + lib + "')].mine.copiedAt"));
        assertEquals(List.of(false), JsonPath.<List<Boolean>>read(list, "$.items[?(@.id=='" + lib + "')].mine.stale"));
        assertEquals(java.util.Collections.singletonList(null), mineOf(list, untouched), "a copy of one program says nothing about another");
        mvc.perform(get("/v1/programs/certified/" + lib))
                .andExpect(jsonPath("$.mine.id").value(newest.toString())).andExpect(jsonPath("$.mine.stale").value(false));

        // the library is revised after the copy was made: shown as stale, and the copy itself is untouched
        jdbc.update("UPDATE program SET revised_at = now() + interval '1 minute' WHERE id = :s::uuid", Map.of("s", lib.toString()));
        list = mvc.perform(get("/v1/programs/certified")).andReturn().getResponse().getContentAsString();
        assertEquals(List.of(true), JsonPath.<List<Boolean>>read(list, "$.items[?(@.id=='" + lib + "')].mine.stale"));
        assertEquals(List.of(newest.toString()), JsonPath.<List<String>>read(list, "$.items[?(@.id=='" + lib + "')].mine.id"));
        mvc.perform(get("/v1/programs/certified/" + lib)).andExpect(jsonPath("$.mine.stale").value(true));
    }

    @Test
    @DisplayName("the library answers a repeat with 304, and a new copy changes the ETag — the 304 can never hide a new mine")
    void libraryNotModified() throws Exception {
        var first = mvc.perform(get("/v1/programs/certified")).andExpect(status().isOk()).andReturn().getResponse();
        String etag = first.getHeader("ETag");
        org.junit.jupiter.api.Assertions.assertNotNull(etag);
        String lib = JsonPath.read(first.getContentAsString(), "$.items[0].id");

        var repeat = mvc.perform(get("/v1/programs/certified").header("If-None-Match", etag))
                .andExpect(status().isNotModified()).andReturn().getResponse();
        assertEquals("", repeat.getContentAsString());

        libraryCopy(me, tenant, UUID.fromString(lib), 0, false);
        var after = mvc.perform(get("/v1/programs/certified").header("If-None-Match", etag))
                .andExpect(status().isOk()).andReturn().getResponse();
        org.junit.jupiter.api.Assertions.assertNotEquals(etag, after.getHeader("ETag"));
        assertEquals(List.of(false), JsonPath.<List<Boolean>>read(after.getContentAsString(), "$.items[?(@.id=='" + lib + "')].mine.stale"));
    }

    /* ─────────────────────────────────────────────────────────────── fixtures ── */

    private List<String> idsOf(String url) throws Exception {
        String body = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.<List<String>>read(body, "$.items[*].id").stream().sorted().toList();
    }

    private static List<String> ids(UUID... ids) {
        return java.util.Arrays.stream(ids).map(UUID::toString).sorted().toList();
    }

    private UUID workout(UUID program, int week, String name, boolean deleted) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name, deleted_at) "
                        + "VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, 1, 0, :n, " + (deleted ? "now()" : "NULL") + ")",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "p", program.toString(), "w", week, "n", name));
        return id;
    }

    /** {@code alternativeOf} null is a main exercise at {@code position}; otherwise an alternative to that main (positions 1–2). */
    private UUID exercise(UUID workout, UUID exerciseId, int position, UUID alternativeOf) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("ten", tenant.toString()); p.put("w", workout.toString()); p.put("e", exerciseId.toString());
        p.put("pos", position); p.put("alt", alternativeOf == null ? null : alternativeOf.toString());
        jdbc.update("INSERT INTO workout_exercise (id, tenant_id, workout_id, exercise_id, position, alternative_of) "
                + "VALUES (:id::uuid, :ten::uuid, :w::uuid, :e::uuid, :pos, CAST(:alt AS uuid))", p);
        return id;
    }

    private void set(UUID workoutExercise, int position, String loadKind, Integer load, String effortKind, Integer effort) {
        var p = new HashMap<String, Object>();
        p.put("we", workoutExercise.toString()); p.put("pos", position); p.put("lk", loadKind); p.put("lv", load);
        p.put("ek", effortKind); p.put("ev", effort); p.put("ten", tenant.toString());
        jdbc.update("INSERT INTO workout_set (tenant_id, workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value) "
                + "VALUES (:ten::uuid, :we::uuid, :pos, :lk, :lv, :ek, :ev)", p);
    }

    private static List<Object> mineOf(String list, UUID libraryId) {
        return JsonPath.read(list, "$.items[?(@.id=='" + libraryId + "')].mine");
    }

    /** A template copied from a library program {@code daysAgo} days ago, the way {@code POST /v1/programs {copyFrom}} writes it. */
    private UUID libraryCopy(UUID trainerId, UUID tenantId, UUID libraryId, int daysAgo, boolean deleted) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, name, weeks, copied_from_program_id, synced_at, created_at, deleted_at) "
                        + "VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, 'Library copy', 4, :s::uuid, now(), now() - make_interval(days => :d), "
                        + (deleted ? "now()" : "NULL") + ")",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenantId.toString(), "s", libraryId.toString(), "d", daysAgo));
        return id;
    }

    private long createdAt(UUID program) {
        return jdbc.queryForObject("SELECT created_at FROM program WHERE id = :p::uuid", Map.of("p", program.toString()), java.sql.Timestamp.class).getTime();
    }

    private UUID clientOf(UUID program) {
        return UUID.fromString(jdbc.queryForObject("SELECT client_id::text FROM program WHERE id = :p::uuid", Map.of("p", program.toString()), String.class));
    }

    private UUID template(UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :n, 4)",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenantId.toString(), "n", name));
        return id;
    }

    private UUID plan(UUID clientId, String name, String status) {
        return plan(clientId, me, tenant, name, status);
    }

    private UUID plan(UUID clientId, UUID trainerId, UUID tenantId, String name, String status) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("t", trainerId.toString()); p.put("ten", tenantId.toString());
        p.put("c", clientId.toString()); p.put("n", name); p.put("s", status);
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, :s, :n, 4)", p);
        return id;
    }

    private UUID client(String name, String phone) {
        return client(me, name, phone);
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
