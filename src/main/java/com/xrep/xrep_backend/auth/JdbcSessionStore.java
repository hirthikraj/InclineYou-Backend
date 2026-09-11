package com.xrep.xrep_backend.auth;

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
 * most of this codebase — only five things are entities. See the note in
 * {@code CLAUDE.md}: follow whichever the surrounding service uses, and do not
 * "upgrade" a JDBC service to JPA.
 *
 * <p>{@code web_session} is deliberately outside row-level security. It is read
 * to ESTABLISH the tenant context, so a policy on it would have to be satisfied
 * by the very context the read is trying to produce.
 */
@Component
@RequiredArgsConstructor
public class JdbcSessionStore implements SessionStore {

    private final NamedParameterJdbcTemplate jdbc;

    @Override
    public void save(Session s) {
        var p = new MapSqlParameterSource()
                .addValue("id", s.id())
                .addValue("hash", s.tokenHash())
                .addValue("subject", s.subject())
                .addValue("phone", s.phone())
                .addValue("role", s.role())
                .addValue("appUserId", s.appUserId() == null ? null : s.appUserId().toString())
                .addValue("tenantId", s.tenantId() == null ? null : s.tenantId().toString())
                .addValue("issuedAt", Timestamp.from(s.issuedAt()))
                .addValue("expiresAt", Timestamp.from(s.expiresAt()))
                .addValue("userAgent", s.userAgent());

        jdbc.update("""
                INSERT INTO web_session
                    (id, token_hash, subject, phone, role, app_user_id, tenant_id,
                     issued_at, last_seen_at, expires_at, user_agent)
                VALUES
                    (:id, :hash, :subject, :phone, :role, :appUserId::uuid, :tenantId::uuid,
                     :issuedAt, :issuedAt, :expiresAt, :userAgent)
                """, p);
    }

    @Override
    public Optional<Session> find(String tokenHash) {
        var rows = jdbc.query(SELECT + " WHERE token_hash = :hash",
                Map.of("hash", tokenHash), JdbcSessionStore::map);
        return rows.stream().findFirst();
    }

    @Override
    public void touch(String tokenHash, Instant seenAt) {
        // Only when it has actually moved. A write on every request would make
        // this the hottest table in the schema and buy no accuracy anybody reads.
        jdbc.update("""
                UPDATE web_session SET last_seen_at = :seen
                WHERE token_hash = :hash AND last_seen_at < :seen - INTERVAL '1 minute'
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
                WHERE subject = :subject AND revoked_at IS NULL
                """, Map.of("subject", subject, "at", Timestamp.from(at)));
    }

    @Override
    public boolean moveToTenant(String tokenHash, UUID tenantId) {
        return jdbc.update("""
                UPDATE web_session SET tenant_id = :tenantId::uuid
                WHERE token_hash = :hash AND revoked_at IS NULL AND expires_at > NOW()
                """, Map.of("hash", tokenHash, "tenantId", tenantId.toString())) == 1;
    }

    @Override
    public List<Session> listForSubject(String subject) {
        return jdbc.query(SELECT + """
                 WHERE subject = :subject AND revoked_at IS NULL AND expires_at > NOW()
                 ORDER BY last_seen_at DESC
                """, Map.of("subject", subject), JdbcSessionStore::map);
    }

    @Override
    public int purgeExpiredBefore(Instant cutoff) {
        return jdbc.update("DELETE FROM web_session WHERE expires_at < :cutoff",
                Map.of("cutoff", Timestamp.from(cutoff)));
    }

    private static final String SELECT = """
            SELECT id, token_hash, subject, phone, role, app_user_id, tenant_id,
                   issued_at, last_seen_at, expires_at, revoked_at, user_agent
            FROM web_session
            """;

    private static Session map(ResultSet rs, int i) throws SQLException {
        return new Session(
                rs.getObject("id", UUID.class),
                rs.getString("token_hash"),
                rs.getString("subject"),
                rs.getString("phone"),
                rs.getString("role"),
                rs.getObject("app_user_id", UUID.class),
                rs.getObject("tenant_id", UUID.class),
                rs.getTimestamp("issued_at").toInstant(),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant(),
                rs.getString("user_agent"));
    }
}
