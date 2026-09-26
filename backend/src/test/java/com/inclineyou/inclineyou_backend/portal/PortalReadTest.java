package com.inclineyou.inclineyou_backend.portal;

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

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

/**
 * Module 11a · the portal's reads, as a client — one phone on two rosters.
 *
 * <p>Pinned: which roster a request is about; that each read names only the
 * resolved client's rows; that the money wire withholds the trainer's side of
 * the arrangement; that the plan is keyed by the client's day slots (not the
 * copy's weekdays) so it agrees with the sessions; that a private note never
 * reaches the client; and that an unsent assessment is not shown.
 */
@SpringBootTest
@Transactional
class PortalReadTest {

    private static final String PHONE = "9100001501";

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID asha;      // trainer 1, with a gym
    private UUID ravi;      // trainer 2
    private UUID meera;     // Meera on Asha's roster — the one accepted last, so the default
    private UUID meera2;    // Meera on Ravi's roster
    private UUID bench;
    private UUID row;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        asha = trainer("9100001511", "Asha");
        ravi = trainer("9100001512", "Ravi");
        jdbc.update("UPDATE trainer SET gym_name = 'Iron House' WHERE id = :id::uuid", Map.of("id", asha.toString()));
        meera = client(asha, "Meera", "now()");
        meera2 = client(ravi, "Meera R", "now() - interval '30 days'");
        bench = exercise("Bench press");
        row = exercise("Barbell row");
        signedIn(PHONE);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ── who is asking ───────────────────────────────────────────────────── */

