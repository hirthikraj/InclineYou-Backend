package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.InviteItem;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteList;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteListItem;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Optional;
import java.util.UUID;

/** The SQL on {@code client_invite}, and the few {@code client} columns an invite decides on. */
@Repository
@RequiredArgsConstructor
public class ClientInviteJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** What an invite decides on, read with the client row locked so two taps at once are serialised. */
    public record Target(String id, String name, String phone, String status, String membershipStatus) {}

    /** Empty when the client is not this trainer's, or is deleted or erased: a stranger's id and a missing one look alike. */
    public Optional<Target> lockClient(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT id::text AS id, name, phone, status, membership_status
                FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL AND erased_at IS NULL
                FOR UPDATE
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Target(rs.getString("id"), rs.getString("name"), rs.getString("phone"),
                        rs.getString("status"), rs.getString("membership_status"))).stream().findFirst();
    }

    /** Whether the number already belongs to a trainer's login. One number, one role (D-06). */
    public boolean phoneBelongsToTrainer(String phone) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM app_user WHERE phone = :p AND role = 'trainer' AND deleted_at IS NULL)",
                Map.of("p", phone), Boolean.class));
    }

    /** A resend replaces: the old link stops working at once. uq_client_invite_pending allows only one. */
    public void revokePending(UUID clientId, String reason) {
        jdbc.update("""
                UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = :reason
                WHERE client_id = :cid::uuid AND status = 'pending'
                """, Map.of("cid", clientId.toString(), "reason", reason));
    }

    /** tenant_id is stamped by the trigger; expires_at defaults to fourteen days. */
    public InviteItem insert(UUID trainerId, UUID clientId, String phone, String tokenHash) {
        return jdbc.queryForObject("""
                INSERT INTO client_invite (trainer_id, client_id, phone, token_hash)
                VALUES (:tid::uuid, :cid::uuid, :phone, :hash)
                RETURNING id::text AS id, client_id::text AS client_id, status, created_at, expires_at
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString(), "phone", phone, "hash", tokenHash),
                (rs, i) -> new InviteItem(rs.getString("id"), rs.getString("client_id"), rs.getString("status"),
                        rs.getTimestamp("created_at").getTime(), rs.getTimestamp("expires_at").getTime(),
                        null, null, null, null, null));
    }

    /** Invited, now. A declined client who is invited again leaves that state: the constraint ties declined to its date. */
    public void markInvited(UUID clientId) {
        jdbc.update("""
                UPDATE client SET membership_status = 'invited', invited_at = now(), declined_at = NULL
                WHERE id = :cid::uuid
                """, Map.of("cid", clientId.toString()));
    }

    /* ── the Invitations list ──────────────────────────────────────────────── */

    /**
     * Newest first, keyset on {@code (created_at, id)} in one range of idx_client_invite_tenant_trainer. {@code states}
     * are the five the wire names; {@code expired} is a pending invite past {@code expires_at}, derived here and never
     * stored. An invite of a deleted client is not listed (there is no one to invite or to ask about).
     */
    public List<InviteListItem> page(UUID trainerId, Set<String> states, UUID clientId, Cursor after, int fetch) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("limit", fetch);
        var where = new StringBuilder();
        if (clientId != null) {
            p.put("cid", clientId.toString());
            where.append(" AND i.client_id = :cid::uuid");
        }
        if (states != null) where.append(" AND (").append(stateSql(states)).append(")");
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            where.append(" AND (i.created_at, i.id) < (:afterAt, :afterId::uuid)");
        }
        return jdbc.query("""
                SELECT i.id::text AS id, i.client_id::text AS client_id, i.status, (i.status = 'pending' AND i.expires_at <= now()) AS lapsed,
                       i.created_at, i.expires_at, i.accepted_at, i.declined_at, i.decline_reason, i.revoked_at, i.revoked_reason,
                       c.name, c.phone
                FROM client_invite i
                JOIN client c ON c.id = i.client_id AND c.deleted_at IS NULL
                WHERE i.trainer_id = :tid::uuid
                """ + where + """

                ORDER BY i.created_at DESC, i.id DESC
                LIMIT :limit
                """, p, ClientInviteJdbcRepository::listRow);
    }

    /** One grouped pass over this trainer's invites (optionally one client's): the five headings. */
    public InviteList.Counts counts(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        String byClient = "";
        if (clientId != null) {
            p.put("cid", clientId.toString());
            byClient = " AND i.client_id = :cid::uuid";
        }
        var n = new HashMap<String, Integer>();
        jdbc.query("""
                SELECT CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END AS s, count(*) AS n
                FROM client_invite i JOIN client c ON c.id = i.client_id AND c.deleted_at IS NULL
                WHERE i.trainer_id = :tid::uuid""" + byClient + " GROUP BY 1", p,
                rs -> { n.put(rs.getString("s"), rs.getInt("n")); });
        return new InviteList.Counts(n.getOrDefault("pending", 0), n.getOrDefault("expired", 0), n.getOrDefault("accepted", 0),
                n.getOrDefault("declined", 0), n.getOrDefault("revoked", 0));
    }

    /** Only ever built from the five fixed names, never from the caller's text. */
    private static String stateSql(Set<String> states) {
        var parts = new java.util.ArrayList<String>();
        for (String s : List.of("pending", "expired", "accepted", "declined", "revoked")) {
            if (!states.contains(s)) continue;
            parts.add(switch (s) {
                case "pending" -> "(i.status = 'pending' AND i.expires_at > now())";
                case "expired" -> "(i.status = 'pending' AND i.expires_at <= now())";
                default -> "i.status = '" + s + "'";
            });
        }
        return String.join(" OR ", parts);
    }

    private static InviteListItem listRow(ResultSet rs, int i) throws SQLException {
        Timestamp created = rs.getTimestamp("created_at");
        String state = rs.getBoolean("lapsed") ? "expired" : rs.getString("status");
        var invite = new InviteItem(rs.getString("id"), rs.getString("client_id"), state, created.getTime(),
                rs.getTimestamp("expires_at").getTime(), ms(rs.getTimestamp("accepted_at")), ms(rs.getTimestamp("declined_at")),
                rs.getString("decline_reason"), ms(rs.getTimestamp("revoked_at")), rs.getString("revoked_reason"));
        return new InviteListItem(invite, new InviteListItem.Client(rs.getString("client_id"), rs.getString("name"), rs.getString("phone")),
                Cursor.key(created));
    }

    private static Long ms(Timestamp t) {
        return t == null ? null : t.getTime();
    }

    /** The invite's client, when the invite is this trainer's. Read before any lock, so the client row can be locked first. */
    public Optional<UUID> clientOf(UUID trainerId, UUID inviteId) {
        return jdbc.query("SELECT client_id::text AS client_id FROM client_invite WHERE id = :iid::uuid AND trainer_id = :tid::uuid",
                Map.of("iid", inviteId.toString(), "tid", trainerId.toString()),
                (rs, i) -> UUID.fromString(rs.getString("client_id"))).stream().findFirst();
    }

    /** The invite as it stands, locked. Its status is the stored one: only the list derives {@code expired}. */
    public Optional<InviteItem> lockInvite(UUID trainerId, UUID inviteId) {
        return jdbc.query(ITEM + " WHERE id = :iid::uuid AND trainer_id = :tid::uuid FOR UPDATE",
                Map.of("iid", inviteId.toString(), "tid", trainerId.toString()), ClientInviteJdbcRepository::item).stream().findFirst();
    }

    /** Pending to revoked by the trainer. Answers the row, or empty when it was no longer pending (it moved under us). */
    public Optional<InviteItem> revokeByTrainer(UUID inviteId) {
        return jdbc.query("""
                UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'trainer'
                WHERE id = :iid::uuid AND status = 'pending'
                RETURNING id::text AS id, client_id::text AS client_id, status, created_at, expires_at,
                          accepted_at, declined_at, decline_reason, revoked_at, revoked_reason
                """, Map.of("iid", inviteId.toString()), ClientInviteJdbcRepository::item).stream().findFirst();
    }

    /** Back to not invited, but only from invited: a client who has since declined or been removed keeps that. */
    public void markNotInvited(UUID clientId) {
        jdbc.update("UPDATE client SET membership_status = 'not_invited' WHERE id = :cid::uuid AND membership_status = 'invited'",
                Map.of("cid", clientId.toString()));
    }

    /**
     * A new number starts the arrangement over: the invitation was to the old one, so the client is not invited and
     * a declined answer no longer stands. Never touches an accepted or removed row — the caller has already refused or
     * passed over those.
     */
    public void startOver(UUID clientId) {
        jdbc.update("""
                UPDATE client SET membership_status = 'not_invited', declined_at = NULL
                WHERE id = :cid::uuid AND membership_status IN ('invited', 'declined')
                """, Map.of("cid", clientId.toString()));
    }

    private static final String ITEM = """
            SELECT id::text AS id, client_id::text AS client_id, status, created_at, expires_at,
                   accepted_at, declined_at, decline_reason, revoked_at, revoked_reason
            FROM client_invite""";

    private static InviteItem item(ResultSet rs, int i) throws SQLException {
        return new InviteItem(rs.getString("id"), rs.getString("client_id"), rs.getString("status"),
                rs.getTimestamp("created_at").getTime(), rs.getTimestamp("expires_at").getTime(),
                ms(rs.getTimestamp("accepted_at")), ms(rs.getTimestamp("declined_at")), rs.getString("decline_reason"),
                ms(rs.getTimestamp("revoked_at")), rs.getString("revoked_reason"));
    }

    public String trainerName(UUID trainerId) {
        return jdbc.queryForObject("SELECT name FROM trainer WHERE id = :tid::uuid",
                Map.of("tid", trainerId.toString()), String.class);
    }
}
