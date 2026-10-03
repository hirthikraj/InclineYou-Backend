package com.inclineyou.inclineyou_backend.core.sessionlog;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.UUID;

/**
 * The few definitions the log's SQL and its services share, in one place.
 *
 * <p><b>The ranking of a set is defined here and nowhere else.</b> Weight × reps ranks by Epley's estimated one-rep
 * max, {@code load × (1 + reps / 30)} — the only e1RM in this codebase; every other kind ranks by its own value
 * (the effort — time, distance, reps — else the load). Both the log's {@code best} and a set write's {@code isBest}
 * read {@link #score}, so the PR flash and the Bests page can never disagree about what beat what.
 */
final class LogSql {

    private LogSql() {}

    /** SQL for a set's ranking value; {@code a} is the alias of the {@code set_log} row. */
    static String score(String a) {
        return "(CASE WHEN " + a + ".load_kind = 'weight' AND " + a + ".effort_kind = 'reps' "
                + "THEN coalesce(" + a + ".load_value, 0) * (1 + coalesce(" + a + ".effort_value, 0) / 30.0) "
                + "ELSE coalesce(" + a + ".effort_value, " + a + ".load_value) END)";
    }

    /** Done weight × reps sets, in kg — the same figure the Schedule row's {@code log.volumeKg} carries. */
    static String volume(String a) {
        return "coalesce(sum(" + a + ".load_value * " + a + ".effort_value) FILTER (WHERE " + a + ".done_at IS NOT NULL "
                + "AND " + a + ".load_kind = 'weight' AND " + a + ".effort_kind = 'reps'), 0)";
    }

    /** A JSON number, never scientific notation ({@code 100.00} → {@code 100}, not {@code 1E+2}). */
    static BigDecimal num(BigDecimal v) {
        if (v == null) return null;
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    static Long ms(Timestamp t) {
        return t == null ? null : t.getTime();
    }

    static String id(UUID u) {
        return u == null ? null : u.toString();
    }

    static UUID uuid(Object o) {
        return o == null ? null : o instanceof UUID u ? u : UUID.fromString(o.toString());
    }
}