    @Test
    @DisplayName("no clientId resolves the most recently accepted roster; a foreign one is 403 NOT_YOURS; a stranger is NOT_A_CLIENT")
    void rosterResolution() throws Exception {
        mvc.perform(get("/v1/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.client.id").value(meera.toString()))
                .andExpect(jsonPath("$.trainer.name").value("Asha"))
                .andExpect(jsonPath("$.trainer.gymName").value("Iron House"))
                .andExpect(jsonPath("$.rosters[*].trainerName", contains("Asha", "Ravi")))
                .andExpect(jsonPath("$.prefs.notify.programUpdated").value(true))
                .andExpect(jsonPath("$.prefs.nominee").doesNotExist())
                .andExpect(jsonPath("$.client.health").value(""));
        mvc.perform(get("/v1/me").param("clientId", meera2.toString()))
                .andExpect(jsonPath("$.trainer.name").value("Ravi"));
        mvc.perform(get("/v1/me").param("clientId", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_YOURS"));
        signedIn("9100001599");
        mvc.perform(get("/v1/me")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_CLIENT"));
    }

    /* ── the plan and the diary agree on day numbers ─────────────────────── */

    @Test
    @DisplayName("the plan is keyed by the client's slots (Mon = Day 1, Thu = Day 2), matching the sessions' templateDay")
    void planKeyedBySlots() throws Exception {
        UUID program = program(meera, "active", "[{\"day\":1,\"weekday\":1,\"time\":\"07:00\"},{\"day\":2,\"weekday\":4,\"time\":\"07:00\"}]",
                "{\"1\":\"Push\",\"4\":\"Pull\"}", "1,4");
        planRow(program, bench, 1, "Chest up");
        planRow(program, row, 4, null);
        session(meera, program, "now() + interval '1 day'", 2, "Pull");

        mvc.perform(get("/v1/me/program"))
                .andExpect(jsonPath("$.id").value(program.toString()))
                .andExpect(jsonPath("$.trainingDays", contains(1, 2)))
                .andExpect(jsonPath("$.dayLabels.2").value("Pull"))
                .andExpect(jsonPath("$.days[0].label").value("Push"))
                .andExpect(jsonPath("$.days[0].exercises[0].exercise.name").value("Bench press"))
                .andExpect(jsonPath("$.days[0].exercises[0].exercise.cue").value("Chest up"))
                .andExpect(jsonPath("$.days[0].exercises[0].exercise.formCues.length()").value(0))
                .andExpect(jsonPath("$.days[1].templateDay").value(2))
                .andExpect(jsonPath("$.week").value(1));
        mvc.perform(get("/v1/me/sessions"))
                .andExpect(jsonPath("$[0].templateDay").value(2))
                .andExpect(jsonPath("$[0].location").value("Iron House"))
                .andExpect(jsonPath("$[0].packDelta").doesNotExist());

        // Another roster's plan is not this one's.
        mvc.perform(get("/v1/me/program").param("clientId", meera2.toString()))
                .andExpect(content().string("null"));
        mvc.perform(get("/v1/me/programs/" + program).param("clientId", meera2.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("past plans: non-active only; workoutCount null when there is no record, else the workouts logged on it")
    void pastPlans() throws Exception {
        UUID old = program(meera, "completed", null, null, "1");
        jdbc.update("UPDATE program SET end_date = CURRENT_DATE - 400 WHERE id = :id::uuid", Map.of("id", old.toString()));
        mvc.perform(get("/v1/me/programs"))
                .andExpect(jsonPath("$[0].id").value(old.toString()))
                .andExpect(jsonPath("$[0].workoutCount").doesNotExist());
        UUID recent = program(meera, "completed", null, null, "1");
        workout(meera, recent, "CURRENT_DATE - 2");
        mvc.perform(get("/v1/me/programs"))
                .andExpect(jsonPath("$[?(@.id == '" + recent + "')].workoutCount", contains(1)))
                // Ended before the oldest workout on record: still unknowable.
                .andExpect(jsonPath("$[?(@.id == '" + old + "')].workoutCount", contains((Object) null)));
    }

    /* ── workouts and sets ───────────────────────────────────────────────── */

    @Test
    @DisplayName("a workout: its cards in order, its sets, the plan's cue, and last time")
    void workoutDetail() throws Exception {
        UUID program = program(meera, "active", null, null, "1");
        planRow(program, bench, 1, "Chest up");
        UUID earlier = workout(meera, program, "CURRENT_DATE - 7");
        set(earlier, bench, 1, "60", 8);
        set(earlier, bench, 2, "62.5", 6);
        jdbc.update("UPDATE workout_session SET created_at = now() - interval '7 days' WHERE id = :id::uuid",
                Map.of("id", earlier.toString()));
        UUID today = workout(meera, program, "CURRENT_DATE");
        card(today, bench);
        set(today, bench, 1, "62.5", 8);

        mvc.perform(get("/v1/me/workouts/" + today))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.programName").value("Plan"))
                .andExpect(jsonPath("$.exercises[0].exercise.name").value("Bench press"))
                .andExpect(jsonPath("$.exercises[0].exercise.cue").value("Chest up"))
                .andExpect(jsonPath("$.exercises[0].sets[0].loadKg").value(62.5))
                .andExpect(jsonPath("$.exercises[0].lastTime.sets.length()").value(2))
                .andExpect(jsonPath("$.exercises[0].lastTime.bestLoadKg").value(62.5));
        mvc.perform(get("/v1/me/workouts"))
                .andExpect(jsonPath("$[0].id").value(today.toString()))
                .andExpect(jsonPath("$[1].volumeKg").value(855))
                .andExpect(jsonPath("$[1].exerciseCount").value(1));
        mvc.perform(get("/v1/me/sets")).andExpect(jsonPath("$.length()").value(3));
        // Only logged movements resolve: the library cannot be walked.
        mvc.perform(get("/v1/me/exercises").param("ids", bench + "," + row + ",junk"))
                .andExpect(jsonPath("$[*].name", contains("Bench press")));
        mvc.perform(get("/v1/me/workouts/" + today).param("clientId", meera2.toString()))
                .andExpect(status().isNotFound());
    }

    /* ── money, withheld where it is the trainer's ───────────────────────── */

    @Test
    @DisplayName("packages carry the pack's name and the debt; payments carry nothing of the gym arrangement")
    void money() throws Exception {
        UUID pack = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, type, sessions, amount)
                VALUES (:id::uuid, :t::uuid, '12-session block', 'session_pack', 12, 6000)
                """, Map.of("id", pack.toString(), "t", asha.toString()));
        UUID pkg = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, type, sessions_total, sessions_remaining,
                    amount, status, paused_at)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :pk::uuid, 'session_pack', 12, 9, 6000, 'active', now())
                """, Map.of("id", pkg.toString(), "t", asha.toString(), "c", meera.toString(), "pk", pack.toString()));
        jdbc.update("""
                INSERT INTO payment (trainer_id, client_id, package_id, amount, method, status, collected_by,
                    gym_share_amount, paid_at)
                VALUES (:t::uuid, :c::uuid, :pk::uuid, 2000, 'cash', 'paid', 'gym', 600, now())
                """, Map.of("t", asha.toString(), "c", meera.toString(), "pk", pkg.toString()));

        mvc.perform(get("/v1/me/packages"))
                .andExpect(jsonPath("$[0].name").value("12-session block"))
                .andExpect(jsonPath("$[0].amountPaid").value(2000))
                .andExpect(jsonPath("$[0].amountDue").value(4000))
                .andExpect(jsonPath("$[0].pausedAt").isNumber());
        mvc.perform(get("/v1/me/payments"))
                .andExpect(jsonPath("$[0].amount").value(2000))
                .andExpect(jsonPath("$[0].collectedBy").doesNotExist())
                .andExpect(jsonPath("$[0].gymShareAmount").doesNotExist())
                .andExpect(jsonPath("$[0].note").doesNotExist());
    }

    /* ── from the trainer ────────────────────────────────────────────────── */

    @Test
    @DisplayName("messages are client_message rows plus SHARED notes — a private note never appears")
    void messages() throws Exception {
        jdbc.update("""
                INSERT INTO client_message (client_id, trainer_id, body, kind, at)
                VALUES (:c::uuid, :t::uuid, 'Great week', 'note', now() - interval '1 hour')
                """, Map.of("c", meera.toString(), "t", asha.toString()));
        note(meera, asha, "Keep the elbows tucked", true);
        note(meera, asha, "left knee - no deep squats", false);
        jdbc.update("INSERT INTO milestone (client_id, kind, label, value) VALUES (:c::uuid, 'sessions', '25th session with Asha', 25)",
                Map.of("c", meera.toString()));

        mvc.perform(get("/v1/me/messages"))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].body").value("Keep the elbows tucked"))
                .andExpect(jsonPath("$[0].readAt").doesNotExist())
                .andExpect(jsonPath("$[1].trainerName").value("Asha"))
                .andExpect(jsonPath("$[*].body", not(hasItem("left knee - no deep squats"))));
        mvc.perform(get("/v1/me/milestones"))
                .andExpect(jsonPath("$[0].label").value("25th session with Asha"))
                .andExpect(jsonPath("$[0].value").value(25));
    }

    /* ── assessments ─────────────────────────────────────────────────────── */

    @Test
    @DisplayName("only sent assessments show; late is still answerable; what is asked comes from the live template")
    void assessments() throws Exception {
        UUID tpl = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, name, description, measurements, questions)
                VALUES (:id::uuid, :t::uuid, 'Monthly', 'Every 4 weeks',
                        '{"on":true,"keys":["waist","weight"]}',
                        '{"on":true,"items":[{"id":"q_sleep","text":"Sleep?","kind":"text","scale":null,"options":[],"allowMultiple":false,"allowCustom":false}]}')
                """, Map.of("id", tpl.toString(), "t", asha.toString()));
        UUID sent = assessment(meera, tpl, "now() - interval '1 day'", "now() - interval '2 days'");
        assessment(meera, tpl, "now() + interval '9 days'", null);          // booked — the trainer's planning

        mvc.perform(get("/v1/me/assessments"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(sent.toString()))
                .andExpect(jsonPath("$[0].status").value("late"))
                .andExpect(jsonPath("$[0].dueAt").isString());
        mvc.perform(get("/v1/me/assessments/" + sent))
                .andExpect(jsonPath("$.description").value("Every 4 weeks"))
                .andExpect(jsonPath("$.asked.measurements[*].key", contains("waist", "weight")))
                .andExpect(jsonPath("$.asked.questions[0].id").value("q_sleep"));

        // Once the template is gone an OPEN one asks nothing and is dropped.
        jdbc.update("UPDATE assessment_template SET deleted_at = now() WHERE id = :id::uuid", Map.of("id", tpl.toString()));
        mvc.perform(get("/v1/me/assessments")).andExpect(jsonPath("$.length()").value(0));
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private UUID trainer(String phone, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)", Map.of("id", id.toString(), "p", phone, "n", name));
        return id;
    }

    private UUID client(UUID trainerId, String name, String acceptedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status, accepted_at, delivery_mode)
                VALUES (:id::uuid, :t::uuid, :n, :p, 'accepted', %s, 'floor')
                """.formatted(acceptedAt), Map.of("id", id.toString(), "t", trainerId.toString(), "n", name, "p", PHONE));
        return id;
    }

    private UUID exercise(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, is_custom) VALUES (:id::uuid, :n, false)", Map.of("id", id.toString(), "n", name));
        return id;
    }

