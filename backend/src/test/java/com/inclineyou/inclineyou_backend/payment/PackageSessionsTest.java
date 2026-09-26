package com.inclineyou.inclineyou_backend.payment;

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

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V4 · {@code POST /v1/packages/{id}/sessions} — correcting a miscounted pack.
 *
 * <p>What is actually under test is the line between a CORRECTION and a SALE,
 * because the two sit inches apart on the same card and only one of them
 * involves money. A correction moves what the pack holds and leaves
 * {@code amount} exactly as it was; buying more sessions is
 * {@code POST /v1/packages/{id}/renew} with today's {@code startDate}, which
 * writes a second {@code package} row. If the first ever starts touching the
 * price, a trainer's per-session figure becomes a blend of two rates and nothing
 * is left saying what was agreed in August.
 *
 * <p>The other half is why this is not the {@code PATCH /v1/packages/{id}} that
 * {@code API.md} and {@code BACKEND_GAPS.md} §6 have refused from the start.
 * That route sets {@code sessionsRemaining} directly and can therefore silently
 * un-deliver a session the diary has already charged for. This one sets the
 * TOTAL and moves what is left by the same delta, so
 * {@code used = total − remaining} survives every call — which is
 * {@link #deliveredIsInvariant()}, the load-bearing test here.
 */
@SpringBootTest
@Transactional
class PackageSessionsTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;

    private UUID owner;
    private UUID other;
    private UUID client;

    @BeforeEach
    void setUp() {
        owner = trainer("9100000061");
        other = trainer("9100000062");
        client = client(owner, "Vikram");
        SecurityContextHolder.getContext().setAuthentication(token(owner));
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(token(owner)))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ────────────────────────────────────────────────── the correction ── */

    @Test
    @DisplayName("ten becomes twelve, and what is left moves with it")
    void correctsUpwards() throws Exception {
        var pack = pack(10, 4, null, "7000");

        mvc.perform(correct(pack, "{\"sessionsTotal\":12,\"reason\":\"Sold as 12\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionsTotal").value(12))
                .andExpect(jsonPath("$.sessionsRemaining").value(6));

        assertEquals(new BigDecimal("7000.00"), amount(pack), "a correction is not a sale");
    }

    @Test
    @DisplayName("and downwards, for the commoner typo")
    void correctsDownwards() throws Exception {
        var pack = pack(12, 12, null, "9000");

        mvc.perform(correct(pack, "{\"sessionsTotal\":10}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionsTotal").value(10))
                .andExpect(jsonPath("$.sessionsRemaining").value(10));
    }

    /**
     * THE ONE THAT MAKES THIS ROUTE SAFE.
     *
     * <p>Six delivered before, six delivered after — twice over, in both
     * directions. A route that could change this number is the one both
     * documents refuse, because the sessions it un-delivers were charged for
     * through the diary and their undo trail lives on {@code scheduled_session}.
     */
    @Test
    @DisplayName("what has been delivered never changes")
    void deliveredIsInvariant() throws Exception {
        var pack = pack(12, 6, null, "9000");   // six delivered

        mvc.perform(correct(pack, "{\"sessionsTotal\":20}")).andExpect(status().isOk());
        assertEquals(6, total(pack) - remaining(pack));

        mvc.perform(correct(pack, "{\"sessionsTotal\":8}")).andExpect(status().isOk());
        assertEquals(6, total(pack) - remaining(pack));
    }

    /** Append-only, and it carries the delta rather than the total. */
    @Test
    @DisplayName("it leaves a row saying what moved and why")
    void logsTheDelta() throws Exception {
        var pack = pack(10, 10, null, "7000");

        mvc.perform(correct(pack, "{\"sessionsTotal\":14,\"reason\":\"Sold as 14, typed as 10\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/v1/packages/" + pack + "/adjustments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].kind").value("sessions"))
                .andExpect(jsonPath("$[0].sessions").value(4))
                // Days stay zero: this verb moves neither dates nor money.
                .andExpect(jsonPath("$[0].days").value(0))
                .andExpect(jsonPath("$[0].reason").value("Sold as 14, typed as 10"));
    }

    /**
     * The V4 field is additive, so the three verbs that predate it must read
     * back as having moved no sessions rather than as null or absent.
     */
    @Test
    @DisplayName("an extension still reports zero sessions moved")
    void extendMovesNoSessions() throws Exception {
        var pack = pack(10, 10, null, "7000");
        jdbc.update("UPDATE package SET end_date = CURRENT_DATE + 10 WHERE id = :id::uuid",
                Map.of("id", pack.toString()));

        mvc.perform(post("/v1/packages/" + pack + "/extend")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"days\":14}"))
                .andExpect(status().isOk());

        mvc.perform(get("/v1/packages/" + pack + "/adjustments"))
                .andExpect(jsonPath("$[0].kind").value("extend"))
                .andExpect(jsonPath("$[0].days").value(14))
                .andExpect(jsonPath("$[0].sessions").value(0));
    }

    /* ────────────────────────────────────────────────────── the guards ── */

    @Test
    @DisplayName("the count it already has is refused, not answered 200")
    void aNoOpIsRefused() throws Exception {
        var pack = pack(10, 10, null, "7000");

        mvc.perform(correct(pack, "{\"sessionsTotal\":10}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PACKAGE_NO_CHANGE"));
    }

    @Test
    @DisplayName("fewer than have been delivered is named, never clamped")
    void fewerThanDeliveredIsRefused() throws Exception {
        var pack = pack(10, 2, null, "7000");   // eight delivered

        mvc.perform(correct(pack, "{\"sessionsTotal\":5}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PACKAGE_FEWER_THAN_DELIVERED"));

        assertEquals(10, total(pack));
        assertEquals(2, remaining(pack));
    }

    @Test
    @DisplayName("zero, negative and absurd are all out of range")
    void outOfRangeIsRefused() throws Exception {
        var pack = pack(10, 10, null, "7000");

        for (String body : new String[]{"{\"sessionsTotal\":0}", "{\"sessionsTotal\":-2}",
                                        "{\"sessionsTotal\":900}"}) {
            mvc.perform(correct(pack, body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("PACKAGE_BAD_SESSION_COUNT"));
        }
    }

    @Test
    @DisplayName("a monthly pack has no count to correct")
    void monthlyIsRefused() throws Exception {
        var pack = monthly();

        mvc.perform(correct(pack, "{\"sessionsTotal\":10}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PACKAGE_NOT_COUNTED"));
    }

    @Test
    @DisplayName("a pack that has finished is refused — renew it instead")
    void aClosedPackIsRefused() throws Exception {
        var pack = pack(10, 0, null, "7000");
        jdbc.update("UPDATE package SET status = 'completed' WHERE id = :id::uuid",
                Map.of("id", pack.toString()));

        mvc.perform(correct(pack, "{\"sessionsTotal\":12}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PACKAGE_NOT_LIVE"));
    }

    /** Ownership is a query filter, so another trainer's pack is simply absent. */
    @Test
    @DisplayName("another trainer's pack is 404, not 403")
    void anotherTrainersPackIsNotFound() throws Exception {
        var theirClient = client(other, "Not mine");
        var pack = pack(other, theirClient, 10, 10, null, "7000");

        mvc.perform(correct(pack, "{\"sessionsTotal\":12}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PACKAGE_NOT_FOUND"));
    }

    /* ------------------------------------------------------------- fixtures */

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder correct(
            UUID pack, String body) {
        return post("/v1/packages/" + pack + "/sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private int remaining(UUID packId) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :id::uuid",
                Map.of("id", packId.toString()), Integer.class);
    }

    private int total(UUID packId) {
        return jdbc.queryForObject("SELECT sessions_total FROM package WHERE id = :id::uuid",
                Map.of("id", packId.toString()), Integer.class);
    }

    private BigDecimal amount(UUID packId) {
        return jdbc.queryForObject("SELECT amount FROM package WHERE id = :id::uuid",
                Map.of("id", packId.toString()), BigDecimal.class);
    }

    private UUID pack(int total, int remaining, String pausedAt, String amount) {
        return pack(owner, client, total, remaining, pausedAt, amount);
    }

    private UUID pack(UUID tid, UUID cid, int total, int remaining, String pausedAt, String amount) {
        var id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("cid", cid.toString());
        p.put("total", total);
        p.put("remaining", remaining);
        p.put("amount", new BigDecimal(amount));
        p.put("paused", pausedAt == null ? null : java.sql.Timestamp.valueOf(pausedAt + " 00:00:00"));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, sessions_total,
                    sessions_remaining, amount, currency, status, paused_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Session pack', 'floor', :total,
                    :remaining, :amount, 'INR', 'active', :paused)
                """, p);
        return id;
    }

    private UUID monthly() {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total,
                    sessions_remaining, amount, currency, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Monthly', 'floor', 'period', NULL, 0, 6000, 'INR', 'active')
                """, Map.of("id", id.toString(), "tid", owner.toString(), "cid", client.toString()));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, client_type)
                VALUES (:id::uuid, :tid::uuid, :name, 'independent')
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
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
