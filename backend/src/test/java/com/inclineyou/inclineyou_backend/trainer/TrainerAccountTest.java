package com.inclineyou.inclineyou_backend.trainer;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import jakarta.persistence.EntityManager;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V36 · the account — the email, the number, and the way out.
 *
 * Six properties, and none of them is the CRUD:
 *
 * <ol>
 *   <li><b>The email is a contact detail, not a login.</b> Two trainers may
 *       share one, and nothing about sign-in changes when it is set — checked
 *       because the obvious next feature is *sign in with your email*, and the
 *       column is deliberately not shaped for it;</li>
 *   <li><b>both numbers are proved.</b> The step that matters is the first one:
 *       without it a stolen seven-day token could walk an account onto a number
 *       the thief controls;</li>
 *   <li><b>a ticket is bound to the number it proved.</b> Otherwise one code
 *       buys two changes, the second onto a SIM nobody demonstrated holding;</li>
 *   <li><b>the swap is atomic across two tables.</b> A change on {@code trainer}
 *       and not {@code app_user} is an account that cannot be signed into;</li>
 *   <li><b>a taken number is refused and does not say who has it</b> — this
 *       endpoint must not become *is this number on InclineYou* for any number in
 *       India, one request at a time;</li>
 *   <li><b>deletion needs the number typed, and a soft-deleted account keeps
 *       it.</b> The second half is the consequence a trainer cannot discover by
 *       trying it once, so it is pinned here rather than left to a comment.</li>
 * </ol>
 *
 * <p>The codes are REAL. {@link CapturingSender} takes the place of the logging
 * sender rather than {@code OtpService} being mocked, so every case below runs
 * through the same bcrypt hash, the same store and the same expiry that sign-in
 * does — which is the whole claim this feature makes about reusing it.
 */