    private UUID program(UUID clientId, String status, String schedule, String labels, String days) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("t", asha.toString());
        p.put("c", clientId.toString());
        p.put("s", status);
        p.put("sch", schedule);
        p.put("l", labels);
        p.put("d", days);
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status, schedule, day_labels, training_days, start_date)
                VALUES (:id::uuid, :t::uuid, :c::uuid, 'Plan', :s, CAST(:sch AS jsonb), CAST(:l AS jsonb), :d, CURRENT_DATE)
                """, p);
        return id;
    }

    private void planRow(UUID programId, UUID exerciseId, int weekday, String notes) {
        var p = new java.util.HashMap<String, Object>();
        p.put("p", programId.toString());
        p.put("e", exerciseId.toString());
        p.put("d", weekday);
        p.put("n", notes);
        jdbc.update("""
                INSERT INTO program_exercise (program_id, exercise_id, day_of_week, sets, reps, notes, order_index, week)
                VALUES (:p::uuid, :e::uuid, :d, 3, 8, :n, 0, 1)
                """, p);
    }

    private void session(UUID clientId, UUID programId, String at, int templateDay, String label) {
        jdbc.update("""
                INSERT INTO scheduled_session (trainer_id, client_id, program_id, scheduled_at, status, template_day, day_label, pack_delta)
                VALUES (:t::uuid, :c::uuid, :p::uuid, %s, 'scheduled', :d, :l, -1)
                """.formatted(at), Map.of("t", asha.toString(), "c", clientId.toString(), "p", programId.toString(),
                "d", templateDay, "l", label));
    }

    private UUID workout(UUID clientId, UUID programId, String date) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, program_id, session_date)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :p::uuid, %s)
                """.formatted(date), Map.of("id", id.toString(), "t", asha.toString(), "c", clientId.toString(),
                "p", programId.toString()));
        return id;
    }

    private void card(UUID workoutId, UUID exerciseId) {
        jdbc.update("INSERT INTO workout_exercise (workout_session_id, exercise_id, target_sets, target_reps) VALUES (:w::uuid, :e::uuid, 3, 8)",
                Map.of("w", workoutId.toString(), "e", exerciseId.toString()));
    }

    private void set(UUID workoutId, UUID exerciseId, int n, String load, int reps) {
        jdbc.update("""
                INSERT INTO set_log (workout_session_id, exercise_id, set_number, load_kg, reps)
                VALUES (:w::uuid, :e::uuid, :n, CAST(:l AS numeric), :r)
                """, Map.of("w", workoutId.toString(), "e", exerciseId.toString(), "n", n, "l", load, "r", reps));
    }

    private void note(UUID clientId, UUID trainerId, String body, boolean shared) {
        jdbc.update("""
                INSERT INTO client_note (client_id, trainer_id, body, shared_with_client) VALUES (:c::uuid, :t::uuid, :b, :s)
                """, Map.of("c", clientId.toString(), "t", trainerId.toString(), "b", body, "s", shared));
    }

    private UUID assessment(UUID clientId, UUID tpl, String dueAt, String sentAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, template_id, name, due_at, sent_at, measurements_asked, questions_asked)
                VALUES (:id::uuid, :c::uuid, :t::uuid, :tpl::uuid, 'Monthly', %s, %s, 2, 1)
                """.formatted(dueAt, sentAt == null ? "NULL" : sentAt),
                Map.of("id", id.toString(), "c", clientId.toString(), "t", asha.toString(), "tpl", tpl.toString()));
        return id;
    }

    private void signedIn(String phone) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(phone, null, AuthorityUtils.createAuthorityList("ROLE_CLIENT")));
    }
}
