package com.inclineyou.inclineyou_backend.core.attention;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What the trainer has silenced in *Needs you today* ({@code /v1/attention/dismissals}, api-contract Today L8 / A3):
 * one row per client per kind, an upsert that keeps the first "not now"'s date, a band that must belong to its kind,
 * an idempotent restore, and a list that is the caller's own.
 */
@SpringBootTest
@Transactional
class AttentionDismissalTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, client;

    @BeforeEach
    void setUp() {
        me = trainer("+919100000901");
        other = trainer("+919100000902");
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(new UsernamePasswordAuthenticationToken(
                        me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"))))
                .build();
        client = client(me, "Ravi");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("PUT silences one row and answers it; the same call again replaces band and snooze and keeps the first date")
    void upsert() throws Exception {
        long until = System.currentTimeMillis() + 86_400_000L;
        String first = mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "pack").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"band\":\"pack-ending\",\"snoozedUntil\":" + until + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientId").value(client.toString()))
                .andExpect(jsonPath("$.kind").value("pack"))
                .andExpect(jsonPath("$.band").value("pack-ending"))
                .andExpect(jsonPath("$.snoozedUntil").value(until))
                .andExpect(jsonPath("$.createdAt").isNumber())
                .andReturn().getResponse().getContentAsString();
        long created = ((Number) com.jayway.jsonpath.JsonPath.read(first, "$.createdAt")).longValue();

        // Escalated and made permanent: a null snooze means "do not raise this again".
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "pack").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"band\":\"pack-empty\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.band").value("pack-empty"))
                .andExpect(jsonPath("$.snoozedUntil").doesNotExist())
                .andExpect(jsonPath("$.createdAt").value(created));
        mvc.perform(get("/v1/attention/dismissals")).andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    @DisplayName("a band outside its kind is a 400 BAND_KIND_MISMATCH, a blank band a 400 VALIDATION, someone else's client a 404")
    void refusals() throws Exception {
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "pack").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"missed\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAND_KIND_MISMATCH"));
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "nonsense").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"pack-empty\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAND_KIND_MISMATCH"));
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "pack").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"\"}"))
                .andExpect(status().isBadRequest());
        UUID theirs = client(other, "Theirs");
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", theirs, "missed").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"missed\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", UUID.randomUUID(), "missed").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"missed\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/attention/dismissals")).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    @DisplayName("DELETE puts a row back and is 204 again when nothing is there; the list is the caller's own, oldest first")
    void restoreAndList() throws Exception {
        UUID second = client(me, "Meena");
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", client, "missed").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"missed\"}")).andExpect(status().isOk());
        mvc.perform(put("/v1/attention/dismissals/{c}/{k}", second, "quiet").contentType(MediaType.APPLICATION_JSON).content("{\"band\":\"quiet\"}")).andExpect(status().isOk());
        // Another trainer's silence on a client of theirs never shows here.
        UUID theirs = client(other, "Theirs");
        jdbc.update("INSERT INTO attention_dismissal (trainer_id, client_id, kind, band) VALUES (:t::uuid, :c::uuid, 'quiet', 'quiet')",
                Map.of("t", other.toString(), "c", theirs.toString()));

        mvc.perform(get("/v1/attention/dismissals")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(delete("/v1/attention/dismissals/{c}/{k}", client, "missed")).andExpect(status().isNoContent());
        mvc.perform(delete("/v1/attention/dismissals/{c}/{k}", client, "missed")).andExpect(status().isNoContent());
        mvc.perform(get("/v1/attention/dismissals")).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("quiet"));
        // Not another trainer's row to restore: deleting by this trainer's id never matches it.
        mvc.perform(delete("/v1/attention/dismissals/{c}/{k}", theirs, "quiet")).andExpect(status().isNoContent());
        Integer left = jdbc.queryForObject("SELECT count(*)::int FROM attention_dismissal WHERE trainer_id = :t::uuid", Map.of("t", other.toString()), Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, left);
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID client(UUID trainerId, String name) {
        UUID id = UUID.randomUUID();
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, :n, 'independent')",
                Map.of("id", id.toString(), "t", trainerId.toString(), "ten", tenant.toString(), "n", name));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Coach') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }
}
