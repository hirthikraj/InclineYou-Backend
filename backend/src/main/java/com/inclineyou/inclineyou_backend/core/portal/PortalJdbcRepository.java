package com.inclineyou.inclineyou_backend.core.portal;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMe;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** The SQL behind the client portal's reads. Everything a client reads goes through their lens; the wall goes through a function. */
@Repository
@RequiredArgsConstructor
public class PortalJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * {@code portal_wall(phone)} (V20): the one row that answers for ANY access, because a paused or removed client has no lens to
     * read it with. Empty when the number is nobody's client.
     */
    public Optional<JsonNode> wall(String phone) {
        String json = jdbc.queryForObject("SELECT portal_wall(:p)::text", Map.of("p", phone), String.class);
        return json == null ? Optional.empty() : Optional.of(JSON.readTree(json));
    }

    /** The trainer's switch for what a client may see of money (D-18), asked about the client's own row. */
    public boolean moneyVisible(UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT client_can_see_money(:c::uuid)", Map.of("c", clientId.toString()), Boolean.class));
    }

    /**
     * The bell's count, through the lens. The row-level policy already shows a client only their own notices; the explicit
     * {@code client_id} is the second wall, so a count is right even on a connection the policies do not apply to.
     */
    public int unreadNotices(UUID clientId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid AND read_at IS NULL AND deleted_at IS NULL",
                Map.of("c", clientId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /** The Assessments tab's badge, through the lens: sent to this client and not yet submitted. Same two walls. */
    public int openAssessments(UUID clientId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM assessment WHERE client_id = :c::uuid AND sent_at IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL",
                Map.of("c", clientId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /** The notice version this number accepted, or null. */
    public String acceptedPolicy(String phone) {
        return jdbc.queryForList("SELECT privacy_policy_version FROM app_user WHERE phone = :p AND deleted_at IS NULL", Map.of("p", phone), String.class)
                .stream().findFirst().orElse(null);
    }

    /** The client's own row as {@code myDetails}, through their lens. The {@code id} comes from the lens, never from the request. */
    public Optional<PortalMe.MyDetails> details(UUID clientId) {
        return jdbc.query("""
                SELECT name, goal, height_cm, timezone, activity_level, date_of_birth::text AS dob, phone,
                       (extract(epoch FROM updated_at) * 1000)::bigint AS version
                  FROM client WHERE id = :c::uuid AND deleted_at IS NULL""", Map.of("c", clientId.toString()),
                (rs, i) -> new PortalMe.MyDetails(rs.getString("name"), rs.getString("goal"),
                        rs.getBigDecimal("height_cm") == null ? null : rs.getBigDecimal("height_cm").doubleValue(),
                        rs.getString("timezone"), rs.getString("activity_level"), rs.getString("dob"), rs.getString("phone"),
                        String.valueOf(rs.getLong("version")))).stream().findFirst();
    }

    /** The row's version, locked, so an If-Match is checked against the same state the write then changes. */
    public Optional<String> lockVersion(UUID clientId) {
        return jdbc.queryForList("""
                SELECT (extract(epoch FROM updated_at) * 1000)::bigint::text FROM client
                 WHERE id = :c::uuid AND deleted_at IS NULL FOR UPDATE""", Map.of("c", clientId.toString()), String.class).stream().findFirst();
    }

    /**
     * Writes only the columns named in {@code set} (column → value, a null value clears). The names are the five the database's column
     * guard allows a client to change, fixed in the service and never taken from the request.
     */
    public void updateDetails(UUID clientId, LinkedHashMap<String, Object> set) {
        var params = new java.util.HashMap<String, Object>(set);
        params.put("c", clientId.toString());
        var assignments = new StringBuilder();
        set.keySet().forEach(col -> assignments.append(assignments.isEmpty() ? "" : ", ").append(col).append(" = :").append(col));
        jdbc.update("UPDATE client SET " + assignments + " WHERE id = :c::uuid AND deleted_at IS NULL", params);
    }

    /** {@code client_ack_removed} (V22): the one door a removed client's "I have seen this" goes through. True only the first time. */
    public boolean ackRemoved(String phone) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT client_ack_removed(:p)", Map.of("p", phone), Boolean.class));
    }

    /** {@code client_accept_policy} (V22): the pair on {@code app_user} and the version on the client's accepted rows. */
    public void acceptPolicy(String phone, String version) {
        jdbc.queryForObject("SELECT client_accept_policy(:p, :v)::text", Map.of("p", phone, "v", version), String.class);
    }

    /** When this number accepted the notice in force (epoch ms), or null. */
    public Long acceptedAt(String phone) {
        return jdbc.queryForList("SELECT privacy_accepted_at FROM app_user WHERE phone = :p AND deleted_at IS NULL", Map.of("p", phone), java.sql.Timestamp.class)
                .stream().findFirst().map(java.sql.Timestamp::getTime).orElse(null);
    }
}
