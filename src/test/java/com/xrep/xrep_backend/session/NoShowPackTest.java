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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * `packDelta` on `PUT /v1/sessions/{id}` — a no-show that can move the pack.
 *
 * <p>Before this, {@code POST /v1/sessions/{id}/done} was the only endpoint
 * anywhere that touched {@code sessions_remaining}, so a session marked
 * {@code no_show} over REST wrote a status and nothing else. The phone has never
 * behaved that way: {@code markNotTrained} settles the pack in the same write.
 *
 * <p>What is actually being tested is not the decrement — it is that the pack
 * reflects the session's <b>current outcome</b> rather than the running total of
 * every button ever pressed. Closing a session is not a one-way door: it can be
 * finished from the log, from the diary and from its detail screen, and
 * re-decided afterwards. Every one of those paths used to subtract one more, and
 * a twelve-session pack with one session delivered could read nine. The four
 * quadrants below are the server's copy of the phone's {@code settlePack}, and
 * they exist so the two halves cannot disagree about somebody's money.
 */
@SpringBootTest
@Transactional
class NoShowPackTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private UUID owner;
    private UUID client;

    @BeforeEach
    void setUp() {
        owner = trainer("9100000050");
        client = client(owner, "Meera");
        SecurityContextHolder.getContext().setAuthentication(token(owner));
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(token(owner)))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ─────────────────────────────────────────────── the four quadrants ── */

    @Test
    @DisplayName("not charged, and should be — one comes off the pack")
    void chargesANoShow() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"no_show\",\"packDelta\":-1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("no_show"))
                .andExpect(jsonPath("$.packDelta").value(-1))
                .andExpect(jsonPath("$.packPackageId").value(pack.toString()));

        assertEquals(11, remaining(pack));
    }

    @Test
    @DisplayName("not charged, and shouldn't be — the pack is untouched")
    void aFreeNoShowCostsNothing() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"no_show\",\"packDelta\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.packDelta").value(0));

        assertEquals(12, remaining(pack));
    }

    /**
     * The load-bearing quadrant. Two calls, one outcome — not two charges.
     */
    @Test
    @DisplayName("already charged and still should be — a second call takes nothing more")
    void chargingTwiceStillCostsOne() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);
        String body = "{\"status\":\"no_show\",\"packDelta\":-1}";

        mvc.perform(put("/v1/sessions/" + session).contentType(MediaType.APPLICATION_JSON).content(body));
        mvc.perform(put("/v1/sessions/" + session).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                // The ORIGINAL stamp is kept, so an undo still credits the pack
                // the session actually took from.
                .andExpect(jsonPath("$.packPackageId").value(pack.toString()));

        assertEquals(11, remaining(pack));
    }

    @Test
    @DisplayName("charged but shouldn't be — the session goes back on the pack")
    void changingYourMindRefunds() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"no_show\",\"packDelta\":-1}"));
        assertEquals(11, remaining(pack));

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"packDelta\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.packDelta").value(0))
                .andExpect(jsonPath("$.packPackageId").doesNotExist());

        assertEquals(12, remaining(pack));
    }

    /* ──────────────────────────────────────────────────── the guards ── */

    /**
     * V30 · the one place the pause has to hold. `paused_at` is a column and not
     * a `status` value precisely so every other read keeps counting a client who
     * is in Kerala as the active client they still are — and this is the single
     * predicate that pays for that choice.
     */
    @Test
    @DisplayName("a paused pack is not charged for a missed session")
    void aPausedPackIsNotChargeable() throws Exception {
        var pack = pack(12, 12, "2026-08-01");
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"no_show\",\"packDelta\":-1}"))
                .andExpect(status().isOk())
                // Marked, and free — exactly as it already is for a client with
                // no pack at all. The zero is stamped rather than left null so a
                // later resume cannot bill it late.
                .andExpect(jsonPath("$.packDelta").value(0))
                .andExpect(jsonPath("$.packPackageId").doesNotExist());

        assertEquals(12, remaining(pack));
    }

    @Test
    @DisplayName("a client with no pack is marked for free, not refused")
    void noPackIsNotAnError() throws Exception {
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"no_show\",\"packDelta\":-1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.packDelta").value(0));
    }

    /**
     * A route that can set an arbitrary delta is the "more general answer and the
     * more dangerous one": it can bill four sessions for one no-show.
     */
    @Test
    @DisplayName("any delta but -1 or 0 is refused")
    void arbitraryDeltasAreRefused() throws Exception {
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"no_show\",\"packDelta\":-4}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * `done` owns its charge in `markDone`, which also opens the workout log.
     * Two front doors to one outcome is the double-charge shape again.
     */
    @Test
    @DisplayName("a done session cannot be charged here — that is /done's job")
    void doneIsRefused() throws Exception {
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"done\",\"packDelta\":-1}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * Every caller written before this field — every reschedule, every note edit
     * — sends no `packDelta`, and none of them may move somebody's balance.
     */
    @Test
    @DisplayName("a reschedule that says nothing about the pack leaves it alone")
    void omittingPackDeltaTouchesNothing() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"notes\":\"moved to Thursday\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.packDelta").doesNotExist());

        assertEquals(12, remaining(pack));
    }

    /** The credit never exceeds the pack's own total. */
    @Test
    @DisplayName("a refund cannot push a pack past what was sold")
    void refundIsCappedAtTheTotal() throws Exception {
        var pack = pack(12, 12, null);
        var session = session(client);

        mvc.perform(put("/v1/sessions/" + session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"no_show\",\"packDelta\":-1}"));
        // Somebody else put the session back behind our back; the refund must
        // not add a thirteenth.
        jdbc.update("UPDATE package SET sessions_remaining = 12 WHERE id = :id::uuid",
                Map.of("id", pack.toString()));

        mvc.perform(put("/v1/sessions/" + session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"packDelta\":0}"))
                .andExpect(status().isOk());

        assertEquals(12, remaining(pack));
    }

    /* ------------------------------------------------------------- fixtures */

    private int remaining(UUID packId) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :id::uuid",
                Map.of("id", packId.toString()), Integer.class);
    }

    private UUID pack(int total, int remaining, String pausedAt) {
        var id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", owner.toString());
        p.put("cid", client.toString());
        p.put("total", total);
        p.put("remaining", remaining);
        p.put("paused", pausedAt == null ? null : java.sql.Timestamp.valueOf(pausedAt + " 00:00:00"));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, type, sessions_total,
                    sessions_remaining, amount, status, paused_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'session_pack', :total,
                    :remaining, 9000, 'active', :paused)
                """, p);
        return id;
    }

    private UUID session(UUID clientId) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, NOW())
                """, Map.of("id", id.toString(), "tid", owner.toString(), "cid", clientId.toString()));
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
}
