package com.inclineyou.inclineyou_backend.shared.wire;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

/**
 * An opaque keyset cursor: the last row's sort key and its id, base64url.
 *
 * <p>Paging is keyset, never OFFSET (api-contract *Conventions · Lists*), so page
 * 40 costs the same index range scan as page 1 and rows don't shift under
 * inserts. Every list's order ends in {@code id}, which is why the id is always
 * the second half. Opaque to the caller — the only thing it may do is send it
 * back — so the encoding can change without a version bump.
 *
 * @param key the sort value as text: an ISO instant at the database's own
 *            precision, or a {@code yyyy-MM-dd} date. Never epoch ms for a
 *            timestamp: {@code timestamptz} keeps microseconds, and a key cut to
 *            the millisecond would make the resume predicate skip every row in
 *            the lost fraction — rows written in one transaction share now().
 */
public record Cursor(String key, UUID id) {

    public String encode() {
        String raw = key + "|" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static String encode(Object key, String id) {
        return new Cursor(String.valueOf(key), UUID.fromString(id)).encode();
    }

    /** Null for an absent cursor; 400 {@code VALIDATION} for one this server did not make. */
    public static Cursor decode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String text = new String(Base64.getUrlDecoder().decode(raw.strip()), StandardCharsets.UTF_8);
            int bar = text.lastIndexOf('|');
            return new Cursor(text.substring(0, bar), UUID.fromString(text.substring(bar + 1)));
        } catch (IllegalArgumentException | IndexOutOfBoundsException e) {
            throw ApiException.validation("cursor: not a cursor from this list");
        }
    }

    /** The key of a timestamp-ordered list, at full precision. */
    public java.sql.Timestamp keyAsTimestamp() {
        try {
            return java.sql.Timestamp.from(java.time.Instant.parse(key));
        } catch (java.time.format.DateTimeParseException e) {
            throw ApiException.validation("cursor: not a cursor from this list");
        }
    }

    /** The cursor key for a timestamp column — full precision, never truncated to ms. */
    public static String key(java.sql.Timestamp ts) {
        return ts.toInstant().toString();
    }

    // ── a cursor tied to the query that made it ─────────────────────────────

    private static final String MARK_END = "~";

    /**
     * A short, stable mark of a query's order and filters ({@code String.hashCode} is fixed by the JLS),
     * for {@link #encodeFor} and {@link #within}. Pass every parameter that changes which rows come back
     * or in what order, in a fixed position; a null part is written as "null".
     */
    public static String mark(Object... parts) {
        var sb = new StringBuilder();
        for (Object part : parts) sb.append(part).append('|');
        return Integer.toHexString(sb.toString().hashCode());
    }

    /** A cursor that only {@link #within} with the same mark will resume. */
    public static String encodeFor(String mark, Object key, String id) {
        return encode(mark + MARK_END + key, id);
    }

    /**
     * The keyset position inside a cursor made by {@link #encodeFor} with this mark; null for no cursor.
     * A cursor made for another order, window or filter — or by a list that does not mark its cursors — is
     * a 400, rather than a page that starts somewhere arbitrary.
     */
    public static Cursor within(String raw, String mark) {
        Cursor c = decode(raw);
        if (c == null) return null;
        int end = c.key().indexOf(MARK_END);
        if (end < 0 || !c.key().substring(0, end).equals(mark)) {
            throw ApiException.validation("cursor: made for a different order, window or filter — start again without it");
        }
        return new Cursor(c.key().substring(end + 1), c.id());
    }

    /** {@code limit} within [1, max], defaulting when absent. */
    public static int limit(Integer requested, int dflt, int max) {
        if (requested == null) return dflt;
        if (requested < 1) throw ApiException.validation("limit: at least 1");
        if (requested > max) throw ApiException.rangeTooLarge("limit: at most " + max);
        return requested;
    }
}
