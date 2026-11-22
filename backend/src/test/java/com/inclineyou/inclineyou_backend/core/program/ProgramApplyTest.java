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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import com.inclineyou.inclineyou_backend.core.session.SessionJdbcRepository;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionLogJdbcRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code POST /v1/programs/{templateId}/apply} (contract Clients A9 / Programs A5) and the plan's order behind it
 * ({@link PlanSequence}). A week with nothing of its own repeats week 1 (18 Nov 2026): an eight-week block written as
 * week 1 only used to link its first three sessions and leave every later one with no workout. Also pinned: the date
 * window, a replay naming its program, and a library program's use count.
 */
@SpringBootTest
@Transactional
class ProgramApplyTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired SessionJdbcRepository sessions;
    @Autowired SessionLogJdbcRepository logs;
    private MockMvc mvc;
    private UUID owner, tenant, client;

    private static final String MWF = "[{\"weekday\":1,\"start\":\"07:00\"},{\"weekday\":3,\"start\":\"07:00\"},{\"weekday\":5,\"start\":\"07:00\"}]";

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("+919100000991");
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", owner.toString()), String.class));
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", owner.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(owner.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        CurrentScope.set(new TenantScope.Scope(null, owner, tenant, List.of(), false));
        client = client("Ravi", "active");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("in sequence: an 8-week block written as week 1 only gives every booked session a workout, week 1's days in turn")
    void sequenceRepeatsWeekOne() throws Exception {
        UUID tpl = template(8, 1);
        saveWeek(week(MWF)).andExpect(status().isOk());
        apply(tpl).andExpect(status().isCreated());
        List<String> given = givenDays();
        assertTrue(given.size() >= 11, given.toString());
        for (int i = 0; i < given.size(); i++) assertEquals("1/" + (i % 3 + 1), given.get(i), given.toString());
    }

    @Test
    @DisplayName("by programDay: a pinned slot gets its day of week 1 in every repeat week")
    void pinnedDaysRepeatWeekOne() throws Exception {
        UUID tpl = template(8, 1);
        saveWeek(week("[{\"weekday\":1,\"start\":\"07:00\",\"programDay\":1},{\"weekday\":3,\"start\":\"07:00\",\"programDay\":2},"
                + "{\"weekday\":5,\"start\":\"07:00\",\"programDay\":3}]")).andExpect(status().isOk());
        apply(tpl).andExpect(status().isCreated());
        var rows = jdbc.queryForList("""
                SELECT extract(isodow FROM s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::int AS dow, w.day
                FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
                WHERE s.client_id = :c::uuid AND s.status <> 'cancelled'""", Map.of("c", client.toString()));
        assertTrue(rows.size() >= 11);
        for (var r : rows) {
            int dow = ((Number) r.get("dow")).intValue();
            assertEquals(dow == 1 ? 1 : dow == 3 ? 2 : 3, ((Number) r.get("day")).intValue(), rows.toString());
        }
    }

    @Test
    @DisplayName("a week written on its own is used in place of the repeat; the plan ends after its last week")
    void authoredWeekAndTheEnd() throws Exception {
        UUID tpl = template(2, 2);                 // week 1 and week 2 both written, 2 weeks long: six places
        saveWeek(week(MWF)).andExpect(status().isOk());
        apply(tpl).andExpect(status().isCreated());
        List<String> given = givenDays();
        assertEquals(List.of("1/1", "1/2", "1/3", "2/1", "2/2", "2/3"), given.subList(0, 6));
        assertTrue(given.subList(6, given.size()).stream().allMatch("none"::equals), "past the plan's end: none " + given);
    }

    @Test
    @DisplayName("booking's next workout and the walk-in list walk the repeat weeks too: after Day 3 comes Day 1 again")
    void nextWorkoutRepeats() throws Exception {
        UUID tpl = template(8, 1);
        apply(tpl).andExpect(status().isCreated());
        var plan = jdbc.queryForList("""
                SELECT w.id::text FROM workout w JOIN program p ON p.id = w.program_id
                WHERE p.client_id = :c::uuid AND p.status = 'active' ORDER BY w.day""", Map.of("c", client.toString()), String.class);
        Instant now = Instant.now();
        // Four sessions already given: Day 1, 2, 3, then Day 1 of week 2.
        for (int i = 0; i < 4; i++) {
            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, workout_id, logged_by)
                    VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :at, 60, CAST(:at AS timestamptz) + interval '1 hour', 'scheduled', :w::uuid, 'trainer')""",
                    Map.of("t", owner.toString(), "c", client.toString(), "at", Timestamp.from(now.minusSeconds(86400L * (10 - i))),
                            "w", plan.get(i % 3)));
        }
        assertEquals(UUID.fromString(plan.get(1)), sessions.nextWorkout(client, now).orElseThrow(), "week 2's Day 2");
        var ravi = logs.everybody(owner, Timestamp.from(now)).stream().filter(e -> e.clientId().equals(client.toString())).findFirst().orElseThrow();
        assertEquals("Day 2", ravi.nextWorkoutName());
    }

    @Test
    @DisplayName("dates: a start more than 3 months from today, or an end more than 52 weeks after it, is a 400; inside, 201")
    void dateBounds() throws Exception {
        UUID tpl = template(4, 1);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        applyWith(tpl, UUID.randomUUID(), ",\"startDate\":\"" + today.plusYears(36) + "\"").andExpect(status().isBadRequest());
        applyWith(tpl, UUID.randomUUID(), ",\"startDate\":\"" + today.minusMonths(4) + "\"").andExpect(status().isBadRequest());
        applyWith(tpl, UUID.randomUUID(), ",\"endDate\":\"" + today.plusWeeks(52) + "\"").andExpect(status().isBadRequest());
        applyWith(tpl, UUID.randomUUID(), ",\"startDate\":\"" + today.minusMonths(2) + "\",\"endDate\":\""
                + today.minusMonths(2).plusWeeks(52).minusDays(1) + "\"").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a replay: the same id and program is 200 with that plan; the same id with another program is 409 ID_CONFLICT")
    void replayNamesTheProgram() throws Exception {
        UUID strength = template(4, 1), fatLoss = template(4, 1), id = UUID.randomUUID();
        applyWith(strength, id, "").andExpect(status().isCreated());
        applyWith(strength, id, "").andExpect(status().isOk()).andExpect(jsonPath("$.copiedFromProgramId").value(strength.toString()));
        applyWith(fatLoss, id, "").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));
    }

    @Test
    @DisplayName("a library program given straight to a client counts one use; a replay counts none")
    void libraryUseCounted() throws Exception {
        UUID lib = UUID.fromString(jdbc.queryForObject(
                "SELECT program_id::text FROM certified_program ORDER BY program_id LIMIT 1", Map.of(), String.class));
        int before = uses(lib);
        UUID id = UUID.randomUUID();
        applyWith(lib, id, "").andExpect(status().isCreated());
        applyWith(lib, id, "").andExpect(status().isOk());
        assertEquals(before + 1, uses(lib));
    }

    private int uses(UUID lib) {
        return jdbc.queryForObject("SELECT used_count FROM certified_program WHERE program_id = :p::uuid",
                Map.of("p", lib.toString()), Integer.class);
    }

    private ResultActions applyWith(UUID tpl, UUID id, String extra) throws Exception {
        return mvc.perform(post("/v1/programs/" + tpl + "/apply").contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + id + "\",\"clientId\":\"" + client + "\"" + extra + "}"));
    }

    @Test
    @DisplayName("the Program card's planned count is the plan's places: 8 weeks of a week-1-only block is 24, not the 3 written")
    void plannedCountsRepeatWeeks() throws Exception {
        apply(template(8, 1)).andExpect(status().isCreated());
        mvc.perform(get("/v1/programs").param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].progress.sessionsPlanned").value(24))
                .andExpect(jsonPath("$.items[0].workoutCount").value(3));
        apply(template(3, 2)).andExpect(status().isCreated());   // weeks 1–2 written, week 3 repeats week 1: 9
        mvc.perform(get("/v1/programs").param("clientId", client.toString()).param("status", "active"))
                .andExpect(jsonPath("$.items[0].progress.sessionsPlanned").value(9));
    }

    @Test
    @DisplayName("the Program card's done count is this client's done sessions on the plan's workouts, another client's not counted")
    void doneCountsTheClientsSessions() throws Exception {
        apply(template(4, 1)).andExpect(status().isCreated());
        String workout = jdbc.queryForObject("""
                SELECT w.id::text FROM workout w JOIN program p ON p.id = w.program_id
                WHERE p.client_id = :c::uuid AND p.status = 'active' ORDER BY w.day LIMIT 1""", Map.of("c", client.toString()), String.class);
        UUID other = client("Other", "active");
        UUID[] who = {client, client, other};
        for (int n = 0; n < who.length; n++) {
            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, workout_id, logged_by)
                    VALUES (gen_random_uuid(), :t::uuid, :c::uuid, now() - make_interval(days => :d), 60,
                            now() - make_interval(days => :d) + interval '1 hour', 'done', :w::uuid, 'trainer')""",
                    Map.of("t", owner.toString(), "c", who[n].toString(), "w", workout, "d", n + 2));
        }
        mvc.perform(get("/v1/programs").param("clientId", client.toString()).param("status", "active"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].progress.sessionsDone").value(2));
    }

    // ── helpers ──

    /** A template of {@code weeks} weeks with {@code written} of them written: three workouts, "Day 1"…"Day 3", each. */
    private UUID template(int weeks, int written) {
        UUID tpl = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, name, weeks, days) VALUES (:id::uuid, 'trainer', :t::uuid, 'Block', :w, 3)",
                Map.of("id", tpl.toString(), "t", owner.toString(), "w", weeks));
        for (int wk = 1; wk <= written; wk++)
            for (int d = 1; d <= 3; d++)
                jdbc.update("""
                        INSERT INTO workout (origin, trainer_id, program_id, week, day, position, name)
                        VALUES ('trainer', :t::uuid, :p::uuid, :wk, :d, 0, :n)""",
                        Map.of("t", owner.toString(), "p", tpl.toString(), "wk", wk, "d", d, "n", "Day " + d));
        return tpl;
    }

    private ResultActions apply(UUID tpl) throws Exception {
        return mvc.perform(post("/v1/programs/" + tpl + "/apply").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + client + "\"}"));
    }

    /** "week/day" of each booked session's workout in date order, "none" for a session with no workout. */
    private List<String> givenDays() {
        return jdbc.queryForList("""
                SELECT coalesce(w.week || '/' || w.day, 'none') FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
                WHERE s.client_id = :c::uuid AND s.status <> 'cancelled' ORDER BY s.scheduled_at""",
                Map.of("c", client.toString()), String.class);
    }

    private static String week(String slots) {
        return "{\"slots\":" + slots + "}";
    }

    private ResultActions saveWeek(String body) throws Exception {
        return putFor(client, body);
    }

    private ResultActions putFor(UUID id, String body) throws Exception {
        return mvcFor(id, body);
    }

    /** The version the PUT must carry is client_schedule.updated_at as epoch ms — read the way the web reads it. */
    private ResultActions mvcFor(UUID id, String body) throws Exception {
        String version = jdbc.queryForList("SELECT floor(extract(epoch FROM updated_at) * 1000)::bigint::text FROM client_schedule WHERE client_id = :id::uuid",
                Map.of("id", id.toString()), String.class).stream().findFirst().orElse("0");
        return mvc.perform(put("/v1/clients/" + id + "/schedule").header("If-Match", version)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** Dates in [from, to] falling on one of the ISO weekdays (1 = Monday). */
    private static int expectedDates(LocalDate from, LocalDate to, int... weekdays) {
        int n = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            for (int w : weekdays) if (d.getDayOfWeek().getValue() == w) n++;
        }
        return n;
    }

    private UUID client(String name, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status, paused_at, archived_at, archive_reason) "
                        + "VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent', :s, CASE WHEN :s = 'paused' THEN now() END, "
                        + "CASE WHEN :s = 'archived' THEN now() END, CASE WHEN :s = 'archived' THEN 'other' END)",
                Map.of("id", id.toString(), "t", owner.toString(), "ten", tenant.toString(), "n", name, "s", status));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
