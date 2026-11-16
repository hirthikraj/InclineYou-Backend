package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.time.LocalDate;

/**
 * The day a sold or renewed package may start (decided 9 Nov 2026): within three months of today, either way, on the
 * workspace calendar. Back, because a trainer catching up records "she renewed last month"; ahead, because next
 * month's pack is sometimes sold early. Outside that it is a typo — 2062 for 2026 made a pack that never ran, and
 * 1926 one the hourly sweep closed as lapsed with money owed since then.
 */
final class PackageStartDate {

    static final int MONTHS = 3;

    private PackageStartDate() {}

    /** {@code start} unchanged when it is within the window (or null: the caller defaults it to today); else 400. */
    static LocalDate check(LocalDate start, LocalDate today) {
        if (start == null) return null;
        LocalDate first = today.minusMonths(MONTHS), last = today.plusMonths(MONTHS);
        if (start.isBefore(first) || start.isAfter(last)) {
            throw ApiException.validation("startDate: between " + first + " and " + last
                    + " (up to " + MONTHS + " months before or after today)");
        }
        return start;
    }
}
