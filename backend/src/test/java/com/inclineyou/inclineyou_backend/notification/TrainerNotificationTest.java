package com.inclineyou.inclineyou_backend.notification;

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

/**
 * V15 · the trainer's bell: the feed, marking one and marking all. Rows are
 * minted through the service's one write path (the SECURITY DEFINER function).
 */
@SpringBootTest
@Transactional
class TrainerNotificationTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired TrainerNotificationService bell;

    private MockMvc mvc;
    private UUID me;
    private UUID other;
    private UUID meera;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("9100001401");
        other = trainer("9100001402");
        meera = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name) VALUES (:id::uuid, :t::uuid, 'Meera')",
                Map.of("id", meera.toString(), "t", me.toString()));
        signedInAs(me);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("an empty bell is []; minted rows come back newest first, as facts, with the client's name")
    void feed() throws Exception {
        mvc.perform(get("/v1/notifications")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

        bell.mint(me, "metric", meera, null, null, "74.2 kg");
        jdbc.update("UPDATE trainer_notification SET at = now() - interval '1 hour' WHERE trainer_id = :t::uuid",
                Map.of("t", me.toString()));
        bell.mint(me, "payment", meera, new java.math.BigDecimal("4000"), null, "upi");
        bell.mint(other, "metric", meera, null, null, "not mine");

        mvc.perform(get("/v1/notifications"))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].kind").value("payment"))
                .andExpect(jsonPath("$[0].amount").value(4000))
                .andExpect(jsonPath("$[0].text").value("upi"))
                .andExpect(jsonPath("$[0].clientName").value("Meera"))
                .andExpect(jsonPath("$[0].readAt").doesNotExist())
                .andExpect(jsonPath("$[1].kind").value("metric"))
                .andExpect(jsonPath("$[1].at").isNumber());
    }

    @Test
    @DisplayName("the feed reaches back 90 days and no further")
    void window() throws Exception {
        bell.mint(me, "metric", meera, null, null, "old");
        jdbc.update("UPDATE trainer_notification SET at = now() - interval '91 days' WHERE trainer_id = :t::uuid",
                Map.of("t", me.toString()));
        mvc.perform(get("/v1/notifications")).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("marking one is idempotent and keeps the first readAt; somebody else's is a 404")
    void markOne() throws Exception {
        bell.mint(me, "metric", meera, null, null, "74.2 kg");
        String id = jdbc.queryForObject("SELECT id::text FROM trainer_notification WHERE trainer_id = :t::uuid",
                Map.of("t", me.toString()), String.class);
        String first = mvc.perform(post("/v1/notifications/" + id + "/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.readAt").isNumber())
                .andReturn().getResponse().getContentAsString();
        Object firstAt = com.jayway.jsonpath.JsonPath.read(first, "$.readAt");
        jdbc.update("UPDATE trainer_notification SET read_at = read_at - interval '1 minute' WHERE id = :id::uuid",
                Map.of("id", id));
        String again = mvc.perform(post("/v1/notifications/" + id + "/read"))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(((Number) com.jayway.jsonpath.JsonPath.read(again, "$.readAt")).longValue())
                .isEqualTo(((Number) firstAt).longValue() - 60_000);

        signedInAs(other);
        mvc.perform(post("/v1/notifications/" + id + "/read")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("mark-all stamps every unread row in one request and answers with the feed")
    void markAll() throws Exception {
        bell.mint(me, "metric", meera, null, null, "a");
        bell.mint(me, "team", meera, null, null, "Arun");
        mvc.perform(post("/v1/notifications/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].readAt").isNumber())
                .andExpect(jsonPath("$[1].readAt").isNumber());
    }

    @Test
    @DisplayName("an unknown kind is refused before it reaches the database")
    void unknownKind() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> bell.mint(me, "birthday", meera, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
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
