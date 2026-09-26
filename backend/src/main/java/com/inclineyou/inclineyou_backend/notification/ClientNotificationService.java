package com.inclineyou.inclineyou_backend.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

/**
 * V18 · a fact for a CLIENT's bell, minted by a trainer's write.
 *
 * <p>Every call goes through {@code mint_client_notification()}, which reads the
 * one switch in {@code client_prefs} the kind maps to — a table the trainer's
 * request may not read — and writes the row, or nothing. Called inside the
 * trainer's transaction, so the row lands exactly when the write it announces
 * does. A switched-off kind is not an error: {@link #mint} answers false and the
 * write carries on.
 *
 * <p>The kinds and what {@code text} carries for each: {@code session} — the
 * verb ({@code booked} · {@code moved} · {@code cancelled}) with the slot in
 * {@code subjectAt}; {@code pack} — {@code sold} · {@code renewed} or the method
 * of a payment, with the {@code amount}; {@code plan} — the plan's name, with
 * {@code subjectAt} = when the plan was made (equal to now for a new plan, which
 * is how the portal says <i>new plan</i> rather than <i>changed your plan</i>);
 * {@code best} — the milestone's label; {@code note} — no producer yet.
 */
@Service
@RequiredArgsConstructor
public class ClientNotificationService {

    static final List<String> KINDS = List.of("note", "plan", "session", "pack", "best");

    private final NamedParameterJdbcTemplate jdbc;

    /** @return whether a row was written — false when the client switched that kind off. */
    public boolean mint(UUID clientId, String kind, BigDecimal amount, Instant subjectAt, String text) {
        if (clientId == null) return false;
        if (!KINDS.contains(kind)) throw new IllegalArgumentException("unknown client notification kind: " + kind);
        var p = new HashMap<String, Object>();
        p.put("c", clientId.toString());
        p.put("k", kind);
        p.put("a", amount);
        p.put("s", subjectAt == null ? null : Timestamp.from(subjectAt));
        p.put("t", text);
        String id = jdbc.queryForObject("""
                SELECT mint_client_notification(:c::uuid, CAST(:k AS varchar), CAST(:a AS numeric),
                    CAST(:s AS timestamptz), CAST(:t AS varchar))::text
                """, p, String.class);
        return id != null;
    }

    public boolean mint(String clientId, String kind, BigDecimal amount, Instant subjectAt, String text) {
        return clientId == null ? false : mint(UUID.fromString(clientId), kind, amount, subjectAt, text);
    }
}
