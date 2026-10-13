package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.InviteList;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/client-invites} (api-contract 1.2 tr-a3): the Invitations view — who has joined, who has not. Reads only;
 * the token and its hash never leave the database. A pending invitation is resent in two actions: this row, then
 * {@code POST /v1/clients/{id}/invites}.
 */
@Service
@RequiredArgsConstructor
public class ClientInviteReadService {

    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 200;
    private static final List<String> STATES = List.of("pending", "expired", "accepted", "declined", "revoked");

    private final ClientInviteJdbcRepository invites;

    /**
     * @param state   a comma list of {@code pending · expired · accepted · declined · revoked}, or {@code all}; absent means
     *                {@code pending,expired}, the ones that need the trainer
     * @param include {@code counts} adds the five headings' numbers
     */
    public InviteList list(UUID trainerId, String state, String clientId, String include, Integer limit, String cursor) {
        Set<String> states = states(state);
        UUID cid = uuid(clientId);
        boolean counts = counts(include);
        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        Cursor after = Cursor.decode(cursor);

        var rows = invites.page(trainerId, states, cid, after, n + 1);
        var page = com.inclineyou.inclineyou_backend.shared.wire.Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.invite().id()));
        return new InviteList(page.items(), counts ? invites.counts(trainerId, cid) : null, page.nextCursor());
    }

    /** Null means every state. An unknown name is a 400 naming the five, never a silently empty list. */
    private static Set<String> states(String raw) {
        if (raw == null || raw.isBlank()) return Set.of("pending", "expired");
        var out = new LinkedHashSet<String>();
        for (String s : raw.split(",")) {
            String name = s.strip().toLowerCase();
            if ("all".equals(name)) return null;
            if (!STATES.contains(name)) throw ApiException.validation("state: pending, expired, accepted, declined, revoked or all");
            out.add(name);
        }
        return out;
    }

    private static boolean counts(String include) {
        if (include == null || include.isBlank()) return false;
        if ("counts".equals(include.strip())) return true;
        throw ApiException.validation("include: counts");
    }

    private static UUID uuid(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("clientId: not an id");
        }
    }
}
