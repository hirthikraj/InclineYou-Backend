package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.util.DateWindow;

import java.time.LocalDate;

/**
 * The day a sold or renewed package may start (decided 9 Nov 2026): within three months of today, either way, on the
 * workspace calendar. Back, because a trainer catching up records "she renewed last month"; ahead, because next
 * month's pack is sometimes sold early. The window itself is {@link DateWindow}, shared with a plan's start. Outside that it is a typo — 2062 for 2026 made a pack that never ran, and
 * 1926 one the hourly sweep closed as lapsed with money owed since then.
 */
final class PackageStartDate {

    static final int MONTHS = DateWindow.MONTHS;

    private PackageStartDate() {}

    /** {@code start} unchanged when it is within the window (or null: the caller defaults it to today); else 400. */
    static LocalDate check(LocalDate start, LocalDate today) {
        return check(start, today, "startDate");
    }

    /**
     * The same window for any of a sale's dates, named in the refusal. {@code dueDate} uses it too (18 Nov 2026): a typo
     * like 2062 made a pack that is never overdue, and 1926 one overdue since then, at the top of Today's money rows.
     */
    static LocalDate check(LocalDate date, LocalDate today, String field) {
        return DateWindow.check(date, today, field);
    }
}