@SpringBootTest
@Transactional
@Import(TrainerAccountTest.CapturingSender.class)
class TrainerAccountTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;
    @Autowired EntityManager em;

    private MockMvc mvc;
    private UUID me;

    /**
     * A FRESH TRIPLE OF NUMBERS PER TEST, and it is not tidiness.
     *
     * <p>{@code OtpSendLimiter} enforces ten codes per rolling day per phone
     * through {@code Bucket4jLimiter}, which with no Redis in CI falls back to
     * an IN-PROCESS bucket — and an in-process bucket is not inside the
     * transaction this class rolls back. Sharing one number across thirteen
     * tests spends that day's ceiling somewhere around the ninth of them, and
     * the rest fail with a 429 that has nothing to do with what they assert.
     *
     * <p>And the base is RANDOM PER JVM rather than a fixed prefix, which is the
     * half that only bites when Redis is up. This transaction rolls back and the
     * bucket does not — so with a fixed base the second run of the suite on a
     * developer's machine reuses numbers whose daily ceiling the first run
     * already spent, and every OTP test fails with a 429 for twenty-four hours.
     * CI never sees it: there is no Redis there, the fallback is in-process, and
     * a fresh JVM starts with an empty map. A green pipeline and a red laptop.
     *
     * <p>Worth knowing before writing the next test on this endpoint: it is the
     * same trap in the same place whether the ceiling is hit by a real trainer
     * or by a suite, which is the argument for the limiter being where it is.
     */
    private static final AtomicInteger SEQ =
            new AtomicInteger(ThreadLocalRandom.current().nextInt(0, 40_000));

    private String MINE;
    private String FREE;
    private String THEIRS;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        sender.sent.clear();
        int n = SEQ.incrementAndGet() * 10;
        MINE = phoneNumber(n);
        FREE = phoneNumber(n + 1);
        THEIRS = phoneNumber(n + 2);
        me = trainer(MINE);
        signedInAs(me);
    }

    /** A valid Indian mobile shape — the 9 series — with a per-run, per-test tail. */
    private static String phoneNumber(int n) {
        return "9" + String.format("%09d", n % 1_000_000_000);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /* ─────────────────────────────────────────────────────────── the email ── */

    @Test
    @DisplayName("a trainer who predates V36 reads back with no email")
    void absentByDefault() throws Exception {
        mvc.perform(get("/v1/trainers/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    @DisplayName("an email is stored, trimmed, and cleared by \"\"")
    void emailRoundTrip() throws Exception {
        patchMe("{\"email\":\"  ravi@example.com  \"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ravi@example.com"));

        // Null leaves alone — the rule the whole endpoint rests on, and the one
        // a later refactor collapses into "ignore blanks".
        patchMe("{\"headline\":\"Strength coach\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ravi@example.com"));

        patchMe("{\"email\":\"\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").doesNotExist())
                // Clearing one column must not disturb its neighbour.
                .andExpect(jsonPath("$.headline").value("Strength coach"));
    }

    @Test
    @DisplayName("something that is not an address at all is refused")
    void emailShape() throws Exception {
        for (String bad : new String[] {"ravi", "ravi@", "@example.com", "ravi@example",
                                        "ravi example@x.com", "a@b@example.com"}) {
            patchMe("{\"email\":\"" + bad + "\"}")
                    .andExpect(status().isBadRequest())
                    // The SENTENCE, not just the status. This endpoint's other
                    // refusals throw `ResponseStatusException` and lose theirs to
                    // the servlet error page — measured against a running server
                    // — so the one a trainer will actually meet goes through
                    // `AccountRuleException` instead.
                    .andExpect(jsonPath("$.code").value("EMAIL_INVALID"))
                    .andExpect(jsonPath("$.detail").isNotEmpty());
        }

        // And the cap is a refusal too, not a truncation: half an address is not
        // a shorter address, it is a wrong one.
        patchMe("{\"email\":\"" + "a".repeat(250) + "@example.com\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMAIL_TOO_LONG"));
        // And nothing looser than that. A plus-addressed Gmail and a long TLD are
        // both real addresses, and a validator that rejects one is a validator a
        // trainer cannot argue with.
        patchMe("{\"email\":\"ravi+inclineyou@sub.example.co.in\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ravi+inclineyou@sub.example.co.in"));
    }

    @Test
    @DisplayName("an email is NOT a login — two trainers may share one")
    void emailIsNotUnique() throws Exception {
        UUID other = trainer(THEIRS);
        patchMe("{\"email\":\"desk@thegym.in\"}").andExpect(status().isOk());

        signedInAs(other);
        patchMe("{\"email\":\"desk@thegym.in\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("desk@thegym.in"));
    }

    /* ────────────────────────────────────────────────── changing the number ── */

    @Test
    @DisplayName("the whole flow: prove the old number, prove the new one, and both tables move")
    void phoneChangeHappyPath() throws Exception {
        String ticket = proveCurrent();

        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", FREE))))
                .andExpect(status().isOk());

        mvc.perform(post("/v1/trainers/me/phone/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", FREE,
                                             "otp", sender.codeFor(FREE)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value(FREE))
                // A fresh token, because the old one carries the old number in
                // its `phone` claim.
                .andExpect(jsonPath("$.token").isNotEmpty());

        // BOTH tables. `app_user` is what sign-in resolves and `trainer` is what
        // every authorised request loads; a change on one and not the other is
        // an account that either cannot be signed into or cannot be found once
        // you are in.
        assertThat(phoneOfTrainer(me)).isEqualTo(FREE);
        assertThat(roleOfUser(FREE)).isEqualTo("trainer");
        assertThat(userExists(MINE)).isFalse();
    }

    @Test
    @DisplayName("without the first proof, nothing else in the flow works")
    void ticketIsRequired() throws Exception {
        // This is the property the brief asks for, stated as a test: a bearer
        // token alone must not be able to move an account.
        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", "not-a-ticket", "phone", FREE))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PHONE_CHANGE_UNPROVEN"));

        assertThat(phoneOfTrainer(me)).isEqualTo(MINE);
    }

    @Test
    @DisplayName("a ticket is spent against the number it proved, so it does not survive a change")
    void ticketIsBoundToTheProvedNumber() throws Exception {
        String ticket = proveCurrent();
        request(ticket, FREE);
        confirm(ticket, FREE).andExpect(status().isOk());

        // The same ticket now proves a SIM this account no longer uses. One code
        // must not buy two changes.
        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", THEIRS))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PHONE_CHANGE_UNPROVEN"));
    }

    @Test
    @DisplayName("a number somebody already holds is refused, and the refusal does not say who")
    void takenNumber() throws Exception {
        trainer(THEIRS);
        String ticket = proveCurrent();

        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", THEIRS))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHONE_TAKEN"))
                // Nothing about whose it is, or even whether it is a trainer's:
                // otherwise this endpoint answers "is this number on InclineYou" for
                // any number in India, one request at a time.
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(THEIRS))));

        // And no code was spent on a number that could never have worked.
        assertThat(sender.sent).doesNotContainKey(THEIRS);
    }

    @Test
    @DisplayName("the number they are already on is named, not silently accepted")
    void samePhone() throws Exception {
        String ticket = proveCurrent();
        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", MINE))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PHONE_UNCHANGED"));
    }

    @Test
    @DisplayName("a wrong code on the new number leaves the account exactly where it was")
    void wrongCodeChangesNothing() throws Exception {
        String ticket = proveCurrent();
        request(ticket, FREE);

        mvc.perform(post("/v1/trainers/me/phone/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", FREE, "otp", "000000"))))
                .andExpect(status().is4xxClientError());

        assertThat(phoneOfTrainer(me)).isEqualTo(MINE);
        assertThat(userExists(FREE)).isFalse();
    }

    /* ──────────────────────────────────────────────────────── deleting it ── */

    @Test
    @DisplayName("the number typed back is the confirmation, in any format the app prints it")
    void deleteNeedsTheNumber() throws Exception {
        mvc.perform(delete("/v1/trainers/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("confirmPhone", "9999999999"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DELETE_NOT_CONFIRMED"));

        assertThat(deletedAtOfTrainer(me)).isNull();

        // `+91 98410 22119` is the shape `formatPhone` prints one card above the
        // field. A confirmation that refuses the product's own formatting
        // teaches the trainer the product is broken.
        String asShown = "+91 " + MINE.substring(0, 5) + " " + MINE.substring(5);
        mvc.perform(delete("/v1/trainers/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("confirmPhone", asShown))))
                .andExpect(status().isNoContent());

        assertThat(deletedAtOfTrainer(me)).isNotNull();
    }

    @Test
    @DisplayName("both rows are stamped, and the number is NOT released")
    void deleteStampsBothAndKeepsTheNumber() throws Exception {
        mvc.perform(delete("/v1/trainers/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("confirmPhone", MINE))))
                .andExpect(status().isNoContent());

        assertThat(deletedAtOfTrainer(me)).isNotNull();
        assertThat(userExists(MINE)).isFalse();          // no LIVE row
        assertThat(anyUserRowFor(MINE)).isTrue();        // the row is still there

        // Which is the promise the confirm step makes: the account keeps its
        // number so nobody else is handed a sign-in next to a year of somebody
        // else's money. Another trainer moving onto it is refused.
        UUID other = trainer(THEIRS);
        signedInAs(other);
        String ticket = proveCurrentFor(THEIRS);
        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", MINE))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHONE_TAKEN"));
    }

    @Test
    @DisplayName("everything else 404s once the account is gone, including a second delete")
    void deletedAccountIsUnreachable() throws Exception {
        mvc.perform(delete("/v1/trainers/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("confirmPhone", MINE))))
                .andExpect(status().isNoContent());

        mvc.perform(get("/v1/trainers/me")).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/trainers/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("confirmPhone", MINE))))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------ fixtures */

    /** Steps 1 and 2, for the signed-in trainer. */
    private String proveCurrent() throws Exception {
        return proveCurrentFor(MINE);
    }

    private String proveCurrentFor(String phone) throws Exception {
        mvc.perform(post("/v1/trainers/me/phone/challenge")).andExpect(status().isOk());
        String json = mvc.perform(post("/v1/trainers/me/phone/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("otp", sender.codeFor(phone)))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll(".*\"ticket\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private void request(String ticket, String phone) throws Exception {
        mvc.perform(post("/v1/trainers/me/phone/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("ticket", ticket, "phone", phone))))
                .andExpect(status().isOk());
    }

    private ResultActions confirm(String ticket, String phone) throws Exception {
        return mvc.perform(post("/v1/trainers/me/phone/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("ticket", ticket, "phone", phone, "otp", sender.codeFor(phone)))));
    }

    private ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static String body(Map<String, String> fields) {
        StringBuilder sb = new StringBuilder("{");
        fields.forEach((k, v) -> sb.append('"').append(k).append("\":\"").append(v).append("\","));
        sb.setLength(sb.length() - 1);
        return sb.append('}').toString();
    }

    private UUID trainer(String phone) {
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (gen_random_uuid(), :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        // The `app_user` row too. V18's backfill wrote one for every trainer that
        // existed, and every path that creates one since writes one — a fixture
        // without it would be testing the repair branch rather than the rule.
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone",
                Map.of("phone", phone), String.class));
    }

    private String phoneOfTrainer(UUID id) {
        // `repo.save()` does not flush, and this class is @Transactional, so a
        // raw read can precede the UPDATE that the assertion is about.
        em.flush();
        return jdbc.queryForObject("SELECT phone FROM trainer WHERE id = :id",
                Map.of("id", id), String.class);
    }

    private Object deletedAtOfTrainer(UUID id) {
        // `repo.save()` does not flush, and this class is @Transactional, so a
        // raw read can precede the UPDATE that the assertion is about.
        em.flush();
        return jdbc.queryForObject("SELECT deleted_at FROM trainer WHERE id = :id",
                Map.of("id", id), Object.class);
    }

    private String roleOfUser(String phone) {
        em.flush();
        return jdbc.queryForObject(
                "SELECT role FROM app_user WHERE phone = :p AND deleted_at IS NULL",
                Map.of("p", phone), String.class);
    }

    private boolean userExists(String phone) {
        em.flush();
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM app_user WHERE phone = :p AND deleted_at IS NULL)",
                Map.of("p", phone), Boolean.class));
    }

    private boolean anyUserRowFor(String phone) {
        em.flush();
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM app_user WHERE phone = :p)",
                Map.of("p", phone), Boolean.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }

    /**
     * The code, as it was sent.
     *
     * <p>A sender rather than a mocked {@code OtpService}, so these tests run
     * through the real bcrypt hash, the real store and the real expiry. The
     * claim this feature makes is that it reuses sign-in's OTP machinery
     * unchanged, and a mock would be a test of the claim's paraphrase.
     */
    @TestConfiguration
    static class CapturingSender implements OtpSender {

        final Map<String, String> sent = new HashMap<>();

        @Bean
        @Primary
        OtpSender capturingOtpSender() {
            return this;
        }

        @Override
        public void send(String phone, String code) {
            sent.put(phone, code);
        }

        String codeFor(String phone) {
            String code = sent.get(phone);
            if (code == null) throw new AssertionError("no code was sent to " + phone);
            return code;
        }
    }
}
