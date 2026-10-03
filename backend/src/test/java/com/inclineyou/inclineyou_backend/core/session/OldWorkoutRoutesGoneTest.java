package com.inclineyou.inclineyou_backend.core.session;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * The old workout-as-log API is gone: the eight writes on 3 Oct 2026 and the five reads after the
 * Progress pass, because the log is the session, written and read through {@code /v1/sessions/{id}/…}
 * (core/sessionlog) and {@code /v1/clients/{id}/set-history}. Each removed method + path pair must
 * answer 404 or 405 — no handler — and never a 2xx or a 5xx.
 */
@SpringBootTest
class OldWorkoutRoutesGoneTest {

    @Autowired WebApplicationContext context;

    private static final UUID TRAINER = UUID.fromString("00000000-0000-4000-8000-0000000000aa");
    private static final String ID = "11111111-1111-4111-8111-111111111111";
    private static final String ROW = "22222222-2222-4222-8222-222222222222";

    private MockMvc mvc() {
        var principal = new UsernamePasswordAuthenticationToken(
                TRAINER.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        // The security filters stay out of the chain (as in WorkoutLogRestTest); the principal is supplied.
        return MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").principal(principal)).build();
    }

    private int answer(MockHttpServletRequestBuilder req) throws Exception {
        MvcResult r = mvc().perform(req.principal(new UsernamePasswordAuthenticationToken(
                TRAINER.toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER")))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn();
        return r.getResponse().getStatus();
    }

    private void gone(String what, MockHttpServletRequestBuilder req) throws Exception {
        int status = answer(req);
        assertTrue(status == 404 || status == 405, what + " must be gone (404/405) but answered " + status);
    }

    @Test
    @DisplayName("the eight old /v1/workouts write routes answer 404 or 405")
    void writesAreGone() throws Exception {
        gone("POST /v1/workouts", post("/v1/workouts"));
        gone("PUT /v1/workouts/{id}", put("/v1/workouts/" + ID));
        gone("POST /v1/workouts/{id}/sets", post("/v1/workouts/" + ID + "/sets"));
        gone("PUT /v1/workouts/{id}/sets/{setId}", put("/v1/workouts/" + ID + "/sets/" + ROW));
        gone("DELETE /v1/workouts/{id}/sets/{setId}", delete("/v1/workouts/" + ID + "/sets/" + ROW));
        gone("POST /v1/workouts/{id}/exercises", post("/v1/workouts/" + ID + "/exercises"));
        gone("PUT /v1/workouts/{id}/exercises/{rowId}", put("/v1/workouts/" + ID + "/exercises/" + ROW));
        gone("DELETE /v1/workouts/{id}/exercises/{rowId}", delete("/v1/workouts/" + ID + "/exercises/" + ROW));
    }

    @Test
    @DisplayName("the five old /v1/workouts reads answer 404 or 405 too")
    void readsAreGone() throws Exception {
        gone("GET /v1/workouts", get("/v1/workouts"));
        gone("GET /v1/workouts/sets", get("/v1/workouts/sets?clientId=" + ID));
        gone("GET /v1/workouts/{id}", get("/v1/workouts/" + ID));
        gone("GET /v1/workouts/{id}/sets", get("/v1/workouts/" + ID + "/sets"));
        gone("GET /v1/workouts/{id}/exercises", get("/v1/workouts/" + ID + "/exercises"));
    }
}
