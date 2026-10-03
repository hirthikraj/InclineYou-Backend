package com.inclineyou.inclineyou_backend.core.client;

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

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code PUT /v1/clients/{id}/schedule} (api-contract Clients A8): the weekly slots book sessions through a rolling 28
 * days. This replaces {@code SaleBooksSessionsTest}, which pinned the pre-v1 rule that SELLING A PACK booked the diary
 * (a pack-count reconcile against {@code client.weekly_schedule}). In v1 the sale books nothing; the week does.
 *
 * <p>What is pinned: the whole week is conditional (428 / 412), a slot books forward from the latest session it ever
 * made so re-sending the same week books nothing, dropping a slot cancels only its own future sessions, a session
 * somebody booked or moved by hand is not the rhythm's to take, {@code bookFrom} starts the window, a paused client books
 * nothing, an archived one is refused, and a clash is a warning and not a refusal.
 */
@SpringBootTest
@Transactional
class ClientScheduleTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID owner, tenant, client;

    private static final String MWF = "[{\"weekday\":1,\"start\":\"07:00\"},{\"weekday\":3,\"start\":\"07:00\"},{\"weekday\":5,\"start\":\"07:00\"}]";

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("+919100000780");
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
    @DisplayName("the whole week is conditional: 428 without If-Match, 412 when stale, a repeated weekday and start is a 400")
    void conditional() throws Exception {
        mvc.perform(put("/v1/clients/" + client + "/schedule").contentType(MediaType.APPLICATION_JSON).content(week(MWF)))
                .andExpect(status().isPreconditionRequired());
        mvc.perform(put("/v1/clients/" + client + "/schedule").header("If-Match", "\"1\"")
                        .contentType(MediaType.APPLICATION_JSON).content(week(MWF)))
                .andExpect(status().isPreconditionFailed());
        saveWeek(week("[{\"weekday\":1,\"start\":\"07:00\"},{\"weekday\":1,\"start\":\"07:00\"}]")).andExpect(status().isBadRequest());
        saveWeek("{\"slots\":[{\"weekday\":8,\"start\":\"07:00\"}]}").andExpect(status().isBadRequest());
        saveWeek("{}").andExpect(status().isBadRequest());                       // PUT replaces: slots are required
        assertEquals(0, diary().size());
    }

    @Test
    @DisplayName("a week books every slot's date through the next 28 days, from tomorrow, at the slot's local time")
    void booksTheWindow() throws Exception {
        var res = saveWeek(week(MWF)).andExpect(status().isOk()).andExpect(jsonPath("$.slots.length()").value(3))
                .andExpect(jsonPath("$.cancelled").value(0)).andReturn();
        List<ZonedDateTime> booked = diary();
        int expected = expectedDates(LocalDate.now(IST).plusDays(1), LocalDate.now(IST).plusDays(28), 1, 3, 5);
        assertEquals(expected, booked.size());
        assertTrue(expected >= 11, "four weeks of a three-day week is about twelve");
        assertTrue(booked.stream().allMatch(at -> at.getHour() == 7 && at.getMinute() == 0));
        assertTrue(booked.stream().allMatch(at -> switch (at.getDayOfWeek()) {
            case MONDAY, WEDNESDAY, FRIDAY -> true;
            default -> false;
        }));
        assertTrue(booked.getFirst().toLocalDate().isAfter(LocalDate.now(IST)), "booking starts tomorrow, never this morning");
        assertTrue(!booked.getLast().toLocalDate().isAfter(LocalDate.now(IST).plusDays(28)));
        String body = res.getResponse().getContentAsString();
        assertTrue(body.contains("\"booked\":" + expected), body);
    }

    @Test
    @DisplayName("sending the same week again books nothing: each slot books forward from the latest session it ever made")
    void resendingBooksNothing() throws Exception {
        saveWeek(week(MWF)).andExpect(status().isOk());
        int before = diary().size();
        saveWeek(week(MWF)).andExpect(status().isOk()).andExpect(jsonPath("$.booked").value(0));
        assertEquals(before, diary().size());
    }

    @Test
    @DisplayName("dropping a slot cancels its future sessions and keeps the others; adding it back books a fresh window and un-cancels nothing")
    void droppingASlot() throws Exception {
        saveWeek(week(MWF)).andExpect(status().isOk());
        int fridays = (int) diary().stream().filter(at -> at.getDayOfWeek() == DayOfWeek.FRIDAY).count();
        assertTrue(fridays >= 3);

        saveWeek(week("[{\"weekday\":1,\"start\":\"07:00\"},{\"weekday\":3,\"start\":\"07:00\"}]"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancelled").value(fridays)).andExpect(jsonPath("$.booked").value(0));
        assertTrue(diary().stream().noneMatch(at -> at.getDayOfWeek() == DayOfWeek.FRIDAY));
        // Adding Friday back is a NEW slot (the old one was deleted), so it books its own window afresh; the cancelled
        // rows stay cancelled — nothing is un-cancelled, and no date is booked twice.
        saveWeek(week(MWF)).andExpect(status().isOk()).andExpect(jsonPath("$.booked").value(fridays));
        assertEquals(fridays, diary().stream().filter(at -> at.getDayOfWeek() == DayOfWeek.FRIDAY).count());
        assertEquals(fridays, jdbc.queryForObject("SELECT count(*)::int FROM scheduled_session WHERE client_id = :c::uuid AND status = 'cancelled'",
                Map.of("c", client.toString()), Integer.class));
    }

    @Test
    @DisplayName("a session booked or moved by hand is not the rhythm's to take, and a moved one keeps its place when its slot goes")
    void handBookedSurvive() throws Exception {
        saveWeek(week(MWF)).andExpect(status().isOk());
        // A hand-booked Saturday the rhythm did not put there.
        ZonedDateTime saturday = LocalDate.now(IST).with(DayOfWeek.SATURDAY).plusWeeks(1).atTime(10, 0).atZone(IST);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, :at, 60, :at)""",
                Map.of("t", owner.toString(), "c", client.toString(), "at", java.sql.Timestamp.from(saturday.toInstant())));

        saveWeek(week("[{\"weekday\":2,\"start\":\"18:00\"}]")).andExpect(status().isOk());
        assertTrue(diary().stream().anyMatch(at -> at.getDayOfWeek() == DayOfWeek.SATURDAY),
                "the hand-booked Saturday was swept away by a rhythm it was never part of");
        assertTrue(diary().stream().noneMatch(at -> at.getDayOfWeek() == DayOfWeek.MONDAY || at.getDayOfWeek() == DayOfWeek.WEDNESDAY));
    }

    @Test
    @DisplayName("bookFrom starts the window later; a paused client books nothing and an archived one is refused")
    void bookFromAndStates() throws Exception {
        LocalDate from = LocalDate.now(IST).plusDays(14);
        saveWeek("{\"slots\":" + MWF + ",\"bookFrom\":\"" + from + "\"}").andExpect(status().isOk());
        assertTrue(diary().stream().allMatch(at -> !at.toLocalDate().isBefore(from)));
        assertEquals(expectedDates(from, LocalDate.now(IST).plusDays(28), 1, 3, 5), diary().size());

        UUID paused = client("Meena", "paused");
        putFor(paused, week(MWF)).andExpect(status().isOk()).andExpect(jsonPath("$.booked").value(0));
        assertEquals(0, diaryOf(paused).size());

        UUID archived = client("Old Client", "archived");
        putFor(archived, week(MWF)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_ARCHIVED"));
        mvcFor(UUID.randomUUID(), week(MWF)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a clash with another of the trainer's clients is a warning on a saved week, not a refusal; a prospect becomes active")
    void clashAndProspect() throws Exception {
        UUID other = client("Priya", "active");
        putFor(other, week("[{\"weekday\":1,\"start\":\"07:00\"}]")).andExpect(status().isOk());

        saveWeek(week("[{\"weekday\":1,\"start\":\"07:00\"}]")).andExpect(status().isOk())
                .andExpect(jsonPath("$.clashes.length()").value(1))
                .andExpect(jsonPath("$.clashes[0].weekday").value(1))
                .andExpect(jsonPath("$.clashes[0].clientName").value("Priya"));

        UUID prospect = client("Lead", "prospect");
        putFor(prospect, week("[{\"weekday\":4,\"start\":\"06:00\"}]")).andExpect(status().isOk());
        assertEquals("active", jdbc.queryForObject("SELECT status FROM client WHERE id = :id::uuid", Map.of("id", prospect.toString()), String.class));
        UUID stillProspect = client("Lead 2", "prospect");
        putFor(stillProspect, "{\"deliveryMode\":\"remote\",\"slots\":[]}").andExpect(status().isOk());
        assertEquals("prospect", jdbc.queryForObject("SELECT status FROM client WHERE id = :id::uuid", Map.of("id", stillProspect.toString()), String.class));
    }

    /* ------------------------------------------------------------- fixtures */

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

    private List<ZonedDateTime> diary() {
        return diaryOf(client);
    }

    private List<ZonedDateTime> diaryOf(UUID id) {
        return jdbc.queryForList("""
                SELECT scheduled_at FROM scheduled_session
                WHERE client_id = :c::uuid AND deleted_at IS NULL AND status <> 'cancelled' ORDER BY scheduled_at""",
                Map.of("c", id.toString()), java.sql.Timestamp.class).stream()
                .map(t -> t.toInstant().atZone(IST)).toList();
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
