package com.inclineyou.inclineyou_backend.session;

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

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SELLING A PACK BOOKS THE SESSIONS — V3.
 *
 * <p>The defect this closes: a trainer sold twelve sessions, agreed Mon/Wed/Fri
 * at 7am with the client in front of them, opened the schedule, and found it
 * empty. The pack said <i>12 of 12 left</i>; the diary said nothing was
 * happening. {@code POST /v1/clients/{id}/packages} wrote a package row and a
 * pending payment and stopped, because the rhythm lives on the client and the
 * count lives on the pack and nothing joined the two.
 *
 * <p>What is actually being tested below is not "twelve rows appear". It is that
 * the diary is <b>reconciled</b> against the arrangement rather than appended to,
 * which is a different and much easier thing to get wrong — the two counting
 * mistakes in {@code appendingIsNotReconciling} and {@code renewingEarly} both
 * shipped in a first draft and both hand a client sessions nobody sold them, or
 * take away sessions they paid for.
 */
@SpringBootTest
@Transactional
class SaleBooksSessionsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private MockMvc mvc;
    private UUID owner;
    private UUID client;

    @BeforeEach
    void setUp() {
        owner = trainer("9100000077");
        client = client(owner, "Ravi");
        SecurityContextHolder.getContext().setAuthentication(token(owner));
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(token(owner)))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ───────────────────────────────────────────────────────── the sale ── */

    @Test
    @DisplayName("a sale with the days on it books every session in the pack")
    void aSaleBooksTheWholePack() throws Exception {
        sell(12, "[{\"templateDay\":1,\"weekday\":1,\"time\":\"07:00\"}," +
                   "{\"templateDay\":2,\"weekday\":3,\"time\":\"07:00\"}," +
                   "{\"templateDay\":3,\"weekday\":5,\"time\":\"07:00\"}]")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sessionsBooked").value(12));

        assertEquals(12, diary().size());
        // Mon, Wed, Fri and nothing else — the rhythm, not four weeks of guesses.
        assertTrue(diary().stream().allMatch(at -> switch (at.getDayOfWeek()) {
            case MONDAY, WEDNESDAY, FRIDAY -> true;
            default -> false;
        }));
    }

    /**
     * The standing week belongs to the CLIENT, not to the pack that carried it —
     * which is what lets the next pack book without anyone re-typing Tuesday.
     */
    @Test
    @DisplayName("the days sold with the pack become the client's standing week")
    void theSaleWritesTheClientsWeek() throws Exception {
        sell(4, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":5,\"time\":\"18:00\"}]");

        assertEquals(2, jdbc.queryForObject(
                "SELECT sessions_per_week FROM client WHERE id = :id::uuid",
                Map.of("id", client.toString()), Integer.class));
    }

    /**
     * The Skip button on the add-a-client flow reads <i>sell it on the day they
     * pay</i>, and step 3 is where the days are agreed. So a pack sold before the
     * rhythm exists must book nothing now and everything later — without this,
     * the first client a trainer ever adds is the one whose pack books nothing at
     * all.
     */
    @Test
    @DisplayName("days agreed after the sale still book the pack")
    void theRhythmCanArriveAfterTheSale() throws Exception {
        sell(8, null).andExpect(jsonPath("$.sessionsBooked").value(0));
        assertEquals(0, diary().size());

        setWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"18:00\"}]");

        assertEquals(8, diary().size());
    }

    /* ───────────────────────── what the write says it did · the PUT's answer ── */

    /**
     * THE WRITE HAS TO SAY WHAT IT DID, OR THE SCREEN CANNOT.
     *
     * <p>Agreeing the week is the press that puts a client's next mornings on the
     * board, and {@code ClientResponse} had no way of admitting it — so the
     * add-a-client flow wrote the days, the server wrote the diary, and the
     * trainer moved on with nothing on screen to suggest anything had been
     * booked. The pair here is the same one {@code PackageResponse} carries for
     * the sale, and it is {@link DiaryService.Result}'s own count of what THIS
     * request wrote: counting the diary afterwards answers a different question,
     * as {@link #addingADayDoesNotAddSessions} shows — a fourth day spreads the
     * same eight and a count of the board would report eight again where nothing
     * new was booked.
     */
    @Test
    @DisplayName("agreeing the week answers with what it booked, and when it starts")
    void theWeekSaysWhatItBooked() throws Exception {
        sell(6, null).andExpect(jsonPath("$.sessionsBooked").value(0));

        putWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:30\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:30\"}]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionsBooked").value(6))
                .andExpect(jsonPath("$.firstSessionAt").isNumber());

        assertEquals(6, diary().size());
        assertEquals(diary().get(0).toInstant().toEpochMilli(), firstSessionAt());
    }

    /**
     * A pack that is not sold yet books nothing, and ZERO is the answer rather
     * than silence — the flow says "the sessions land the moment a pack is sold"
     * off this, where a null would leave it claiming a diary that is not there.
     */
    @Test
    @DisplayName("a week with no pack behind it still books, and the figure is what landed")
    void aWeekWithNoPackIsOpenEnded() throws Exception {
        String body = putWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:30\"}]")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        /* NOT a fixed four. An uncounted rhythm is laid down
           {@code OPEN_ENDED_WEEKS} weeks from the Monday of this week, and the
           slots already behind `now` are skipped — so a Tuesday slot is worth
           four on a Monday and three on a Wednesday. Asserting the constant
           made this test pass on two days in seven. What the figure has to be
           is what LANDED, which is the whole claim the field makes. */
        assertTrue(diary().size() >= SessionPlanner.OPEN_ENDED_WEEKS - 1);
        assertEquals(diary().size(),
                Integer.parseInt(body.replaceAll("^.*\"sessionsBooked\"\\s*:\\s*(\\d+).*$", "$1")));
    }

    /**
     * AND A WRITE THAT DID NOT TOUCH THE RHYTHM CLAIMS NOTHING.
     *
     * <p>Null, not zero. Renaming somebody books nothing and did not try to, and
     * a zero there would put "nothing is on the board yet" in front of a trainer
     * whose client has twelve sessions booked.
     */
    @Test
    @DisplayName("a write that is not about the week reports no booking at all")
    void aNameChangeClaimsNothing() throws Exception {
        sell(6, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:30\"}]");
        assertEquals(6, diary().size());

        mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Vijay R\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionsBooked").doesNotExist())
                .andExpect(jsonPath("$.firstSessionAt").doesNotExist());

        assertEquals(6, diary().size());
    }

    /** Epoch millis of the first session on the board. */
    private long firstSessionAt() {
        return diary().get(0).toInstant().toEpochMilli();
    }

    /* ─────────────────────────────────────────── reconcile, not append ── */

    /**
     * THE ONE THAT SHIPPED WRONG TWICE.
     *
     * <p>Subtracting what is already booked from the pack's remaining count AND
     * THEN skipping occupied instants counts every kept session twice, so a
     * client whose Thursday moved to Friday comes out of the edit two sessions
     * short of the pack they paid for. The whole remaining count is laid across
     * the rhythm and occupied instants are skipped. Not both.
     */
    @Test
    @DisplayName("moving a training day keeps the count whole")
    void appendingIsNotReconciling() throws Exception {
        sell(8, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"18:00\"}]");
        assertEquals(8, diary().size());

        // Thursday becomes Friday.
        setWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":5,\"time\":\"18:00\"}]");

        assertEquals(8, diary().size());
        assertTrue(diary().stream().noneMatch(at -> at.getDayOfWeek() == DayOfWeek.THURSDAY));
    }

    @Test
    @DisplayName("adding a fourth day spreads the same count, it does not add to it")
    void addingADayDoesNotAddSessions() throws Exception {
        sell(8, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":5,\"time\":\"18:00\"}]");

        setWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"18:00\"}," +
                 "{\"templateDay\":2,\"weekday\":5,\"time\":\"18:00\"}," +
                 "{\"templateDay\":3,\"weekday\":6,\"time\":\"08:00\"}]");

        assertEquals(8, diary().size());
    }

    /**
     * Renewing EARLY is the common case — the trainer sells the next pack while
     * three sessions of the current one are still on the board. Three plus twelve
     * is twelve, not fifteen.
     */
    @Test
    @DisplayName("renewing early tops the diary up rather than piling on")
    void renewingEarly() throws Exception {
        String week = "[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:00\"}," +
                       "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:00\"}]";
        String packId = sellAndRead(4, week);
        assertEquals(4, diary().size());

        mvc.perform(post("/v1/packages/" + packId + "/renew")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());

        // The renewal's own four, on the same rhythm — never eight.
        assertEquals(4, diary().size());
    }

    /* ─────────────────────────────────────────────── what it must not eat ── */

    /**
     * The extra Saturday before somebody's wedding. The rhythm did not put it
     * there, so the rhythm may not take it away — and without
     * {@code from_schedule} the only available rule is "delete every future
     * scheduled session and re-lay them", which eats exactly this.
     */
    @Test
    @DisplayName("a hand-booked session survives a change to the rhythm")
    void handBookedSessionsSurvive() throws Exception {
        sell(4, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:00\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:00\"}]");

        long saturday = LocalDate.now(IST).with(DayOfWeek.SATURDAY).plusWeeks(1)
                .atTime(10, 0).atZone(IST).toInstant().toEpochMilli();
        mvc.perform(post("/v1/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + client + "\",\"scheduledAt\":" + saturday + "}"))
                .andExpect(status().isCreated());

        setWeek("[{\"templateDay\":1,\"weekday\":3,\"time\":\"07:00\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:00\"}]");

        assertTrue(diary().stream().anyMatch(at -> at.getDayOfWeek() == DayOfWeek.SATURDAY),
                "the hand-booked Saturday was swept away by a rhythm it was never part of");
    }

    /**
     * A trainer who drags Thursday's 6am to 7pm has taken ownership of that row.
     * It must not be swept back the next time anything else about the client
     * changes.
     */
    @Test
    @DisplayName("a session the trainer moved is no longer the rhythm's to move")
    void aMovedSessionIsLeftAlone() throws Exception {
        sell(4, "[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:00\"}," +
                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:00\"}]");

        var first = jdbc.queryForMap("""
                SELECT id::text, scheduled_at FROM scheduled_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ORDER BY scheduled_at ASC LIMIT 1
                """, Map.of("cid", client.toString()));
        long moved = ((java.sql.Timestamp) first.get("scheduled_at")).toInstant()
                .plusSeconds(5 * 3600).toEpochMilli();

        mvc.perform(put("/v1/sessions/" + first.get("id"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scheduledAt\":" + moved + "}"))
                .andExpect(status().isOk());

        setWeek("[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:00\"}," +
                 "{\"templateDay\":2,\"weekday\":5,\"time\":\"07:00\"}]");

        assertTrue(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM scheduled_session
                WHERE id = :id::uuid AND deleted_at IS NULL)
                """, Map.of("id", first.get("id")), Boolean.class),
                "a session the trainer had deliberately moved was removed by the reconcile");
    }

    /**
     * A twelve-session pack on two days a week needs six weeks and a thirty-day
     * validity gives it four. The honest output is a SHORT list: the trainer is
     * told while the terms are still editable, rather than finding out in week
     * seven. Squeezing the remainder in somewhere would invent an arrangement
     * nobody agreed to.
     */
    @Test
    @DisplayName("a validity window shorter than the count books what fits")
    void theExpiryWins() throws Exception {
        String end = LocalDate.now(IST).plusDays(21).toString();
        mvc.perform(post("/v1/clients/" + client + "/packages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"session_pack\",\"sessionsTotal\":12,\"amount\":9000," +
                                 "\"endDate\":\"" + end + "\"," +
                                 "\"weeklySchedule\":[{\"templateDay\":1,\"weekday\":2,\"time\":\"07:00\"}," +
                                 "{\"templateDay\":2,\"weekday\":4,\"time\":\"07:00\"}]}"))
                .andExpect(status().isCreated());

        int booked = diary().size();
        assertTrue(booked > 0 && booked < 12,
                "three weeks of a two-day week is six sessions, not twelve — got " + booked);
        assertTrue(diary().getLast().toLocalDate().isBefore(LocalDate.parse(end).plusDays(1)),
                "a session was booked past the date the pack expires");
    }

    /* ────────────────────────────────────────────── the plan names them ── */

    /**
     * PUSH / PULL / <b>PULL</b> — the naming bug, found by running it.
     *
     * <p>A copy's {@code day_labels} are keyed by WEEKDAY (V2) and a session laid
     * down from the client's standing week carries that slot's ORDINAL. On
     * Mon/Wed/Fri the client's ordinals are 1, 2, 3 and the plan's keys are 1, 3,
     * 5 — so a "look it up directly, fall back to position" rule hits weekday 1
     * for ordinal 1 and is right by luck, misses on 2 and falls back correctly,
     * and then <b>hits weekday 3 for ordinal 3 and puts Wednesday's name on
     * Friday</b>. Position is the whole rule; this test is why.
     */
    @Test
    @DisplayName("a plan applied over a booked pack names each morning as its own day")
    void thePlanNamesTheRightMornings() throws Exception {
        String week = "[{\"templateDay\":1,\"weekday\":1,\"time\":\"07:00\"}," +
                       "{\"templateDay\":2,\"weekday\":3,\"time\":\"07:00\"}," +
                       "{\"templateDay\":3,\"weekday\":5,\"time\":\"07:00\"}]";
        sell(6, week);

        String tpl = jsonId(mvc.perform(post("/v1/templates")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Push Pull Legs\",\"trainingDays\":[1,2,3]," +
                         "\"dayLabels\":{\"1\":\"Push\",\"2\":\"Pull\",\"3\":\"Legs\"}}")));

        mvc.perform(post("/v1/templates/" + tpl + "/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + client + "\",\"schedule\":[" +
                                 "{\"day\":1,\"weekday\":1,\"time\":\"07:00\"}," +
                                 "{\"day\":2,\"weekday\":3,\"time\":\"07:00\"}," +
                                 "{\"day\":3,\"weekday\":5,\"time\":\"07:00\"}]}"))
                .andExpect(status().isCreated());

        var labels = jdbc.queryForList("""
                SELECT scheduled_at, day_label FROM scheduled_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ORDER BY scheduled_at ASC LIMIT 3
                """, Map.of("cid", client.toString()));

        // Keyed by weekday, not by position: which morning comes first depends
        // on the day the suite runs, and a Wednesday-evening run books Friday
        // first. What must hold is that each weekday carries its own day.
        var byWeekday = new java.util.TreeMap<Integer, String>();
        labels.forEach(r -> byWeekday.put(
                ((java.sql.Timestamp) r.get("scheduled_at")).toInstant().atZone(IST).getDayOfWeek().getValue(),
                (String) r.get("day_label")));
        assertEquals(Map.of(1, "Push", 3, "Pull", 5, "Legs"), byWeekday,
                "each of the client's mornings must take its own day of the plan");
    }

    /* ------------------------------------------------------------- fixtures */

    /** The `id` off a 201 body, without pulling in a JSON parser for one field. */
    private String jsonId(org.springframework.test.web.servlet.ResultActions r) throws Exception {
        return r.andReturn().getResponse().getContentAsString()
                .replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }


    private org.springframework.test.web.servlet.ResultActions sell(int sessions, String week) throws Exception {
        String body = "{\"type\":\"session_pack\",\"sessionsTotal\":" + sessions + ",\"amount\":9000"
                + (week == null ? "" : ",\"weeklySchedule\":" + week) + "}";
        return mvc.perform(post("/v1/clients/" + client + "/packages")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String sellAndRead(int sessions, String week) throws Exception {
        String json = sell(sessions, week).andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }

    private void setWeek(String week) throws Exception {
        putWeek(week).andExpect(status().isOk());
    }

    private ResultActions putWeek(String week) throws Exception {
        return mvc.perform(put("/v1/clients/" + client)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"weeklySchedule\":" + week + "}"));
    }

    /** Every live session on this client's diary, in order. */
    private List<java.time.ZonedDateTime> diary() {
        return jdbc.queryForList("""
                SELECT scheduled_at FROM scheduled_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ORDER BY scheduled_at ASC
                """, Map.of("cid", client.toString())).stream()
                .map(r -> ((java.sql.Timestamp) r.get("scheduled_at")).toInstant().atZone(IST))
                .toList();
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
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

    private static UsernamePasswordAuthenticationToken token(UUID trainerId) {
        return new UsernamePasswordAuthenticationToken(
                trainerId.toString(), null,
                AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
    }
}
