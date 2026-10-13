package com.inclineyou.inclineyou_backend.core.client;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * {@code GET /v1/clients/{id}/readings} was removed on 10 Oct 2026. A body is measured in an assessment and
 * nowhere else (D-02, V22), so there is no separate measurement history to read: a client's measurements are the
 * assessments' own. The route must answer 404 or 405 — no handler — and never a 2xx.
 */
@SpringBootTest
class ClientReadingsRouteGoneTest {

    @Autowired WebApplicationContext context;

    @Test
    @DisplayName("GET /v1/clients/{id}/readings has no handler")
    void readingsRouteIsGone() throws Exception {
        var principal = new UsernamePasswordAuthenticationToken(
                UUID.randomUUID().toString(), null, AuthorityUtils.createAuthorityList("ROLE_TRAINER"));
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).defaultRequest(get("/").principal(principal)).build();
        for (String path : new String[]{"/readings", "/readings?key=weight"}) {
            int status = mvc.perform(get("/v1/clients/" + UUID.randomUUID() + path)).andReturn().getResponse().getStatus();
            assertTrue(status == 404 || status == 405, "readings must be gone (404/405) but answered " + status);
        }
    }
}
