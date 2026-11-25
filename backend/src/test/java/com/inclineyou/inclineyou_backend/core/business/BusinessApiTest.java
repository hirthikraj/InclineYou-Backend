package com.inclineyou.inclineyou_backend.core.business;

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

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** api-contract 1.2, bz-a1…bz-a3 (V46): one business per workspace, its name the workspace's, the owner alone edits it. */
@SpringBootTest
@Transactional
class BusinessApiTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID me, tenant;

    @BeforeEach
    void setUp() {
        me = trainer("+919100006601", "Arun Prakash");
        tenant = tenantOf(me);
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        as(me, tenant);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("bz-a1: every workspace has a business from birth; its name is the workspace's (a solo one is the trainer's), the owner may edit")
    void read() throws Exception {
        mvc.perform(get("/v1/business")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Arun Prakash")).andExpect(jsonPath("$.type").value("solo"))
                .andExpect(jsonPath("$.canEdit").value(true)).andExpect(jsonPath("$.upiVpa").doesNotExist())
                .andExpect(jsonPath("$.address.state").doesNotExist());
        mvc.perform(get("/v1/business/states")).andExpect(jsonPath("$.length()").value(36));
    }

    @Test
    @DisplayName("bz-a2: saving renames the workspace and stores the rest; ten digits are read as +91; blank clears")
    void save() throws Exception {
        save("""
                {"name":"Flex Fitness","tagline":"Strength for busy people","phone":"98410 22119","email":"hello@flex.in",
                 "address":{"line1":"12, 3rd Cross","line2":null,"city":"Chennai","state":"Tamil Nadu","pincode":"600041"},
                 "upiVpa":"flexfit@okaxis"}""")
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Flex Fitness"))
                .andExpect(jsonPath("$.phone").value("+919841022119")).andExpect(jsonPath("$.address.city").value("Chennai"))
                .andExpect(jsonPath("$.upiVpa").value("flexfit@okaxis"));
        assertEquals("Flex Fitness", jdbc.queryForObject("SELECT name FROM tenant WHERE id = :t::uuid", Map.of("t", tenant.toString()), String.class));
        // Renamed by its owner, the workspace stops following the trainer's name (V1's follow_solo_tenant_name).
        jdbc.update("UPDATE trainer SET name = 'Arun P' WHERE id = :t::uuid", Map.of("t", me.toString()));
        assertEquals("Flex Fitness", jdbc.queryForObject("SELECT name FROM tenant WHERE id = :t::uuid", Map.of("t", tenant.toString()), String.class));

        save("{\"name\":\"Flex Fitness\",\"tagline\":\"  \",\"upiVpa\":\"\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.tagline").doesNotExist()).andExpect(jsonPath("$.upiVpa").doesNotExist())
                .andExpect(jsonPath("$.address.city").doesNotExist());
    }

    @Test
    @DisplayName("bz-a2 refusals: a blank name, a bad state, PIN, phone, email or UPI ID are 400 and change nothing")
    void refusals() throws Exception {
        save("{\"name\":\" \"}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"address\":{\"state\":\"Tamilnadu\"}}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"address\":{\"pincode\":\"060004\"}}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"phone\":\"12345\"}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"email\":\"nope\"}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"upiVpa\":\"not a upi\"}").andExpect(status().isBadRequest());
        save("{\"name\":\"X\",\"tagline\":\"" + "a".repeat(121) + "\"}").andExpect(status().isBadRequest());
        assertEquals("Arun Prakash", jdbc.queryForObject("SELECT name FROM tenant WHERE id = :t::uuid", Map.of("t", tenant.toString()), String.class));
    }

    @Test
    @DisplayName("bz-a2: somebody who does not own the workspace reads it and may not change it (403 BUSINESS_OWNER_ONLY)")
    void ownerOnly() throws Exception {
        UUID coach = trainer("+919100006602", "Coach Two");
        as(coach, tenant);
        mvc.perform(get("/v1/business")).andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(false));
        save("{\"name\":\"Taken over\"}").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("BUSINESS_OWNER_ONLY"));
    }

    @Test
    @DisplayName("V46: PATCH /v1/trainers/me upiVpa writes through to the home workspace's business and reads back from it; the portal's pay-to reads the client's workspace")
    void upiMoved() throws Exception {
        mvc.perform(patch("/v1/trainers/me").contentType(MediaType.APPLICATION_JSON).content("{\"upiVpa\":\"arun@okicici\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.upiVpa").value("arun@okicici"));
        mvc.perform(get("/v1/business")).andExpect(jsonPath("$.upiVpa").value("arun@okicici"));
        mvc.perform(patch("/v1/trainers/me").contentType(MediaType.APPLICATION_JSON).content("{\"upiVpa\":\"bad upi\"}"))
                .andExpect(status().isBadRequest());

        // The client's Pay with UPI: client_pay_to() reads the business of the client's workspace.
        UUID client = UUID.randomUUID();
        jdbc.update("INSERT INTO client (id, trainer_id, tenant_id, name, phone, client_type) VALUES (:id::uuid, :t::uuid, :ten::uuid, 'Priya', '+919841066611', 'independent')",
                Map.of("id", client.toString(), "t", me.toString(), "ten", tenant.toString()));
        jdbc.queryForObject("SELECT set_config('app.actor', 'client', true)", Map.of(), String.class);
        jdbc.queryForObject("SELECT set_config('app.client_ids', :ids, true)", Map.of("ids", "{" + client + "}"), String.class);
        String payTo = jdbc.queryForObject("SELECT client_pay_to(:c::uuid)", Map.of("c", client.toString()), String.class);
        // Null when the trainer keeps money off the portal; when it is on, it is the business's ID.
        Boolean money = jdbc.queryForObject("SELECT client_can_see_money(:c::uuid)", Map.of("c", client.toString()), Boolean.class);
        if (Boolean.TRUE.equals(money)) assertEquals("arun@okicici", payTo);
        else assertNull(payTo);
    }

    private ResultActions save(String json) throws Exception {
        return mvc.perform(put("/v1/business").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void as(UUID trainerId, UUID tenantId) {
        var auth = new UsernamePasswordAuthenticationToken(trainerId.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        SecurityContextHolder.getContext().setAuthentication(auth);
        CurrentScope.set(new TenantScope.Scope(null, trainerId, tenantId, List.of(), false));
        mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(auth)).build();
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
}
