package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMoney;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The SQL behind the client's package and money. Packages come through {@code client_package_balance()} (V11) — sessions, dates and status for
 * the client's own rows WHATEVER the money switch says, because a policy cannot hide a column — and everything with a price goes through the
 * client lens, whose policies are the switch. Each statement names the client's id too, so the two walls fail separately.
 */
@Repository
@RequiredArgsConstructor
public class PortalMoneyJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    public UUID trainerOf(UUID client) {
        return UUID.fromString(jdbc.queryForObject("SELECT trainer_id::text FROM client WHERE id = :c::uuid", p(client), String.class));
    }

    public String zoneOf(UUID client) {
        var z = jdbc.queryForList("SELECT timezone FROM client WHERE id = :c::uuid", p(client), String.class);
        return z.isEmpty() || z.getFirst() == null ? "Asia/Kolkata" : z.getFirst();
    }

    public boolean moneyVisible(UUID client) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT client_can_see_money(:c::uuid)", p(client), Boolean.class));
    }

    /** Every package of the client (up to twenty, active first, then newest) as the balance function answers them. */
    public JsonNode balances(UUID client) {
        return JSON.readTree(jdbc.queryForObject("SELECT client_package_balance(:c::uuid)::text", p(client), String.class));
    }

    /** The adjustment ledger, newest first, up to fifty; a charge that was taken back is not a session used. Behind the money switch. */
    public List<PortalMoney.Entry> history(UUID client) {
        return jdbc.query("""
                SELECT effective_at, kind, sessions, days FROM package_adjustment
                 WHERE client_id = :c::uuid AND reversed_at IS NULL
                 ORDER BY effective_at DESC, id DESC LIMIT 50""", p(client),
                (rs, i) -> new PortalMoney.Entry(rs.getTimestamp("effective_at").getTime(), rs.getString("kind"),
                        rs.getInt("sessions") == 0 ? null : rs.getInt("sessions"), rs.getInt("days") == 0 ? null : rs.getInt("days")));
    }

    public String currency(UUID client) {
        var c = jdbc.queryForList("SELECT currency FROM package WHERE client_id = :c::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", p(client), String.class);
        return c.isEmpty() ? "INR" : c.getFirst();
    }

    public record PaymentRow(PortalMoney.Payment item, Timestamp paidAt) {}

    /** What the trainer recorded as collected for this client, newest first by {@code (paid_at, id)}. A pending, written-off or refunded row is not here. */
    public List<PaymentRow> payments(UUID client, String zone, Timestamp beforeAt, UUID beforeId, int limit) {
        var m = p(client);
        m.put("tz", zone);
        m.put("at", beforeAt);
        m.put("id", beforeId == null ? null : beforeId.toString());
        m.put("n", limit);
        return jdbc.query("""
                SELECT y.id::text AS id, (y.paid_at AT TIME ZONE :tz)::date::text AS paid_on, y.paid_at, y.amount, y.method, y.reference, k.name, y.status
                  FROM payment y JOIN package k ON k.id = y.package_id
                 WHERE y.client_id = :c::uuid AND y.status = 'paid' AND y.deleted_at IS NULL
                   AND (CAST(:at AS timestamptz) IS NULL OR (y.paid_at, y.id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY y.paid_at DESC, y.id DESC LIMIT :n""", m,
                (rs, i) -> new PaymentRow(new PortalMoney.Payment(rs.getString("id"), rs.getString("paid_on"), rs.getBigDecimal("amount").setScale(2).toPlainString(),
                        rs.getString("method"), rs.getString("reference"), rs.getString("name"), rs.getString("status")), rs.getTimestamp("paid_at")));
    }

    public static List<JsonNode> list(JsonNode array) {
        var out = new ArrayList<JsonNode>();
        array.forEach(out::add);
        return out;
    }
}
