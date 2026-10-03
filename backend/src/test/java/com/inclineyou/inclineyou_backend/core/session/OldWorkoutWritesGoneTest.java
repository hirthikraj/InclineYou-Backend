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
 * The old workout-as-log WRITE routes are gone (3 Oct 2026): the log is the session, written
 * through {@code /v1/sessions/{id}/…} (see core/sessionlog). Each of the eight removed
 * method + path pairs must answer a 4xx "no such route / method" and never a 5xx or a 2xx, and
 * the five reads that remain must still be mapped.
 */
@SpringBootTest
class OldWorkoutWritesGoneTest {

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
    @DisplayName("the five reads that stay are still mapped (any answer but 404/405)")
    void readsStillExist() throws Exception {
        // These still run pre-v1 SQL, so a 200 or a database error are both fine here: only "no such route" is not.
        for (String path : new String[]{"/v1/workouts", "/v1/workouts/sets?clientId=" + ID, "/v1/workouts/" + ID,
                "/v1/workouts/" + ID + "/sets", "/v1/workouts/" + ID + "/exercises"}) {
            int status;
            try {
                status = answer(get(path));
            } catch (Exception e) {
                continue; // a thrown database error means the handler ran, which is what we are proving
            }
            assertTrue(status != 404 && status != 405, "GET " + path + " must still be mapped but answered " + status);
        }
    }
}
