package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.payment.GymArrangementService;
import com.inclineyou.inclineyou_backend.core.payment.GymMoneyService;
import com.inclineyou.inclineyou_backend.core.payment.TrainerPayoutService;
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

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V8 · the gym directory. A trainer picks a gym from the place search; the directory
 * row is shared, the profile snapshots the name, and settlement keys on the place so a
 * rename cannot split one gym's money. The walls around the directory itself are in
 * {@link GymPlaceWallTest}, which needs committed rows and a second login.
 */
@SpringBootTest
@Transactional
class GymPlaceTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired GymArrangementService arrangements;
    @Autowired TrainerPayoutService payouts;
    @Autowired GymMoneyService money;

    private MockMvc mvc;
    private UUID me;
    private final YearMonth now = YearMonth.now(java.time.ZoneId.of("Asia/Kolkata"));

    private static final String CULT = """
            {"gymPlace":{"placeId":"ChIJ-test-cult","name":"Cult Indiranagar","address":"100 Feet Rd","city":"Bengaluru",
                         "lat":12.978,"lng":77.640,"mapLink":"https://maps.app.goo.gl/x"},"trainingModes":["gym_floor"]}""";

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100000351");
        signedIn(me);
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("picking a gym links the profile, snapshots the name, and reads back as gymPlace")
    void pick() throws Exception {
        patchMe(CULT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").value("Cult Indiranagar"))
                .andExpect(jsonPath("$.gymPlace.placeId").value("ChIJ-test-cult"))
                .andExpect(jsonPath("$.gymPlace.city").value("Bengaluru"))
                .andExpect(jsonPath("$.gymPlace.id").exists());
        mvc.perform(get("/v1/trainers/me")).andExpect(jsonPath("$.gymPlace.name").value("Cult Indiranagar"));
    }

    @Test
    @DisplayName("the directory row is idempotent on placeId and shared between trainers; blanks fill, nothing overwrites")
    void shared() throws Exception {
        patchMe(CULT).andExpect(status().isOk());
        UUID other = trainer("+919100000352");
        signedIn(other);
        patchMe("""
                {"gymPlace":{"placeId":"ChIJ-test-cult","name":"Cult Indiranagar (renamed by someone else)","city":"Elsewhere"},
                 "trainingModes":["gym_floor"]}""").andExpect(status().isOk())
                .andExpect(jsonPath("$.gymPlace.city").value("Bengaluru"));   // first writer's city stands

        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM gym_place WHERE place_id = 'ChIJ-test-cult'", Map.of(), Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(DISTINCT gym_place_id) FROM trainer_business WHERE gym_place_id IS NOT NULL AND trainer_id IN (:a, :b)",
                Map.of("a", me, "b", other), Integer.class));
        // The owner-only view counts both, and names nobody.
        var row = jdbc.queryForMap("SELECT trainers, active_clients FROM gym_place_stats WHERE place_id = 'ChIJ-test-cult'", Map.of());
        assertEquals(2L, ((Number) row.get("trainers")).longValue());
        assertEquals(0L, ((Number) row.get("active_clients")).longValue());
    }

    @Test
    @DisplayName("stats count active clients behind a gym, not archived or prospect ones")
    void statsClients() throws Exception {
        patchMe(CULT).andExpect(status().isOk());
        for (String status : new String[]{"active", "paused", "archived", "prospect"}) {
            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, client_type, status, paused_at, archived_at, archive_reason)
                    VALUES (gen_random_uuid(), :t::uuid, :n, 'independent', :s,
                            CASE WHEN :s = 'paused' THEN now() END, CASE WHEN :s = 'archived' THEN now() END, CASE WHEN :s = 'archived' THEN 'other' END)""",
                    Map.of("t", me.toString(), "n", "C-" + status, "s", status));
        }
        assertEquals(2L, jdbc.queryForObject("SELECT active_clients FROM gym_place_stats WHERE place_id = 'ChIJ-test-cult'", Map.of(), Long.class));
    }

    @Test
    @DisplayName("null clears the place and the name; gymName alone unlinks; both at once is refused")
    void clearAndUnlink() throws Exception {
        patchMe(CULT).andExpect(status().isOk());

        patchMe("{\"gymName\":\"My own gym\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").value("My own gym"))
                .andExpect(jsonPath("$.gymPlace").doesNotExist());

        patchMe(CULT).andExpect(status().isOk());
        patchMe("{\"gymPlace\":null}").andExpect(status().isOk())
                .andExpect(jsonPath("$.gymName").doesNotExist())
                .andExpect(jsonPath("$.gymPlace").doesNotExist());

        patchMe("{\"gymName\":\"X\",\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\"},\"trainingModes\":[\"gym_floor\"]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    @DisplayName("a place needs gym_floor among the modes: 400 GYM_NEEDS_FLOOR")
    void needsFloor() throws Exception {
        patchMe("{\"gymPlace\":{\"placeId\":\"ChIJ-test-p1\",\"name\":\"Iron\"}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GYM_NEEDS_FLOOR"));
    }

    @Test
    @DisplayName("what the directory cannot hold is refused with a sentence")
    void validation() throws Exception {
        String modes = ",\"trainingModes\":[\"gym_floor\"]";
        for (String bad : new String[]{
                "{\"gymPlace\":{\"name\":\"X\"}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\"}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"not a place id!\",\"name\":\"X\"}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"" + "x".repeat(121) + "\"}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\",\"lat\":91,\"lng\":10}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\",\"lat\":10,\"lng\":181}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\",\"lat\":10}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\",\"mapLink\":\"javascript:alert(1)\"}" + modes + "}",
                "{\"gymPlace\":{\"placeId\":\"ChIJ-test-p\",\"name\":\"X\",\"surprise\":1}" + modes + "}"}) {
            patchMe(bad).andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("settlement keys on the place: a rename cannot split the gym, and earlier name-only rows join it")
    void settlementByPlace() throws Exception {
        // Free-text gym first, with terms and a payout under the typed name.
        patchMe("{\"gymName\":\"Cult\",\"trainingModes\":[\"gym_floor\"]}").andExpect(status().isOk());
        arrangements.create(me, body("baseKind", "minimum", "baseAmount", "10000.00", "startsMonth", now.minusMonths(1).toString()));
        payouts.create(me, body("amount", "4000.00", "method", "upi"));
        assertNull(arrangements.list(me).get(0).gymPlaceId());

        // Then they pick the place from the search. The unlinked rows were this gym: they join it.
        patchMe(CULT).andExpect(status().isOk());
        var linked = arrangements.list(me).get(0);
        assertNotNull(linked.gymPlaceId());
        assertEquals(1, payouts.list(me, null, null, null, null, null).items().size());
        assertEquals(linked.gymPlaceId(), payouts.list(me, null, null, null, null, null).items().get(0).gymPlaceId());

        // A new payout copies the place, and the same place under another display name is still one gym.
        payouts.create(me, body("amount", "1000.00", "method", "cash"));
        patchMe("""
                {"gymPlace":{"placeId":"ChIJ-test-cult","name":"Cult Fit Indiranagar"},"trainingModes":["gym_floor"]}""")
                .andExpect(status().isOk());
        assertEquals(2, payouts.list(me, null, null, null, null, null).items().size());
        var st = money.get(me, now.minusMonths(1).toString(), now.toString()).settlement();
        assertEquals(2, st.recentPayouts().size());          // both payouts sit under the one gym
        assertEquals("5000.00", st.months().get(0).received());   // and both were poured into its oldest month
        assertEquals("5000.00", st.months().get(0).balance());
    }

    /* ------------------------------------------------------------ fixtures */

    private ResultActions patchMe(String body) throws Exception {
        return mvc.perform(patch("/v1/trainers/me").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static Map<String, Object> body(Object... kv) {
        var m = new LinkedHashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("phone", phone));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :phone) ON CONFLICT (app_user_id) DO NOTHING",
                Map.of("a", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUserId), String.class));
    }

    /** The request filter labels the connection with the trainer; a @Transactional test's one connection is labelled by hand. */
    private void signedIn(UUID trainerId) {
        jdbc.queryForObject("SELECT set_config('app.trainer_id', :t, true)", Map.of("t", trainerId.toString()), String.class);
        signedInAs(trainerId);
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}
