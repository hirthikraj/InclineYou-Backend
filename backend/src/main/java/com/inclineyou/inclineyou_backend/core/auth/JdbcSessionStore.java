package com.inclineyou.inclineyou_backend.core.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The system of record for web sessions: {@code web_session}.
 *
 * <p>Hand-written SQL rather than JPA, which is the rule in this package and in
 * most of this codebase — only a handful of things are entities. See the note
 * in {@code CLAUDE.md}: follow whichever the surrounding service uses, and do
 * not "upgrade" a JDBC service to JPA.
 *
 * <p>{@code web_session} is deliberately outside row-level security. It is read
 * to ESTABLISH the tenant context, so a policy on it would have to be satisfied
 * by the very context the read is trying to produce.
 *
 * <h2>{@code subject} is derived, not stored</h2>
 *
 * The table (since the 25 Sep 2026 schema rebuild) carries {@code app_user_id},
 * not {@link SessionStore.Session#subject()} or {@link SessionStore.Session#phone()} —
 * a session is a device's hold on an IDENTITY, and the identity's own tables
 * already say what the subject and phone are for it. Every read joins back to
 * {@code app_user} for the phone and, for a trainer session, to {@code trainer}
 * for the id that {@link AuthPrincipal#subject()} actually carries. Every write
 * needs the reverse: {@link SessionTokenIssuer} resolves {@code app_user_id}
 * before calling {@link #save}, because the column is {@code NOT NULL} and
 * there is no phone column here to fall back on.
 */
@Component
@RequiredArgsConstructor
public class JdbcSessionStore implements SessionStore {

    private final NamedParameterJdbcTemplate jdbc;

    @Override
    public void save(Session s) {
        if (s.appUserId() == null) {
            // Would violate web_session.app_user_id's NOT NULL at the INSERT
            // below. Failing here names the actual cause instead of a generic
            // constraint-violation stack trace three layers down.
            throw new IllegalStateException(
                    "no app_user for session subject " + s.subject() + " — cannot open a web session");
        }
        var p = new MapSqlParameterSource()
                .addValue("id", s.id())
                .addValue("hash", s.tokenHash())
                .addValue("appUserId", s.appUserId().toString())
                .addValue("role", s.role())
                .addValue("tenantId", s.tenantId() == null ? null : s.tenantId().toString())
                .addValue("issuedAt", Timestamp.from(s.issuedAt()))
                .addValue("expiresAt", Timestamp.from(s.expiresAt()))
                .addValue("userAgent", s.userAgent());

        jdbc.update("""
                INSERT INTO web_session
                    (id, token_hash, app_user_id, role, active_tenant_id,
                     issued_at, last_seen_at, expires_at, user_agent)
                VALUES
                    (:id, :hash, :appUserId::uuid, :role, :tenantId::uuid,
                     :issuedAt, :issuedAt, :expiresAt, :userAgent)
                """, p);
    }

    @Override
    public Optional<Session> find(String tokenHash) {
        var rows = jdbc.query(SELECT + " WHERE ws.token_hash = :hash",
                Map.of("hash", tokenHash), JdbcSessionStore::map);
        return rows.stream().findFirst();
    }

    @Override
    public void touch(String tokenHash, Instant seenAt) {
        // Only when it has actually moved. A write on every request would make
        // this the hottest table in the schema and buy no accuracy anybody reads.
        // `last_seen_at + INTERVAL < :seen` rather than `:seen - INTERVAL <
        // last_seen_at`: with the parameter on the interval's other side,
        // Postgres cannot infer its type from context and refuses the query
        // (`operator does not exist: timestamp with time zone < interval`).
        jdbc.update("""
                UPDATE web_session SET last_seen_at = :seen
                WHERE token_hash = :hash AND last_seen_at + INTERVAL '1 minute' < :seen
                """, Map.of("hash", tokenHash, "seen", Timestamp.from(seenAt)));
    }

    @Override
    public void revoke(String tokenHash, Instant at) {
        jdbc.update("""
                UPDATE web_session SET revoked_at = :at
                WHERE token_hash = :hash AND revoked_at IS NULL
                """, Map.of("hash", tokenHash, "at", Timestamp.from(at)));
    }

    @Override
    public int revokeAllForSubject(String subject, Instant at) {
        return jdbc.update("""
                UPDATE web_session SET revoked_at = :at
                WHERE app_user_id = (%s) AND revoked_at IS NULL
                """.formatted(appUserIdSql()),
                subjectParams(subject).addValue("at", Timestamp.from(at)));
    }

    @Override
    public boolean moveToTenant(String tokenHash, UUID tenantId) {
        return jdbc.update("""
                UPDATE web_session SET active_tenant_id = :tenantId::uuid
                WHERE token_hash = :hash AND revoked_at IS NULL AND expires_at > NOW()
                """, Map.of("hash", tokenHash, "tenantId", tenantId.toString())) == 1;
    }

    @Override
    public List<Session> listForSubject(String subject) {
        return jdbc.query(SELECT + """
                 WHERE ws.app_user_id = (%s)
                   AND ws.revoked_at IS NULL AND ws.expires_at > NOW()
                 ORDER BY ws.last_seen_at DESC
                """.formatted(appUserIdSql()),
                subjectParams(subject), JdbcSessionStore::map);
    }

    @Override
    public int purgeExpiredBefore(Instant cutoff) {
        return jdbc.update("DELETE FROM web_session WHERE expires_at < :cutoff",
                Map.of("cutoff", Timestamp.from(cutoff)));
    }

    /**
     * {@code subject} is a trainer UUID for a trainer session and a phone for
     * every other role (see {@link AuthPrincipal}), and this table only ever
     * has {@code app_user_id} to search by. Rather than parse the string twice
     * at each call site, both queries above resolve it with the same
     * sub-select, fed by whichever of {@code :trainerId} / {@code :phone}
     * {@link #subjectParams} actually set.
     */
    private static String appUserIdSql() {
        return """
                SELECT COALESCE(
                    (SELECT app_user_id FROM trainer WHERE id = :trainerId::uuid),
                    (SELECT id FROM app_user WHERE phone = :phone))
                """;
    }

    private static MapSqlParameterSource subjectParams(String subject) {
        UUID trainerId = tryUuid(subject);
        return new MapSqlParameterSource()
                .addValue("trainerId", trainerId == null ? null : trainerId.toString())
                .addValue("phone", trainerId == null ? subject : null);
    }

    private static UUID tryUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static final String SELECT = """
            SELECT ws.id, ws.token_hash, ws.app_user_id, au.phone, ws.role,
                   t.id AS trainer_id, ws.active_tenant_id,
                   ws.issued_at, ws.last_seen_at, ws.expires_at, ws.revoked_at, ws.user_agent
            FROM web_session ws
            JOIN app_user au ON au.id = ws.app_user_id
            LEFT JOIN trainer t ON t.app_user_id = au.id AND t.deleted_at IS NULL
            """;

    private static Session map(ResultSet rs, int i) throws SQLException {
        String role = rs.getString("role");
        String phone = rs.getString("phone");
        UUID trainerId = rs.getObject("trainer_id", UUID.class);
        String subject = JwtService.ROLE_TRAINER.equals(role) && trainerId != null
                ? trainerId.toString() : phone;
        return new Session(
                rs.getObject("id", UUID.class),
                rs.getString("token_hash"),
                subject,
                phone,
                role,
                rs.getObject("app_user_id", UUID.class),
                rs.getObject("active_tenant_id", UUID.class),
                rs.getTimestamp("issued_at").toInstant(),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant(),
                rs.getString("user_agent"));
    }
}
