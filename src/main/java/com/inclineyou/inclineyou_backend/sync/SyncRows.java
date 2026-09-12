package com.inclineyou.inclineyou_backend.sync;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The row plumbing both sync services share.
 *
 * There are two of them now — the trainer's whole workspace and one client's
 * slice of it (FR-11) — and they disagree about almost everything except how a
 * JDBC row becomes JSON and how a WatermelonDB push is unpacked. That part lives
 * here so the two can never drift, because a difference in this file would show
 * up as a weekday that stops matching or a timestamp off by a factor of 1000,
 * on one half of the product only.
 */
final class SyncRows {

    private SyncRows() {}

    /**
     * Created and updated, appended in that order.
     *
     * The server does not care which is which: every write is an upsert keyed on
     * a client-generated id, so a row that arrives as a create for something
     * that already exists updates it, and one that arrives as an update for
     * something missing inserts it.
     */
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> mergeCreatedUpdated(Map<String, Object> table) {
        var result = new ArrayList<Map<String, Object>>();
        result.addAll((List<Map<String, Object>>) table.getOrDefault("created", List.of()));
        result.addAll((List<Map<String, Object>>) table.getOrDefault("updated", List.of()));
        return result;
    }

    @SuppressWarnings("unchecked")
    static List<String> deletedIds(Map<String, Object> table) {
        return (List<String>) table.getOrDefault("deleted", List.of());
    }

    static String str(Object v) {
        return v == null ? null : v.toString();
    }

    static Timestamp toTimestamp(Object v) {
        if (v instanceof Number n) return Timestamp.from(Instant.ofEpochMilli(n.longValue()));
        return null;
    }

    /** WatermelonDB serialises JSON columns as strings; null is also valid. */
    static String toJsonString(Object v) {
        return v == null ? null : v.toString();
    }

    static Map<String, Object> normalizeRow(Map<String, Object> raw) {
        var out = new LinkedHashMap<String, Object>(raw.size());
        for (var entry : raw.entrySet()) {
            out.put(entry.getKey(), normalizeValue(entry.getValue()));
        }
        return out;
    }

    static Object normalizeValue(Object v) {
        if (v == null)                 return null;
        if (v instanceof UUID u)                      return u.toString();
        if (v instanceof Timestamp ts)                return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)  return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof Date d)                      return d.toString(); // ISO "yyyy-MM-dd"
        if (v instanceof BigDecimal bd) return bd;                    // Jackson serialises fine
        if (v instanceof Boolean || v instanceof String) return v;
        // Every remaining numeric type, by interface rather than by listing the
        // boxes. V10's SMALLINT columns are the reason: depending on the driver
        // an int2 arrives as a Short, which the fallback below would turn into
        // the *string* "360" — and a weekday that is a string silently stops
        // matching anything on the phone.
        if (v instanceof Number n) return n;
        return v.toString(); // PGobject (JSONB) and any other driver type
    }
}
