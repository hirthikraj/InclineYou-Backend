package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalSettings;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind the client's settings and privacy screens. Their own prefs go through their lens (the column guard names exactly what a client
 * may write); the few facts a client cannot read — whether the trainer offers reminders, the whole of their data — come through V25's functions.
 */
@Repository
@RequiredArgsConstructor
public class PortalSettingsJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    // ── prefs ────────────────────────────────────────────────────────────────────────────────────

    /** The row, or the defaults a client with no row reads: every switch on, nothing opted in, no nominee. Version 0 when there is no row. */
    public PortalSettings.Prefs prefs(UUID client) {
        boolean offered = Boolean.TRUE.equals(jdbc.queryForObject("SELECT client_reminder_offered(:c::uuid)", p(client), Boolean.class));
        return jdbc.query("""
                SELECT hide_weight, auto_rest_timer, notify_program_updated, notify_session_reminder, notify_trainer_note, notify_personal_best, notify_pack_changed,
                       notify_checkin, channel_whatsapp, channel_push, whatsapp_opt_in_at IS NOT NULL AS opted, nominee_name, nominee_phone,
                       floor(extract(epoch FROM updated_at) * 1000)::bigint AS version
                  FROM client_prefs WHERE client_id = :c::uuid AND deleted_at IS NULL""", p(client), (rs, i) -> new PortalSettings.Prefs(rs.getBoolean("hide_weight"),
                rs.getBoolean("auto_rest_timer"), new PortalSettings.Notify(rs.getBoolean("notify_program_updated"), rs.getBoolean("notify_session_reminder"),
                rs.getBoolean("notify_trainer_note"), rs.getBoolean("notify_personal_best"), rs.getBoolean("notify_pack_changed"), rs.getBoolean("notify_checkin")),
                new PortalSettings.Channels(rs.getBoolean("channel_whatsapp"), rs.getBoolean("channel_push")), new PortalSettings.Whatsapp(offered, rs.getBoolean("opted")),
                rs.getString("nominee_name") == null ? null : new PortalSettings.Nominee(rs.getString("nominee_name"), rs.getString("nominee_phone")),
                String.valueOf(rs.getLong("version")))).stream().findFirst()
                .orElseGet(() -> new PortalSettings.Prefs(false, true, new PortalSettings.Notify(true, true, true, true, true, true), new PortalSettings.Channels(true, true),
                        new PortalSettings.Whatsapp(offered, false), null, "0"));
    }

    /** The row is made on the first write (the tenant is stamped by the table's trigger); a client let in before it existed reads the defaults until then. */
    public void ensureRow(UUID client) {
        jdbc.update("INSERT INTO client_prefs (client_id, tenant_id) SELECT id, tenant_id FROM client WHERE id = :c::uuid ON CONFLICT (client_id) DO NOTHING", p(client));
    }

    public Optional<String> lockVersion(UUID client) {
        return jdbc.queryForList("SELECT floor(extract(epoch FROM updated_at) * 1000)::bigint::text FROM client_prefs WHERE client_id = :c::uuid AND deleted_at IS NULL FOR UPDATE",
                p(client), String.class).stream().findFirst();
    }

    /** Writes only the named columns (names fixed in the service, never from the request); a null value clears. */
    public void update(UUID client, LinkedHashMap<String, Object> set, boolean recordOptIn) {
        var m = new HashMap<String, Object>(set);
        m.put("c", client.toString());
        var sql = new StringBuilder();
        set.keySet().forEach(col -> sql.append(sql.isEmpty() ? "" : ", ").append(col).append(" = :").append(col));
        if (recordOptIn) sql.append(sql.isEmpty() ? "" : ", ").append("whatsapp_opt_in_at = COALESCE(whatsapp_opt_in_at, now())");
        if (sql.isEmpty()) return;
        jdbc.update("UPDATE client_prefs SET " + sql + " WHERE client_id = :c::uuid", m);
    }

    // ── privacy ──────────────────────────────────────────────────────────────────────────────────

    public int sharedNotes(UUID client) {
        return jdbc.queryForObject("SELECT count(*) FROM client_note WHERE client_id = :c::uuid AND shared_with_client AND deleted_at IS NULL", p(client), Integer.class);
    }

    /** The health items the client's own assessments actually ask, by the words the client reads them in. */
    public List<String> healthItems(UUID client, List<String> measurementKeys, List<String> questionIds) {
        var m = p(client);
        m.put("mk", measurementKeys);
        m.put("qi", questionIds);
        return jdbc.queryForList("""
                SELECT label FROM (
                    SELECT DISTINCT x ->> 'label' AS label FROM assessment a, jsonb_array_elements(COALESCE(a.form -> 'measurements', '[]'::jsonb)) x
                     WHERE a.client_id = :c::uuid AND a.sent_at IS NOT NULL AND a.deleted_at IS NULL AND x ->> 'key' IN (:mk)
                    UNION
                    SELECT DISTINCT x ->> 'text' FROM assessment a, jsonb_array_elements(COALESCE(a.form -> 'questions', '[]'::jsonb)) x
                     WHERE a.client_id = :c::uuid AND a.sent_at IS NOT NULL AND a.deleted_at IS NULL AND x ->> 'id' IN (:qi)) h
                 WHERE label IS NOT NULL ORDER BY label""", m, String.class);
    }

    // ── the way out ──────────────────────────────────────────────────────────────────────────────

    public void clearNominee(UUID client) {
        jdbc.update("UPDATE client_prefs SET nominee_name = NULL, nominee_phone = NULL WHERE client_id = :c::uuid", p(client));
    }

    /** {@code client_leave_trainer} (V11): the client ends the arrangement; pending invites on the row are revoked. */
    public void leave(UUID client) {
        jdbc.queryForObject("SELECT client_leave_trainer(:c::uuid)::text", p(client), String.class);
    }

    /** {@code client_export} (V25): the person's whole data, as JSON text, for the number that signed in. */
    public String export(String phone) {
        return jdbc.queryForObject("SELECT client_export(:p)::text", Map.of("p", phone), String.class);
    }

    public Optional<UUID> appUserId(String phone) {
        return jdbc.queryForList("SELECT id::text FROM app_user WHERE phone = :p AND deleted_at IS NULL", Map.of("p", phone), String.class).stream().findFirst().map(UUID::fromString);
    }

    /** {@code erase_account} (V1, replaced in V11): details, notes, assessments, plan and future bookings go; what is financial stays as amounts and dates. */
    public void erase(UUID appUser) {
        jdbc.queryForObject("SELECT erase_account(:u::uuid, 'self')::text", Map.of("u", appUser.toString()), String.class);
    }

    // ── push ─────────────────────────────────────────────────────────────────────────────────────

    public record Sub(UUID id, UUID owner, boolean revoked) {}

    public Optional<Sub> subscriptionByEndpoint(String endpoint) {
        return jdbc.query("SELECT id, app_user_id, revoked_at IS NOT NULL AS revoked FROM push_subscription WHERE endpoint = :e", Map.of("e", endpoint),
                (rs, i) -> new Sub(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("app_user_id")), rs.getBoolean("revoked"))).stream().findFirst();
    }

    public boolean idTaken(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM push_subscription WHERE id = :i::uuid)", Map.of("i", id.toString()), Boolean.class));
    }

    public void insertSubscription(UUID id, UUID user, String endpoint, String p256dh, String auth, String userAgent) {
        var m = new HashMap<String, Object>();
        m.put("i", id.toString()); m.put("u", user.toString()); m.put("e", endpoint); m.put("k", p256dh); m.put("a", auth); m.put("ua", userAgent);
        jdbc.update("INSERT INTO push_subscription (id, app_user_id, endpoint, p256dh, auth, user_agent) VALUES (:i::uuid, :u::uuid, :e, :k, :a, :ua)", m);
    }

    /** An endpoint is a browser's: a replay, or the same browser signing in as somebody else, takes it (and its fresh keys) over and re-enables it. */
    public void takeOver(UUID id, UUID user, String p256dh, String auth, String userAgent) {
        var m = new HashMap<String, Object>();
        m.put("i", id.toString()); m.put("u", user.toString()); m.put("k", p256dh); m.put("a", auth); m.put("ua", userAgent);
        jdbc.update("UPDATE push_subscription SET app_user_id = :u::uuid, p256dh = :k, auth = :a, user_agent = :ua, revoked_at = NULL, revoked_reason = NULL WHERE id = :i::uuid", m);
    }

    /** Revoked, never deleted. Mine only; false when it is not this person's. A repeat is a no-op that still answers true. */
    public boolean revoke(UUID id, UUID user) {
        var m = Map.of("i", id.toString(), "u", user.toString());
        boolean mine = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM push_subscription WHERE id = :i::uuid AND app_user_id = :u::uuid)", m, Boolean.class));
        if (mine) jdbc.update("UPDATE push_subscription SET revoked_at = now(), revoked_reason = 'user' WHERE id = :i::uuid AND app_user_id = :u::uuid AND revoked_at IS NULL", m);
        return mine;
    }
}
