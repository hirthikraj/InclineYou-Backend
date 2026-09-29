package com.inclineyou.inclineyou_backend.core.client;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The request records over HTTP: what used to be hand-parsed out of a Map is now
 * {@code @Valid} plus strict binding ({@code JacksonConfig}), and these pin the
 * contract the Map parsing kept — an unknown key is a 400, a float is not a
 * whole number, a PATCH tells an absent key from a null one, and every refusal
 * is {@code VALIDATION} with a {@code field: sentence} detail.
 */
@SpringBootTest
@Transactional
class ClientRequestBindingTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private MockMvc mvc;
    private UUID client;

    @BeforeEach
    void setUp() throws Exception {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        UUID trainer = trainer("+919100000031");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                trainer.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
        // No request filter runs here, so the workspace the clock reads is set by hand.
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        client = UUID.randomUUID();
        send(post("/v1/clients"), """
                {"id":"%s","name":"  Meera  ","clientType":"independent","schedule":{"sessionsPerWeek":3}}
                """.formatted(client))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Meera"))
                .andExpect(jsonPath("$.schedule.sessionsPerWeek").value(3));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        CurrentScope.clear();
    }

    @Test
    @DisplayName("an unknown key is refused by name, nested ones by their path")
    void unknownKeys() throws Exception {
        refused(post("/v1/clients"), "{\"name\":\"A\",\"clientType\":\"gym\",\"nmae\":\"A\"}",
                "nmae: not a field this route takes");
        refused(post("/v1/clients"), "{\"name\":\"A\",\"clientType\":\"gym\",\"schedule\":{\"days\":3}}",
                "schedule.days: not a field this route takes");
        refused(post("/v1/clients/" + client + "/resume"), "{\"now\":true}", "now: not a field this route takes");
    }

    @Test
    @DisplayName("types are not coerced: 5.5 is not a whole number, \"5\" is not a number")
    void strictTypes() throws Exception {
        refused(post("/v1/clients"), "{\"name\":\"A\",\"clientType\":\"gym\",\"schedule\":{\"sessionsPerWeek\":2.5}}",
                "schedule.sessionsPerWeek: not a valid value");
        refused(patch("/v1/clients/" + client), "{\"heightCm\":\"170\"}", "heightCm: not a valid value");
        refused(post("/v1/clients"), "{\"name\":5,\"clientType\":\"gym\"}", "name: not a valid value");
    }

    @Test
    @DisplayName("Bean Validation answers field: sentence, list items by index")
    void constraints() throws Exception {
        refused(post("/v1/clients"), "{\"clientType\":\"gym\"}", "name: required");
        refused(post("/v1/clients"), "{\"name\":\"A\",\"clientType\":\"personal\"}", "clientType: independent or gym, required");
        refused(post("/v1/clients"), "{\"name\":\"A\",\"clientType\":\"gym\",\"phone\":\"+91123\"}",
                "phone: " + ClientPhoneGuard.PHONE_MESSAGE);
        refused(put("/v1/clients/" + client + "/schedule").header("If-Match", "*"),
                "{\"slots\":[{\"start\":\"07:00\"}]}", "slots[0].weekday: required");
        refused(post("/v1/clients/" + client + "/archive"), "{\"reason\":\"bored\"}",
                "reason: goal_reached, moved_away, cost, no_time, switched_trainer or other");
        refused(post("/v1/clients/" + client + "/notes"), "{\"body\":\"x\",\"sharedWithClient\":true}",
                "sharedWithClient: notes shared with the client are not in v1");
        refused(post("/v1/clients"), "", "body: required");
    }

    @Test
    @DisplayName("a PATCH leaves an absent key alone and clears a null one")
    void patchPresence() throws Exception {
        send(patch("/v1/clients/" + client), "{\"goal\":\"  Run 10k  \",\"heightCm\":170}").andExpect(status().isOk());
        send(patch("/v1/clients/" + client), "{\"activityLevel\":\"light\"}").andExpect(status().isOk());
        detail().andExpect(jsonPath("$.goal").value("Run 10k"))
                .andExpect(jsonPath("$.heightCm").value(170))
                .andExpect(jsonPath("$.activityLevel").value("light"));

        send(patch("/v1/clients/" + client), "{\"goal\":null}").andExpect(status().isOk());
        detail().andExpect(jsonPath("$.goal").doesNotExist())
                .andExpect(jsonPath("$.heightCm").value(170));

        refused(patch("/v1/clients/" + client), "{\"name\":null}", "name: required");
        refused(patch("/v1/clients/" + client), "{\"status\":\"paused\"}", "status: use pause, resume, archive or unarchive");
        refused(patch("/v1/clients/" + client), "{}", "body: send at least one field");
    }

    @Test
    @DisplayName("a verb with an optional body works with none")
    void optionalBodies() throws Exception {
        mvc.perform(post("/v1/clients/" + client + "/pause")).andExpect(status().isOk())
                .andExpect(jsonPath("$.client.status").value("paused"));
        mvc.perform(post("/v1/clients/" + client + "/resume")).andExpect(status().isOk())
                .andExpect(jsonPath("$.client.status").value("active"));
    }

    /* ------------------------------------------------------------- fixtures */

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
                               String json) throws Exception {
        return mvc.perform(req.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void refused(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
                         String json, String detail) throws Exception {
        send(req, json).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.detail").value(detail));
    }

    private ResultActions detail() throws Exception {
        return mvc.perform(get("/v1/clients/" + client)).andExpect(status().isOk());
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')",
                Map.of("phone", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, :phone FROM app_user WHERE phone = :phone
                """, Map.of("phone", phone));
        return UUID.fromString(jdbc.queryForObject("""
                SELECT t.id::text FROM trainer t JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :phone
                """, Map.of("phone", phone), String.class));
    }
}
