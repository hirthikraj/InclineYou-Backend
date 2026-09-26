package com.inclineyou.inclineyou_backend.portal;

import com.inclineyou.inclineyou_backend.auth.OtpSender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
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
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Module 11e · the client's account: the two-code number change across every
 * roster, correcting `health`, the export's withholding, and leaving a trainer
 * as a membership exit. The OTP codes are REAL — a capturing sender stands in
 * for the SMS, as in {@code TrainerAccountTest}.
 */
@SpringBootTest
@Transactional
@Import(PortalAccountTest.CapturingSender.class)
class PortalAccountTest {

    private static final AtomicInteger SEQ = new AtomicInteger(ThreadLocalRandom.current().nextInt(0, 40_000));

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc mvc;
    private String phone;
    private String free;
    private UUID asha;
    private UUID ravi;
    private UUID meera;     // Asha's
    private UUID meera2;    // Ravi's
    private UUID declined;  // a third, declined roster on the same number

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        sender.sent.clear();
        int n = SEQ.incrementAndGet() * 10;
        phone = "8" + String.format("%09d", n % 1_000_000_000);
        free = "8" + String.format("%09d", (n + 1) % 1_000_000_000);
        asha = trainer("Asha", "7" + String.format("%09d", n % 1_000_000_000));
        ravi = trainer("Ravi", "7" + String.format("%09d", (n + 1) % 1_000_000_000));
        meera = client(asha, "Meera", "accepted", "now()");
        meera2 = client(ravi, "Meera R", "accepted", "now() - interval '9 days'");
        declined = client(ravi, "Meera D", "declined", "NULL");
        jdbc.update("INSERT INTO app_user (phone, role) VALUES (:p, 'client') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        signedIn(phone);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a number change proves both numbers and moves every roster — and the identity row — at once")
    void changeNumber() throws Exception {
        mvc.perform(post("/v1/me/phone/challenge")).andExpect(status().isNoContent());
        String ticket = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/me/phone/verify")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + sender.codeFor(phone) + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.ticket");
        mvc.perform(post("/v1/me/phone/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"phone\":\"" + free + "\"}")).andExpect(status().isNoContent());
        mvc.perform(post("/v1/me/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ticket\":\"" + ticket + "\",\"phone\":\"" + free + "\",\"otp\":\"" + sender.codeFor(free) + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value(free))
                .andExpect(jsonPath("$.token").isString());

        for (UUID c : new UUID[]{meera, meera2, declined}) {
            assertThat(jdbc.queryForObject("SELECT phone FROM client WHERE id = :id::uuid", Map.of("id", c.toString()), String.class))
                    .isEqualTo(free);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE phone = :p", Map.of("p", free), Integer.class)).isOne();
        mvc.perform(get("/v1/me")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_CLIENT"));
        signedIn(free);
        mvc.perform(get("/v1/me")).andExpect(status().isOk()).andExpect(jsonPath("$.rosters.length()").value(2));
    }

    @Test
    @DisplayName("the new number is checked before an SMS is spent: shape, a real move, nobody holding it; the ticket is required")
    void changeRefusals() throws Exception {
        String ticket = ticket();
        String trainersPhone = jdbc.queryForObject("SELECT phone FROM trainer WHERE id = :id::uuid", Map.of("id", asha.toString()), String.class);
        sender.sent.clear();
        request(ticket, trainersPhone).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PHONE_TAKEN"));
        request(ticket, phone).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PHONE_UNCHANGED"));
        request(ticket, "12345").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        assertThat(sender.sent).isEmpty();
        request("forged", free).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("PHONE_CHANGE_UNPROVEN"));
        mvc.perform(post("/v1/me/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"phone\":\"" + free + "\",\"otp\":\"000000\"}"))
                .andExpect(status().is4xxClientError());
        assertThat(jdbc.queryForObject("SELECT phone FROM client WHERE id = :id::uuid", Map.of("id", meera.toString()), String.class))
                .isEqualTo(phone);
    }

    @Test
    @DisplayName("PATCH /v1/me corrects health, and refuses a phone")
    void patchMe() throws Exception {
        mvc.perform(patch("/v1/me").contentType(MediaType.APPLICATION_JSON).content("{\"health\":\"  Old ACL repair, left knee  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.health").value("Old ACL repair, left knee"));
        mvc.perform(get("/v1/me")).andExpect(jsonPath("$.client.health").value("Old ACL repair, left knee"));
        mvc.perform(patch("/v1/me").contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"" + free + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the export is field-listed: no split or gym share, no private note; shared notes and prefs are in it")
    void export() throws Exception {
        jdbc.update("UPDATE client SET trainer_split_percent = 70 WHERE id = :id::uuid", Map.of("id", meera.toString()));
        jdbc.update("""
                INSERT INTO payment (trainer_id, client_id, amount, method, status, collected_by, gym_share_amount, paid_at, note)
                VALUES (:t::uuid, :c::uuid, 2000, 'cash', 'paid', 'gym', 600, now(), 'rest on Tuesday')
                """, Map.of("t", asha.toString(), "c", meera.toString()));
        jdbc.update("INSERT INTO client_note (client_id, trainer_id, body, shared_with_client) VALUES (:c::uuid, :t::uuid, 'private one', false), (:c::uuid, :t::uuid, 'shared one', true)",
                Map.of("c", meera.toString(), "t", asha.toString()));
        mvc.perform(patch("/v1/me/prefs").contentType(MediaType.APPLICATION_JSON).content("{\"hideWeight\":true}"));

        String json = mvc.perform(get("/v1/me/export")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json).doesNotContain("trainerSplitPercent", "collectedBy", "gymShareAmount", "private one");
        assertThat(json).contains("shared one", "rest on Tuesday", "\"hideWeight\":true");
        assertThat((String) com.jayway.jsonpath.JsonPath.read(json, "$.client.name")).isEqualTo("Meera");
        assertThat((String) com.jayway.jsonpath.JsonPath.read(json, "$.trainer.name")).isEqualTo("Asha");
    }

    @Test
    @DisplayName("leaving: the typed number is re-checked; the membership goes, the trainer's records stay, other rosters are untouched")
    void leave() throws Exception {
        jdbc.update("INSERT INTO payment (trainer_id, client_id, amount, method, status) VALUES (:t::uuid, :c::uuid, 2000, 'cash', 'paid')",
                Map.of("t", asha.toString(), "c", meera.toString()));
        jdbc.update("""
                INSERT INTO scheduled_session (trainer_id, client_id, scheduled_at, status) VALUES
                    (:t::uuid, :c::uuid, now() + interval '2 days', 'scheduled'),
                    (:t::uuid, :c::uuid, now() - interval '2 days', 'done')
                """, Map.of("t", asha.toString(), "c", meera.toString()));
        mvc.perform(patch("/v1/me/prefs").contentType(MediaType.APPLICATION_JSON)
                .content("{\"nominee\":{\"name\":\"Ravi\",\"phone\":\"9845012345\"}}"));

        mvc.perform(delete("/v1/me").contentType(MediaType.APPLICATION_JSON).content("{\"confirmation\":\"9999999999\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DELETE_NOT_CONFIRMED"));
        mvc.perform(delete("/v1/me").contentType(MediaType.APPLICATION_JSON).content("{\"confirmation\":\"+91 " + phone + "\"}"))
                .andExpect(status().isNoContent());

        var cid = Map.of("c", meera.toString());
        assertThat(jdbc.queryForObject("SELECT deleted_at IS NOT NULL FROM client WHERE id = :c::uuid", cid, Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment WHERE client_id = :c::uuid AND deleted_at IS NULL", cid, Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT nominee_phone FROM client_prefs WHERE client_id = :c::uuid", cid, String.class)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND deleted_at IS NULL", cid, Integer.class)).isOne();
        // The same person, on Ravi's roster, carries on.
        mvc.perform(get("/v1/me")).andExpect(status().isOk()).andExpect(jsonPath("$.client.id").value(meera2.toString()));
    }

    /* ── fixtures ────────────────────────────────────────────────────────── */

    private String ticket() throws Exception {
        mvc.perform(post("/v1/me/phone/challenge"));
        return com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/v1/me/phone/verify")
                .contentType(MediaType.APPLICATION_JSON).content("{\"otp\":\"" + sender.codeFor(phone) + "\"}"))
                .andReturn().getResponse().getContentAsString(), "$.ticket");
    }

    private org.springframework.test.web.servlet.ResultActions request(String ticket, String newPhone) throws Exception {
        return mvc.perform(post("/v1/me/phone/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"phone\":\"" + newPhone + "\"}"));
    }

    private UUID trainer(String name, String trainerPhone) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)", Map.of("id", id.toString(), "p", trainerPhone, "n", name));
        return id;
    }

    private UUID client(UUID trainerId, String name, String membership, String acceptedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status, accepted_at)
                VALUES (:id::uuid, :t::uuid, :n, :p, :m, %s)
                """.formatted(acceptedAt), Map.of("id", id.toString(), "t", trainerId.toString(), "n", name, "p", phone, "m", membership));
        return id;
    }

    private void signedIn(String p) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(p, null, AuthorityUtils.createAuthorityList("ROLE_CLIENT")));
    }

    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new HashMap<>();

        @Bean
        @Primary
        OtpSender capturingPortalOtpSender() {
            return this;
        }

        @Override
        public void send(String to, String code) {
            sent.put(to, code);
        }

        String codeFor(String to) {
            String code = sent.get(to);
            if (code == null) throw new AssertionError("no code was sent to " + to);
            return code;
        }
    }
}
