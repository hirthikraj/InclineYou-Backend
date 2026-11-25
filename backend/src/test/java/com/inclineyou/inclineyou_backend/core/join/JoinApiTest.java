package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.auth.otp.OtpSender;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * api-contract 1.2, jl-a1…jl-a5 and jn-a1…jn-a3: the join link (V45). The public half runs through the REAL security chain,
 * because the point is that it is open to somebody with no session — and that all it can make is a request, never an account.
 */
@SpringBootTest(properties = {"app.otp.resend-ladder-seconds=0", "app.join.purge-enabled=false"})
@org.springframework.context.annotation.Import(JoinApiTest.CapturingSender.class)
@Transactional
class JoinApiTest {

    private static final String JOINER = "+919841055501";

    @Autowired WebApplicationContext context;
    @Autowired FilterChainProxy securityChain;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CapturingSender sender;

    private MockMvc trainerMvc;
    private MockMvc publicMvc;
    private UsernamePasswordAuthenticationToken auth;
    private UUID me, tenant, pack;
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        me = trainer("+919100005501", "Arun Prakash");
        sender.sent.clear();
        auth = new UsernamePasswordAuthenticationToken(me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        trainerMvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
        publicMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        tenant = tenantOf(me);
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", me.toString()), String.class);
        asTrainer();
        pack = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, tenant_id, name, service, basis, sessions, amount, currency)
                VALUES (:id::uuid, :t::uuid, :ten::uuid, '12 sessions', 'floor', 'sessions', 12, 6000, 'INR')
                """, Map.of("id", pack.toString(), "t", me.toString(), "ten", tenant.toString()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("jl-a1/a2: the link is the business name, numbered when taken, made on the first save and never changed — not by the request, not by a rename")
    void settings() throws Exception {
        UUID other = trainer("+919100005502", "Someone Else");
        jdbc.update("INSERT INTO join_link (trainer_id, tenant_id, slug) VALUES (:t::uuid, :ten::uuid, 'arun-prakash')",
                Map.of("t", other.toString(), "ten", tenantOf(other).toString()));
        as(get("/v1/join-link")).andExpect(status().isOk())
                .andExpect(jsonPath("$.exists").value(false)).andExpect(jsonPath("$.slug").value("arun-prakash-2"))
                .andExpect(jsonPath("$.takingJoins").value(false));
        // The request's slug is ignored: the link is the business's, not the trainer's to type.
        save("anything-i-like", true, "[{\"text\":\"What's your goal?\",\"kind\":\"choice\",\"options\":[{\"text\":\"Strength\"},{\"text\":\"Fat loss\"}],\"required\":true}]")
                .andExpect(status().isOk()).andExpect(jsonPath("$.exists").value(true))
                .andExpect(jsonPath("$.slug").value("arun-prakash-2"))
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.endsWith("/join/arun-prakash-2")))
                .andExpect(jsonPath("$.questions[0].id").isString()).andExpect(jsonPath("$.packIds[0]").value(pack.toString()));
        // Renaming the business does not move a link that may already be printed on a wall.
        jdbc.update("UPDATE tenant SET name = 'Flex Fitness' WHERE id = :t::uuid", Map.of("t", tenant.toString()));
        save("flex-fitness", true, "[]").andExpect(status().isOk()).andExpect(jsonPath("$.slug").value("arun-prakash-2"));
        as(put("/v1/join-link").contentType(MediaType.APPLICATION_JSON).content(
                        "{\"takingJoins\":true,\"allowNoPlan\":false,\"packIds\":[]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("jn-a1: off, unknown and malformed links are one answer, closed; an open one shows the card, the plans and the questions")
    void card() throws Exception {
        publicMvc.perform(get("/v1/join/nobody-here")).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("closed"))
                .andExpect(jsonPath("$.trainer").doesNotExist());
        save("arun-fit", false, "[]").andExpect(status().isOk());
        publicMvc.perform(get("/v1/join/arun-prakash")).andExpect(jsonPath("$.state").value("closed"));
        publicMvc.perform(get("/v1/join/x_")).andExpect(jsonPath("$.state").value("closed"));
        save("arun-fit", true, "[{\"text\":\"Where do you live?\",\"kind\":\"text\"}]").andExpect(status().isOk());
        publicMvc.perform(get("/v1/join/ARUN-PRAKASH")).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("open")).andExpect(jsonPath("$.trainer.name").value("Arun Prakash"))
                .andExpect(jsonPath("$.plans[0].name").value("12 sessions")).andExpect(jsonPath("$.plans[0].amount").value("6000.00"))
                .andExpect(jsonPath("$.questions[0].text").value("Where do you live?"))
                .andExpect(jsonPath("$.allowNoPlan").value(true)).andExpect(jsonPath("$.policyVersion").value("2026-09"));
    }

    @Test
    @DisplayName("jn-a2/a3: the code proves the number, then a request is made — and nothing else: no login, no client. Asking again replaces it")
    void ask() throws Exception {
        String q = open();
        String rc = code(JOINER, dob(30));
        submit(rc, JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.result").value("received"))
                .andExpect(jsonPath("$.trainerName").value("Arun Prakash"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM app_user WHERE phone = :p", Map.of("p", JOINER), Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM client WHERE phone = :p", Map.of("p", JOINER), Integer.class));

        String rc2 = code(JOINER, dob(30));
        submit(rc2, JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Fat loss\"}]")
                .andExpect(status().isOk()).andExpect(jsonPath("$.result").value("updated"));

        as(get("/v1/join-requests")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.counts.pending").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Meera Iyer")).andExpect(jsonPath("$.items[0].phone").value(JOINER))
                .andExpect(jsonPath("$.items[0].plan.name").value("12 sessions"))
                .andExpect(jsonPath("$.items[0].answers[0].answer").value("Fat loss"));
    }

    @Test
    @DisplayName("jn-a2/a3 refusals: under 18 before any code; a required answer, a choice off the list, no tick; another number's code is 404")
    void refusals() throws Exception {
        String q = open();
        publicMvc.perform(post("/v1/join/arun-prakash/code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + JOINER + "\",\"dateOfBirth\":\"" + dob(16) + "\",\"policyVersion\":\"2026-09\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("AGE_REQUIREMENT"));
        assertTrue(sender.sent.isEmpty(), "no code is spent on a refusal");
        String rc = code(JOINER, dob(30));
        submit(rc, JOINER, dob(30), "\"answers\":[]").andExpect(status().isBadRequest());
        submit(rc, JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Yoga\"}]").andExpect(status().isBadRequest());
        String[] p = rc.split("\\|");
        publicMvc.perform(post("/v1/join/arun-prakash/requests").contentType(MediaType.APPLICATION_JSON).content(
                        "{\"requestId\":\"" + p[0] + "\",\"otp\":\"" + p[1] + "\",\"phone\":\"" + JOINER + "\",\"name\":\"Meera\",\"dateOfBirth\":\""
                                + dob(30) + "\",\"policyVersion\":\"2026-09\",\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TRAINING_TERMS_REQUIRED"));
        // A code sent to one number never proves another.
        submit(rc, "+919841055502", dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]")
                .andExpect(status().isNotFound());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM join_request WHERE trainer_id = :t::uuid", Map.of("t", me.toString()), Integer.class));
    }

    @Test
    @DisplayName("jl-a4: approving makes an accepted prospect — login, prefs, the tick, the answers as a private note, the welcome message — scrubs the request, and is idempotent")
    void approve() throws Exception {
        String q = open();
        submit(code(JOINER, dob(30)), JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}],\"email\":\"meera@example.com\",\"whatsappReminders\":true")
                .andExpect(status().isCreated());
        String id = requestId();
        String body = as(post("/v1/join-requests/" + id + "/approve")).andExpect(status().isOk())
                .andExpect(jsonPath("$.packId").value(pack.toString())).andExpect(jsonPath("$.checkInSent").value(false))
                .andReturn().getResponse().getContentAsString();
        String clientId = JsonPath.read(body, "$.clientId");

        var c = jdbc.queryForMap("""
                SELECT status, membership_status, client_type, date_of_birth::text AS dob, accepted_policy_version AS pv,
                       training_terms_accepted_at IS NOT NULL AS terms, gender, trainer_id::text AS t
                  FROM client WHERE id = :c::uuid""", Map.of("c", clientId));
        assertEquals("prospect", c.get("status"));
        assertEquals("accepted", c.get("membership_status"));
        assertEquals("independent", c.get("client_type"));
        assertEquals(dob(30), c.get("dob"));
        assertEquals("2026-09", c.get("pv"));
        assertEquals(true, c.get("terms"));
        assertEquals("female", c.get("gender"));
        assertEquals(me.toString(), c.get("t"));
        assertEquals("client", jdbc.queryForObject("SELECT role FROM app_user WHERE phone = :p", Map.of("p", JOINER), String.class));
        assertNotNull(jdbc.queryForObject("SELECT whatsapp_opt_in_at FROM client_prefs WHERE client_id = :c::uuid", Map.of("c", clientId), java.sql.Timestamp.class),
                "their own reminder opt-in rides through");
        String note = jdbc.queryForObject("SELECT body FROM client_note WHERE client_id = :c::uuid AND NOT shared_with_client", Map.of("c", clientId), String.class);
        assertTrue(note.contains("meera@example.com") && note.contains("What's your goal?") && note.contains("Strength"), note);
        assertEquals("Welcome! Fill in your intake.", jdbc.queryForObject("SELECT body FROM client_message WHERE client_id = :c::uuid", Map.of("c", clientId), String.class));

        var r = jdbc.queryForMap("SELECT status, name, phone, date_of_birth, answers::text AS a, client_id::text AS c FROM join_request WHERE id = :id::uuid", Map.of("id", id));
        assertEquals("approved", r.get("status"));
        assertNull(r.get("name"));
        assertNull(r.get("phone"));
        assertNull(r.get("date_of_birth"));
        assertEquals("[]", r.get("a"));
        assertEquals(clientId, r.get("c"));

        as(post("/v1/join-requests/" + id + "/approve")).andExpect(status().isOk())
                .andExpect(jsonPath("$.clientId").value(clientId));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM client WHERE phone = :p", Map.of("p", JOINER), Integer.class));
        as(post("/v1/join-requests/" + id + "/decline")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOIN_REQUEST_DECIDED"));
        // Now on the list, the same number asking again is told to sign in.
        submit(code(JOINER, dob(30)), JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOIN_ALREADY_CLIENT"));
    }

    @Test
    @DisplayName("jl-a5: declining keeps the request for the list and is idempotent; a declined request cannot then be approved; a trainer's number cannot join")
    void decline() throws Exception {
        String q = open();
        submit(code(JOINER, dob(30)), JOINER, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]").andExpect(status().isCreated());
        String id = requestId();
        as(post("/v1/join-requests/" + id + "/decline")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("declined"));
        as(post("/v1/join-requests/" + id + "/decline")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("declined"));
        as(post("/v1/join-requests/" + id + "/approve")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOIN_REQUEST_DECIDED"));
        as(get("/v1/join-requests?state=declined")).andExpect(jsonPath("$.items[0].name").value("Meera Iyer"))
                .andExpect(jsonPath("$.counts.declined").value(1));
        as(post("/v1/join-requests/" + UUID.randomUUID() + "/approve")).andExpect(status().isNotFound());

        trainer("+919100005503", "Another Trainer");
        submit(code("+919100005503", dob(30)), "+919100005503", dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOIN_NUMBER_UNAVAILABLE"));
    }

    @Test
    @DisplayName("22 Nov: the assessment's four kinds — yes/no, a rating, several choices with an Other line — are checked and read out for the trainer; a question saved in the old shape still reads")
    void kinds() throws Exception {
        String body = save("arun-fit", true, "[" +
                "{\"id\":\"yn\",\"text\":\"Trained before?\",\"kind\":\"yesno\",\"required\":true}," +
                "{\"id\":\"rt\",\"text\":\"How fit do you feel?\",\"kind\":\"rating\",\"scale\":5}," +
                "{\"id\":\"ch\",\"text\":\"Goals\",\"kind\":\"choice\",\"allowMultiple\":true,\"allowCustom\":true," +
                "\"options\":[{\"id\":\"s\",\"text\":\"Strength\"},{\"id\":\"m\",\"text\":\"Mobility\"}]}]")
                .andExpect(status().isOk()).andExpect(jsonPath("$.questions[1].scale").value(5))
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("\"allowMultiple\":true"));
        // Out of range, and a second pick where one is allowed, are refused.
        save("arun-fit", true, "[{\"text\":\"X\",\"kind\":\"rating\",\"scale\":7}]").andExpect(status().isBadRequest());
        submit(code(JOINER, dob(30)), JOINER, dob(30),
                "\"answers\":[{\"questionId\":\"yn\",\"yes\":true},{\"questionId\":\"rt\",\"rating\":6}]").andExpect(status().isBadRequest());
        submit(code(JOINER, dob(30)), JOINER, dob(30),
                "\"answers\":[{\"questionId\":\"rt\",\"rating\":4}]").andExpect(status().isBadRequest());
        submit(code(JOINER, dob(30)), JOINER, dob(30),
                "\"answers\":[{\"questionId\":\"yn\",\"yes\":false},{\"questionId\":\"rt\",\"rating\":4}," +
                "{\"questionId\":\"ch\",\"optionIds\":[\"s\",\"m\"],\"text\":\"yoga\"}]")
                .andExpect(status().isCreated());
        as(get("/v1/join-requests")).andExpect(jsonPath("$.items[0].answers[0].answer").value("No"))
                .andExpect(jsonPath("$.items[0].answers[1].answer").value("4 out of 5"))
                .andExpect(jsonPath("$.items[0].answers[2].answer").value("Strength, Mobility; Other: yoga"));

        // A question saved before 22 Nov ({label, options: [string]}) is read in today's shape.
        jdbc.update("""
                UPDATE join_link SET questions = '[{"id":"old","label":"Goal?","kind":"choice","options":["A","B"],"required":false}]'::jsonb
                 WHERE trainer_id = :t::uuid""", Map.of("t", me.toString()));
        publicMvc.perform(get("/v1/join/arun-prakash")).andExpect(jsonPath("$.questions[0].text").value("Goal?"))
                .andExpect(jsonPath("$.questions[0].options[1].text").value("B"))
                .andExpect(jsonPath("$.questions[0].options[1].id").value("old_o1"));
    }

    @Test
    @DisplayName("23 Nov: the phone check names a waiting request, and adding that number by hand closes it")
    void handAddClosesRequest() throws Exception {
        String q = open();
        final String HAND = "+919841055521";
        submit(code(HAND, dob(30)), HAND, dob(30), "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]")
                .andExpect(status().isCreated());
        String id = requestId();
        as(post("/v1/clients/phone-check").contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"" + HAND + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.joinRequestId").value(id)).andExpect(jsonPath("$.joinRequestName").value("Meera Iyer"));
        as(post("/v1/clients").contentType(MediaType.APPLICATION_JSON).content(
                        "{\"name\":\"Meera Iyer\",\"phone\":\"" + HAND + "\",\"clientType\":\"independent\",\"dateOfBirth\":\"" + dob(30)
                                + "\",\"gender\":\"female\"}"))
                .andExpect(status().isCreated());
        assertEquals("declined", jdbc.queryForObject("SELECT status FROM join_request WHERE id = :id::uuid", Map.of("id", id), String.class));
        as(post("/v1/clients/phone-check").contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"+919841055509\"}"))
                .andExpect(jsonPath("$.available").value(true)).andExpect(jsonPath("$.joinRequestId").doesNotExist());
    }

    @Test
    @DisplayName("23 Nov (V49): somebody the trainer already added is told to open their invite, or to ask for one — not to sign in")
    void addedButNotMember() throws Exception {
        String q = open();
        final String ADDED = "+919841055522";
        UUID client = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, tenant_id, trainer_id, name, phone, client_type, status)
                VALUES (:id::uuid, :ten::uuid, :t::uuid, 'Meera Iyer', :p, 'independent', 'prospect')
                """, Map.of("id", client.toString(), "ten", tenant.toString(), "t", me.toString(), "p", ADDED));
        String answer = "\"answers\":[{\"questionId\":\"" + q + "\",\"answer\":\"Strength\"}]";
        submit(code(ADDED, dob(30)), ADDED, dob(30), answer)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOIN_ASK_FOR_INVITE"));

        jdbc.update("UPDATE client SET membership_status = 'invited', invited_at = now() WHERE id = :id::uuid", Map.of("id", client.toString()));
        jdbc.update("""
                INSERT INTO client_invite (tenant_id, trainer_id, client_id, phone, token_hash)
                VALUES (:ten::uuid, :t::uuid, :c::uuid, :p, repeat('a', 64))
                """, Map.of("ten", tenant.toString(), "t", me.toString(), "c", client.toString(), "p", ADDED));
        submit(code(ADDED, dob(30)), ADDED, dob(30), answer)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOIN_INVITE_WAITING"));

        // A lapsed link is the same as none: they have to ask for a new one.
        jdbc.update("UPDATE client_invite SET created_at = now() - interval '20 days', expires_at = now() - interval '1 day' WHERE client_id = :c::uuid",
                Map.of("c", client.toString()));
        submit(code(ADDED, dob(30)), ADDED, dob(30), answer)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("JOIN_ASK_FOR_INVITE"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM join_request WHERE trainer_id = :t::uuid", Map.of("t", me.toString()), Integer.class));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** The public chain clears the thread's security context and scope after each call, so the trainer's are put back first. */
    private ResultActions as(org.springframework.test.web.servlet.RequestBuilder request) throws Exception {
        asTrainer();
        return trainerMvc.perform(request);
    }

    private void asTrainer() {
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
    }

    /** Opens the link with one required choice question and the pack; answers the question's id. */
    private String open() throws Exception {
        String body = save("arun-fit", true, "[{\"text\":\"What's your goal?\",\"kind\":\"choice\",\"options\":[{\"text\":\"Strength\"},{\"text\":\"Fat loss\"}],\"required\":true}]")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questions[0].id");
    }

    private ResultActions save(String slug, boolean on, String questions) throws Exception {
        return as(put("/v1/join-link").contentType(MediaType.APPLICATION_JSON).content(
                "{\"slug\":\"" + slug + "\",\"takingJoins\":" + on + ",\"welcomeLine\":\"Train with me\",\"questions\":" + questions
                        + ",\"packIds\":[\"" + pack + "\"],\"allowNoPlan\":true,\"welcomeMessage\":\"Welcome! Fill in your intake.\"}"));
    }

    /** Sends a code to {@code phone} and returns {@code requestId|code}. */
    private String code(String phone, String dob) throws Exception {
        String req = JsonPath.read(publicMvc.perform(post("/v1/join/arun-prakash/code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"dateOfBirth\":\"" + dob + "\",\"policyVersion\":\"2026-09\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.requestId");
        return req + "|" + sender.codeFor(phone);
    }

    private ResultActions submit(String requestAndCode, String phone, String dob, String extra) throws Exception {
        String[] rc = requestAndCode.split("\\|");
        return publicMvc.perform(post("/v1/join/arun-prakash/requests").contentType(MediaType.APPLICATION_JSON).content(
                "{\"requestId\":\"" + rc[0] + "\",\"otp\":\"" + rc[1] + "\",\"phone\":\"" + phone + "\",\"name\":\"Meera Iyer\","
                        + "\"dateOfBirth\":\"" + dob + "\",\"gender\":\"female\",\"packId\":\"" + pack + "\",\"policyVersion\":\"2026-09\","
                        + "\"trainingTerms\":true," + extra + "}"));
    }

    private String requestId() {
        return jdbc.queryForObject("SELECT id::text FROM join_request WHERE trainer_id = :t::uuid ORDER BY created_at DESC LIMIT 1",
                Map.of("t", me.toString()), String.class);
    }

    private String dob(int years) {
        return today.minusYears(years).minusDays(40).toString();
    }

    private UUID tenantOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid", Map.of("id", trainerId.toString()), String.class));
    }

    private UUID trainer(String phone, String name) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :n) ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUserId, "n", name));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }

    /** The WhatsApp seam, captured: the last code sent to each number. */
    @TestConfiguration
    static class CapturingSender implements OtpSender {
        final Map<String, String> sent = new ConcurrentHashMap<>();

        @Bean
        @Primary
        CapturingSender joinCapturingOtpSender() {
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
