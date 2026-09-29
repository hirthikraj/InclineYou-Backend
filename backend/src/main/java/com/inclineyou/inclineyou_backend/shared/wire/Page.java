package com.inclineyou.inclineyou_backend.shared.wire;

import java.util.List;

/**
 * A keyset-paged list — {@code {"items": […], "nextCursor": …}}. A null
 * {@code nextCursor} means this was the last page; a non-null one is sent back as
 * {@code cursor} for the next.
 */
public record Page<T>(List<T> items, String nextCursor) {

    /**
     * Cut a page from rows fetched with {@code LIMIT limit + 1}: the extra row, if
     * it came back, is the proof there is more, and the cursor is built from the
     * last row actually returned.
     */
    public static <T> Page<T> of(List<T> fetched, int limit, java.util.function.Function<T, String> cursorOf) {
        if (fetched.size() <= limit) return new Page<>(fetched, null);
        List<T> page = List.copyOf(fetched.subList(0, limit));
        return new Page<>(page, cursorOf.apply(page.getLast()));
    }
}
