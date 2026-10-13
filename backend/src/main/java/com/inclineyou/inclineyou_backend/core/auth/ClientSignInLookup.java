package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * What the login page needs to know about a number that has just proved itself and holds no session yet
 * (api-contract 1.2, inv-a5): which wall a client is on, and which invites are waiting.
 *
 * <p>Both answers live behind functions that answer only for the number in {@code app.phone}. The request that gets here holds no
 * session, so that setting is empty — and it cannot be set by labelling a connection, because the transaction that called this
 * already holds one, borrowed before the number was known. So each read states the number for ITS OWN transaction
 * ({@code set_config(…, is_local => true)}): on the very connection the read runs on, gone at commit, and visible to nothing else.
 */
@Component
@RequiredArgsConstructor
public class ClientSignInLookup {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    /** A client's wall, or null when this number is nobody's client. */
    public record State(String access, AuthResponse.ClientTrainer trainer) {}

    @Transactional
    public State stateOf(String phone) {
        return asNumber(phone, () -> {
            String json = jdbc.queryForObject("SELECT client_sign_in_state(:p)::text", Map.of("p", phone), String.class);
            if (json == null) return null;
            JsonNode n = JSON.readTree(json);
            return new State(n.path("access").asString(), new AuthResponse.ClientTrainer(n.path("trainer_name").asString(),
                    n.path("headline").isString() ? n.path("headline").asString() : null));
        });
    }

    @Transactional
    public List<AuthResponse.PendingInvite> invitesFor(String phone) {
        return asNumber(phone, () -> {
            JsonNode all = JSON.readTree(jdbc.queryForObject("SELECT pending_invites_for_phone(:p)::text", Map.of("p", phone), String.class));
            var out = new ArrayList<AuthResponse.PendingInvite>();
            for (JsonNode i : all) {
                out.add(new AuthResponse.PendingInvite(i.path("invite_id").asString(), i.path("trainer_name").asString(),
                        i.path("headline").isString() ? i.path("headline").asString() : null, i.path("expires_at").asLong()));
            }
            return out;
        });
    }

    /** The two statements share one transaction, so the setting is still there when the function reads it. */
    private <T> T asNumber(String phone, java.util.function.Supplier<T> read) {
        jdbc.queryForObject("SELECT set_config('app.phone', :p, true)", Map.of("p", phone), String.class);
        return read.get();
    }
}
