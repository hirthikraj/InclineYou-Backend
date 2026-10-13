package com.inclineyou.inclineyou_backend.core.client;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.UUID;

/**
 * The one door to a client's notification bell from the trainer's side: {@code mint_client_notification()}.
 *
 * <p>That function is the only writer of {@code client_notification}. It applies the client's own switch for the kind, does
 * nothing for a client who is not accepted, and is never called by a client, so a refused notice is simply no row and the thing
 * it pointed at (a message, a note, a plan) is still there to read. Callers do not check any of that themselves.
 */
@Repository
@RequiredArgsConstructor
public class ClientNoticeJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * @param kind {@code note}, {@code plan}, {@code session}, {@code pack}, {@code best} or {@code checkin} (never
     *             {@code reminder}, which the scheduler writes)
     * @param sessionId the session the notice is about, or null
     * @return whether a row was written: false when the client turned this kind off or is not on the portal, which is not an
     *         error for the caller, who did what they meant to, but is something a screen may want to say
     */
    public boolean mint(UUID clientId, String kind, String text, UUID sessionId) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("kind", kind);
        p.put("text", text);
        p.put("sid", sessionId == null ? null : sessionId.toString());
        var ids = jdbc.queryForList("SELECT mint_client_notification(:cid::uuid, :kind, :text, CAST(:sid AS uuid), NULL, NULL, NULL)::text AS id",
                p, String.class);
        return !ids.isEmpty() && ids.get(0) != null;
    }
}
