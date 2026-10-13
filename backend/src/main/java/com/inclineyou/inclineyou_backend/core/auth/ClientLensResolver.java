package com.inclineyou.inclineyou_backend.core.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Builds the client lens: the client rows a signed-in client's request may see (api-contract 1.2).
 *
 * <p>The row-level policies the portal reads through are keyed on {@code app_client_ids()} and carry no membership check of their
 * own, so THIS list is the wall. It is the database's answer ({@code client_ids_for_phone}, V20) and holds only live arrangements —
 * accepted, not paused or archived by the trainer, not deleted, not erased. A paused or removed client's list is empty, which
 * leaves every table the lens opens shut to them whatever a controller forgets to check.
 *
 * <p>Called by {@link AuthTokenFilter} on every client request, with a bootstrap context for the session's own number — the same
 * moment and the same way a trainer's workspace is resolved.
 */
@Component
@RequiredArgsConstructor
public class ClientLensResolver {

    private final NamedParameterJdbcTemplate jdbc;

    public List<UUID> idsFor(String phone) {
        return jdbc.queryForList("SELECT unnest(client_ids_for_phone(:p))::text", Map.of("p", phone), String.class).stream()
                .map(UUID::fromString).toList();
    }
}
