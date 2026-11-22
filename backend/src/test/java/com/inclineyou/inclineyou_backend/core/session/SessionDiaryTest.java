package com.inclineyou.inclineyou_backend.core.session;

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

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The diary read and the booking write (api-contract Today L4 and A1, Schedule A3) over HTTP: the window and its
 * validation, the keyset paging, the status filter and order, booking with its replay and its refusals, picking the
 * next workout of the active program, the batch close of open logs, and the PATCH's happy paths. The status verbs
 * ({@code /done}, {@code /cancel}…) are {@code SessionStateTest}'s.
 */
@SpringBootTest
@Transactional
class SessionDiaryTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, tenant, client, program, w1, w2;

    @BeforeEach
    void setUp() {
        me = trainer("+919100000801");
        // These controllers take the caller as an Authentication argument, so the request carries a principal.
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(new UsernamePasswordAuthenticationToken(
                        me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"))))
                .build();
        other = trainer("+919100000802");
        tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class));
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        client = client(me, "Ravi", "active");
        program = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks)
                VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', 'Plan', 4)""",
                Map.of("id", program.toString(), "t", me.toString(), "ten", tenant.toString(), "c", client.toString()));
        w1 = workout("Day A", 1, 1);
        w2 = workout("Day B", 1, 2);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    /* ───────────────────────────────────────────────────────────── the list ── */

    @Test
    @DisplayName("the window is required, ordered, at most 400 days and in dates; status, order and clientId are checked")
    void listValidation() throws Exception {
        for (String q : new String[]{"", "?from=2026-10-01", "?from=2026-10-05&to=2026-10-01", "?from=2025-01-01&to=2026-10-01",
                "?from=yesterday&to=2026-10-01", "?from=2026-10-01&to=2026-10-02&status=gone",
                "?from=2026-10-01&to=2026-10-02&order=sideways", "?from=2026-10-01&to=2026-10-02&clientId=nope"}) {
            mvc.perform(get("/v1/sessions" + q)).andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("rows carry the booking, its workout and the log's totals; the window is [from, to) in the workspace's days")
    void listShape() throws Exception {
        UUID s = session("2026-10-10T10:00:00+05:30", w1, "scheduled");
        jdbc.update("UPDATE scheduled_session SET started_at = scheduled_at WHERE id = :s::uuid", Map.of("s", s.toString()));
        session("2026-10-11T10:00:00+05:30", null, "scheduled");

        list("2026-10-10", "2026-10-11")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(s.toString()))
                .andExpect(jsonPath("$.items[0].clientId").value(client.toString()))
                .andExpect(jsonPath("$.items[0].status").value("scheduled"))
                .andExpect(jsonPath("$.items[0].workout.name").value("Day A"))
                .andExpect(jsonPath("$.items[0].workout.programId").value(program.toString()))
                .andExpect(jsonPath("$.items[0].startedAt").isNumber())
                .andExpect(jsonPath("$.items[0].log.setsDone").value(0))          // opened, nothing logged yet
                .andExpect(jsonPath("$.items[0].version").isString())
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        list("2026-10-11", "2026-10-12").andExpect(jsonPath("$.items[0].workout").doesNotExist())
                .andExpect(jsonPath("$.items[0].log").doesNotExist());
    }

    @Test
    @DisplayName("keyset paging walks a window once in either order; status and clientId narrow; another trainer's rows never show")
    void listPagingAndFilters() throws Exception {
        for (int d = 10; d <= 14; d++) session("2026-10-" + d + "T09:00:00+05:30", null, d == 12 ? "done" : "scheduled");
        UUID otherClient = client(other, "Theirs", "active");
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, '2026-10-10T04:00:00Z', 60, '2026-10-10T04:00:00Z')""",
                Map.of("t", other.toString(), "c", otherClient.toString()));

        var seen = new java.util.ArrayList<Long>();
        String cursor = null;
        for (int i = 0; i < 8; i++) {
            var req = get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("limit", "2");
            if (cursor != null) req = req.param("cursor", cursor);
            String json = mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            List<Number> at = com.jayway.jsonpath.JsonPath.read(json, "$.items[*].scheduledAt");
            at.forEach(n -> seen.add(n.longValue()));
            cursor = com.jayway.jsonpath.JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(5, seen.size());
        assertEquals(seen.stream().sorted().toList(), seen, "ascending by default");
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("order", "desc").param("limit", "1"))
                .andExpect(jsonPath("$.items[0].scheduledAt").value(seen.getLast()));
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("status", "done"))
                .andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("status", "done,no_show"))
                .andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("clientId", client.toString()))
                .andExpect(jsonPath("$.items.length()").value(5));
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("cursor", "bm9wZQ"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("?clientId= is 404 for a client not on your roster; a client's history keeps sessions an earlier coach logged")
    void clientHistoryScope() throws Exception {
        UUID theirs = client(other, "Theirs", "active");
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("clientId", theirs.toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("clientId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());

        // My client, one session I ran and one an earlier coach logged before the client came to me.
        UUID mine = session("2026-10-12T09:00:00+05:30", null, "done");
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, '2026-10-05T03:30:00Z', 60, '2026-10-05T04:30:00Z', 'done')""",
                Map.of("t", other.toString(), "c", client.toString()));

        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("clientId", client.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
        // The diary is still the trainer's own time: the earlier coach's session is not in it.
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(mine.toString()));
    }

    @Test
    @DisplayName("a cursor resumes only the query that made it: another order, window or filter is a 400")
    void cursorIsBoundToItsQuery() throws Exception {
        for (int d = 10; d <= 12; d++) session("2026-10-" + d + "T09:00:00+05:30", null, "scheduled");
        String json = mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("limit", "1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String cursor = com.jayway.jsonpath.JsonPath.read(json, "$.nextCursor");

        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("limit", "1").param("cursor", cursor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("order", "desc").param("cursor", cursor))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/sessions").param("from", "2026-10-02").param("to", "2026-10-31").param("cursor", cursor))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/sessions").param("from", "2026-10-01").param("to", "2026-10-31").param("status", "done").param("cursor", cursor))
                .andExpect(status().isBadRequest());
    }

    /* ─────────────────────────────────────────────────────────── the booking ── */

    @Test
    @DisplayName("book: 201 with the row, the next workout of the active program is picked in order, a retried id is 200")
    void book() throws Exception {
        UUID id = UUID.randomUUID();
        long at = future(1);
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + client + "\",\"scheduledAt\":" + at + ",\"notes\":\"  first  \"}";
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.status").value("scheduled"))
                .andExpect(jsonPath("$.notes").value("first"))
                .andExpect(jsonPath("$.workout.name").value("Day A"))
                .andExpect(jsonPath("$.durationMinutes").value(60))             // nothing said anywhere: 60
                .andExpect(jsonPath("$.endsAt").isNumber());
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());

        // The next booking, later in time, takes the next workout. Only week 1 is written, and a week with nothing of
        // its own repeats week 1 (18 Nov 2026), so the 4-week plan has eight places: A B · A B · A B · A B. After the
        // last one there is none, not a restart.
        book(future(2)).andExpect(jsonPath("$.workout.name").value("Day B"));
        for (int n = 3; n <= 8; n++) book(future(n)).andExpect(jsonPath("$.workout.name").value(n % 2 == 1 ? "Day A" : "Day B"));
        book(future(9)).andExpect(jsonPath("$.workout").doesNotExist());
    }

    @Test
    @DisplayName("book: a whole minute within a year back and two years ahead; one client cannot overlap themselves, two clients can")
    void bookTimeRules() throws Exception {
        long at = future(1);   // 08:00
        book(at + 30_000).andExpect(status().isBadRequest());                                        // 08:00:30
        book(Instant.now().plus(800, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES).toEpochMilli()).andExpect(status().isBadRequest());
        book(Instant.now().minus(400, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES).toEpochMilli()).andExpect(status().isBadRequest());

        book(at).andExpect(status().isCreated());                                                    // 08:00–09:00
        book(at).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_CLIENT_TIME_TAKEN"));
        book(at + 30 * 60_000).andExpect(status().isConflict())                                      // 08:30: inside it
                .andExpect(jsonPath("$.code").value("SESSION_CLIENT_OVERLAP"));
        book(at - 30 * 60_000).andExpect(status().isConflict())                                      // 07:30–08:30: runs into it
                .andExpect(jsonPath("$.code").value("SESSION_CLIENT_OVERLAP"));
        book(at + 60 * 60_000).andExpect(status().isCreated());                                      // 09:00: touches, does not overlap

        // Another client at the same hour is allowed: semi-private training, two on the floor at once.
        UUID second = client(me, "Second", "active");
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + second + "\",\"scheduledAt\":" + (at + 30 * 60_000) + "}"))
                .andExpect(status().isCreated());

        // A cancelled session no longer holds its time.
        long later = future(4);
        String sid = com.jayway.jsonpath.JsonPath.read(book(later).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.update("UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'trainer' WHERE id = :id::uuid", Map.of("id", sid));
        book(later + 15 * 60_000).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("book: a retried id answers 200 even after the client was paused in between (the replay is checked before bookable)")
    void replayAfterPause() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"id\":\"" + id + "\",\"clientId\":\"" + client + "\",\"scheduledAt\":" + future(1) + "}";
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        jdbc.update("UPDATE client SET status = 'paused', paused_at = now() WHERE id = :id::uuid", Map.of("id", client.toString()));
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        // A NEW booking for the paused client is still refused.
        book(future(2)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_BOOKABLE"));
    }

    @Test
    @DisplayName("book: an explicit workout must be this client's plan or the trainer's shelf; duration and mode are checked")
    void bookRefusals() throws Exception {
        UUID foreign = UUID.randomUUID();
        UUID theirProgram = UUID.randomUUID();
        UUID otherClient = client(other, "Theirs", "active");
        jdbc.update("INSERT INTO program (id, origin, trainer_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :c::uuid, 'active', 'X', 1)",
                Map.of("id", theirProgram.toString(), "t", other.toString(), "c", otherClient.toString()));
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, program_id, week, day, position, name) VALUES (:id::uuid, 'trainer', :t::uuid, :p::uuid, 1, 1, 0, 'Theirs')",
                Map.of("id", foreign.toString(), "t", other.toString(), "p", theirProgram.toString()));
        String base = "{\"clientId\":\"" + client + "\",\"scheduledAt\":" + future(5);
        for (String extra : new String[]{",\"workoutId\":\"" + foreign + "\"", ",\"durationMinutes\":0", ",\"durationMinutes\":481",
                ",\"deliveryMode\":\"teleport\"", ",\"notes\":\"" + "x".repeat(2001) + "\"", ",\"workoutId\":\"nope\""}) {
            mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(base + extra + "}")).andExpect(status().isBadRequest());
        }
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content("{\"scheduledAt\":1}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + client + "\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + otherClient + "\",\"scheduledAt\":" + future(5) + "}"))
                .andExpect(status().isNotFound());
        // An own workout is fine.
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content(base + ",\"workoutId\":\"" + w2 + "\",\"durationMinutes\":45,\"deliveryMode\":\"remote\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.workout.name").value("Day B"))
                .andExpect(jsonPath("$.durationMinutes").value(45)).andExpect(jsonPath("$.deliveryMode").value("remote"));
    }

    @Test
    @DisplayName("book: a paused client is a 409 CLIENT_NOT_BOOKABLE, a taken start is SESSION_CLIENT_TIME_TAKEN, the same id elsewhere is ID_CONFLICT")
    void bookConflicts() throws Exception {
        long at = future(4);
        book(at).andExpect(status().isCreated());

        UUID paused = client(me, "Meena", "paused");
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + paused + "\",\"scheduledAt\":" + at + "}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_NOT_BOOKABLE"));

        UUID id = UUID.randomUUID();
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + id + "\",\"clientId\":\"" + client + "\",\"scheduledAt\":" + future(6) + "}")).andExpect(status().isCreated());
        UUID second = client(me, "Second", "active");
        mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"" + id + "\",\"clientId\":\"" + second + "\",\"scheduledAt\":" + future(6) + "}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ID_CONFLICT"));

        // Last: a unique violation aborts Postgres's transaction, which is the request's own in production and the whole
        // test's here.
        book(at).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_CLIENT_TIME_TAKEN"));
    }

    /* ───────────────────────────────────────────────────────── batch end · patch ── */

    @Test
    @org.junit.jupiter.api.DisplayName("a forgotten log is closed at its last set, else its planned length — never at the moment Close or Mark done is pressed")
    void aForgottenLogEndsAtItsLastSet() throws Exception {
        UUID withSets = session("2026-09-20T09:00:00+05:30", null, "scheduled");
        UUID noSets = session("2026-09-21T09:00:00+05:30", null, "scheduled");
        UUID marked = session("2026-09-22T09:00:00+05:30", null, "scheduled");
        jdbc.update("UPDATE scheduled_session SET started_at = scheduled_at WHERE id IN (:a::uuid, :b::uuid, :c::uuid)",
                Map.of("a", withSets.toString(), "b", noSets.toString(), "c", marked.toString()));
        doneSet(withSets, "2026-09-20T09:47:00+05:30");
        doneSet(marked, "2026-09-22T09:31:00+05:30");

        mvc.perform(post("/v1/sessions/end").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sessionIds\":[\"" + withSets + "\",\"" + noSets + "\"]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/v1/sessions/{id}/done", marked)).andExpect(status().isOk());

        org.junit.jupiter.api.Assertions.assertEquals(java.time.OffsetDateTime.parse("2026-09-20T09:47:00+05:30").toInstant(), endedAt(withSets),
                "closed at the last set, not today");
        int minutes = jdbc.queryForObject("SELECT duration_minutes FROM scheduled_session WHERE id = :s::uuid",
                Map.of("s", noSets.toString()), Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(java.time.OffsetDateTime.parse("2026-09-21T09:00:00+05:30").toInstant()
                .plusSeconds(minutes * 60L), endedAt(noSets), "no set done: the planned length");
        org.junit.jupiter.api.Assertions.assertEquals(java.time.OffsetDateTime.parse("2026-09-22T09:31:00+05:30").toInstant(), endedAt(marked),
                "Mark done closes it the same way");
    }

    private java.time.Instant endedAt(UUID sessionId) {
        return jdbc.queryForObject("SELECT ended_at FROM scheduled_session WHERE id = :s::uuid",
                Map.of("s", sessionId.toString()), java.sql.Timestamp.class).toInstant();
    }

    /** One done set on the session, at {@code at}. */
    private void doneSet(UUID sessionId, String at) {
        String exercise = jdbc.queryForObject("SELECT id::text FROM exercise WHERE deleted_at IS NULL ORDER BY id LIMIT 1", Map.of(), String.class);
        UUID sx = UUID.randomUUID();
        String client = jdbc.queryForObject("SELECT client_id::text FROM scheduled_session WHERE id = :s::uuid",
                Map.of("s", sessionId.toString()), String.class);
        jdbc.update("INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position) VALUES (:x::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                Map.of("x", sx.toString(), "s", sessionId.toString(), "c", client, "e", exercise));
        jdbc.update("""
                INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at)
                VALUES (:x::uuid, 1, false, 'weight', 'reps', 40, 10, :at)""",
                Map.of("x", sx.toString(), "at", java.sql.Timestamp.from(java.time.OffsetDateTime.parse(at).toInstant())));
    }

    @Test
    @DisplayName("POST /end closes open logs once, says why for the rest, and never reveals somebody else's session")
    void batchEnd() throws Exception {
        UUID open = session("2026-09-20T09:00:00+05:30", null, "scheduled");
        UUID closed = session("2026-09-21T09:00:00+05:30", null, "scheduled");
        UUID never = session("2026-09-22T09:00:00+05:30", null, "scheduled");
        jdbc.update("UPDATE scheduled_session SET started_at = scheduled_at WHERE id IN (:a::uuid, :b::uuid)", Map.of("a", open.toString(), "b", closed.toString()));
        jdbc.update("UPDATE scheduled_session SET ended_at = scheduled_at + interval '1 hour' WHERE id = :b::uuid", Map.of("b", closed.toString()));
        UUID stranger = UUID.randomUUID();

        mvc.perform(post("/v1/sessions/end").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sessionIds\":[\"" + open + "\",\"" + closed + "\",\"" + never + "\",\"" + stranger + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].outcome").value("closed"))
                .andExpect(jsonPath("$.results[1].outcome").value("skipped")).andExpect(jsonPath("$.results[1].reason").value("ALREADY_CLOSED"))
                .andExpect(jsonPath("$.results[2].outcome").value("skipped")).andExpect(jsonPath("$.results[2].reason").value("NOT_STARTED"))
                .andExpect(jsonPath("$.results[3].outcome").value("not_found"));
        mvc.perform(post("/v1/sessions/end").contentType(MediaType.APPLICATION_JSON).content("{\"sessionIds\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/sessions/end").contentType(MediaType.APPLICATION_JSON).content("{\"sessionIds\":[\"" + open + "\",\"" + open + "\"]}")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PATCH moves, resizes, re-modes and re-notes; null clears the mode and the note; a move frees the slot; an unknown key is a 400")
    void patchHappyPaths() throws Exception {
        UUID s = session("2026-10-20T09:00:00+05:30", w1, "scheduled");
        long moved = Instant.parse("2026-10-21T04:30:00Z").toEpochMilli();
        String etag = mvc.perform(patch("/v1/sessions/" + s).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scheduledAt\":" + moved + ",\"durationMinutes\":50,\"deliveryMode\":\"home_visit\",\"notes\":\"  bring bands  \"}"))
                .andExpect(status().isOk()).andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.scheduledAt").value(moved)).andExpect(jsonPath("$.durationMinutes").value(50))
                .andExpect(jsonPath("$.deliveryMode").value("home_visit")).andExpect(jsonPath("$.notes").value("bring bands"))
                .andReturn().getResponse().getHeader("ETag");
        assertEquals(String.valueOf(moved + 50 * 60_000L), String.valueOf(jdbc.queryForObject(
                "SELECT (extract(epoch FROM ends_at) * 1000)::bigint FROM scheduled_session WHERE id = :s::uuid", Map.of("s", s.toString()), Long.class)));
        mvc.perform(patch("/v1/sessions/" + s).contentType(MediaType.APPLICATION_JSON).content("{\"deliveryMode\":null,\"notes\":null}"))
                .andExpect(jsonPath("$.deliveryMode").doesNotExist()).andExpect(jsonPath("$.notes").doesNotExist())
                .andExpect(jsonPath("$.durationMinutes").value(50));
        for (String bad : new String[]{"{}", "{\"title\":\"x\"}", "{\"status\":\"done\"}", "{\"durationMinutes\":0}", "{\"durationMinutes\":50.5}",
                "{\"deliveryMode\":\"teleport\"}", "{\"scheduledAt\":\"soon\"}", "{\"notes\":5}"}) {
            mvc.perform(patch("/v1/sessions/" + s).contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest());
        }
        mvc.perform(patch("/v1/sessions/" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"x\"}")).andExpect(status().isNotFound());
        // Moving onto another of this client's sessions is a 409.
        UUID t = session("2026-10-22T09:00:00+05:30", null, "scheduled");
        mvc.perform(patch("/v1/sessions/" + t).contentType(MediaType.APPLICATION_JSON).content("{\"scheduledAt\":" + moved + "}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SESSION_CLIENT_TIME_TAKEN"));
    }

    /* ------------------------------------------------------------- fixtures */

    private ResultActions list(String from, String to) throws Exception {
        return mvc.perform(get("/v1/sessions").param("from", from).param("to", to));
    }

    private ResultActions book(long at) throws Exception {
        return mvc.perform(post("/v1/sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + client + "\",\"scheduledAt\":" + at + "}"));
    }

    /** Epoch ms a few days ahead at a fixed local hour, so two calls with different n never share a start. */
    private static long future(int n) {
        return LocalDate.now(IST).plusDays(10 + n).atTime(8, 0).atZone(IST).toInstant().toEpochMilli();
    }

    private UUID session(String at, UUID workout, String status) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("t", me.toString());
        p.put("c", client.toString());
        p.put("at", java.sql.Timestamp.from(java.time.OffsetDateTime.parse(at).toInstant()));
        p.put("w", workout == null ? null : workout.toString());
        p.put("s", status);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :w::uuid, :at, 60, :at, :s)""", p);
        return id;
    }

    private UUID workout(String name, int week, int day) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name)
                VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :p::uuid, :w, :d, 0, :n)""",
                Map.of("id", id.toString(), "t", me.toString(), "ten", tenant.toString(), "p", program.toString(), "w", week, "d", day, "n", name));
        return id;
    }

    private UUID client(UUID trainerId, String name, String status) {
        UUID id = UUID.randomUUID();
        UUID ten = trainerId.equals(me) ? tenant : UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainerId.toString()), String.class));
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type, status, paused_at) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent', :s, CASE WHEN :s = 'paused' THEN now() END)",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", ten.toString(), "n", name, "s", status));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
