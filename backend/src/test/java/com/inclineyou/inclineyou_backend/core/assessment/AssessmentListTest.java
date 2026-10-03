package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /v1/assessments} — the list Today (L10) and the Assessments screen read: a DERIVED state (done once
 * completed, booked while due today or later, missed once past due, on the workspace's calendar), the filters, one fixed
 * order (due date descending, then id) walked by keyset, and the optional totals.
 */
@SpringBootTest
@Transactional
class AssessmentListTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate TODAY = LocalDate.now(IST);

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, other, meera, rajesh, template;
    private UUID missed, booked, done, rajeshs;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        me = trainer("+919100001401");
        other = trainer("+919100001402");
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", me.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, me, tenant, List.of(), false));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                me.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        meera = client(me, "Meera Iyer");
        rajesh = client(me, "Rajesh Kumar");
        template = template(me);
        missed = assessment(me, meera, "Monthly check", TODAY.minusDays(5), false, "{}");
        booked = assessment(me, meera, "Strength review", TODAY.plusDays(3), false, "{}");
        done = assessment(me, meera, "Baseline", TODAY.minusDays(30), true, "{\"weight\":80}");
        rajeshs = assessment(me, rajesh, "Monthly check", TODAY, false, "{}");
        // Somebody else's, never shown.
        assessment(other, client(other, "Theirs"), "Monthly check", TODAY, false, "{}");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("rows carry the derived state, the counts of readings and answers, and come newest-due first")
    void shapeAndOrder() throws Exception {
        mvc.perform(get("/v1/assessments")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[0].id").value(booked.toString()))
                .andExpect(jsonPath("$.items[0].state").value("booked"))
                .andExpect(jsonPath("$.items[1].id").value(rajeshs.toString()))
                .andExpect(jsonPath("$.items[1].state").value("booked"))          // due today is still booked
                .andExpect(jsonPath("$.items[2].id").value(missed.toString()))
                .andExpect(jsonPath("$.items[2].state").value("missed"))
                .andExpect(jsonPath("$.items[3].id").value(done.toString()))
                .andExpect(jsonPath("$.items[3].state").value("done"))
                .andExpect(jsonPath("$.items[3].completedAt").isNumber())
                .andExpect(jsonPath("$.items[3].measurements.got").value(1))
                .andExpect(jsonPath("$.items[3].measurements.asked").value(1))
                .andExpect(jsonPath("$.items[0].measurements.got").value(0))
                .andExpect(jsonPath("$.items[0].dueOn").value(TODAY.plusDays(3).toString()))
                .andExpect(jsonPath("$.total").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    @DisplayName("state, clientId, q and dueBy narrow; an unknown state, a bad client id and a bad date are 400s")
    void filters() throws Exception {
        mvc.perform(get("/v1/assessments").param("state", "missed")).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/assessments").param("state", "missed,done")).andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/v1/assessments").param("clientId", rajesh.toString())).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/v1/assessments").param("q", "monthly")).andExpect(jsonPath("$.items.length()").value(2));       // by assessment name
        mvc.perform(get("/v1/assessments").param("q", "rajesh")).andExpect(jsonPath("$.items.length()").value(1));        // by client name
        mvc.perform(get("/v1/assessments").param("dueBy", TODAY.toString())).andExpect(jsonPath("$.items.length()").value(3));
        mvc.perform(get("/v1/assessments").param("state", "later")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/assessments").param("clientId", "nope")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/assessments").param("dueBy", "tomorrow")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("keyset paging walks the list once; includeTotal adds the filtered total and the unfiltered grand total")
    void pagingAndTotals() throws Exception {
        var seen = new java.util.ArrayList<String>();
        String cursor = null;
        for (int i = 0; i < 6; i++) {
            var req = get("/v1/assessments").param("limit", "3");
            if (cursor != null) req = req.param("cursor", cursor);
            String json = mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            seen.addAll(com.jayway.jsonpath.JsonPath.read(json, "$.items[*].id"));
            cursor = com.jayway.jsonpath.JsonPath.read(json, "$.nextCursor");
            if (cursor == null) break;
        }
        assertEquals(List.of(booked, rajeshs, missed, done).stream().map(UUID::toString).toList(), seen);

        mvc.perform(get("/v1/assessments").param("state", "missed").param("includeTotal", "true"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.grandTotal").value(4));
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID assessment(UUID trainerId, UUID clientId, String name, LocalDate due, boolean completed, String readings) {
        UUID id = UUID.randomUUID();
        UUID tpl = trainerId.equals(me) ? template : template(trainerId);
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("t", trainerId.toString());
        p.put("c", clientId.toString());
        p.put("tpl", tpl.toString());
        p.put("n", name);
        p.put("due", java.sql.Date.valueOf(due));
        p.put("done", completed);
        p.put("r", readings);
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, template_id, name, form, due_on, completed_at, entered_by, readings)
                VALUES (:id::uuid, :c::uuid, :t::uuid, :tpl::uuid, :n,
                        '{"measurements":[{"key":"weight"}],"questions":[]}'::jsonb, :due,
                        CASE WHEN :done THEN now() END, CASE WHEN :done THEN 'trainer' END, CAST(:r AS jsonb))""", p);
        return id;
    }

    private UUID template(UUID trainerId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO assessment_template (id, trainer_id, name) VALUES (:id::uuid, :t::uuid, :n)",
                Map.of("id", id.toString(), "t", trainerId.toString(), "n", "Monthly " + id));
        return id;
    }

    private UUID client(UUID trainerId, String name) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, :name, 'independent')",
                Map.of("id", id.toString(), "tid", trainerId.toString(), "name", name));
        return id;
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) SELECT gen_random_uuid(), id, :p FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING", Map.of("p", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p", Map.of("p", phone), String.class));
    }
}
