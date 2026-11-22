package com.inclineyou.inclineyou_backend.shared.util;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.time.LocalDate;

/**
 * A date a trainer types, kept within three months of today either way, on the workspace calendar (decided 9 Nov 2026
 * for a package's start, 18 Nov for its due date and a plan's start). Back, because a trainer catching up records what
 * already happened; ahead, because next month's pack or plan is sometimes set up early. Outside that it is a typo:
 * 2062 for 2026.
 */
public final class DateWindow {

    public static final int MONTHS = 3;

    private DateWindow() {}

    /** {@code date} unchanged when it is within the window (or null: the caller defaults it); else 400 naming {@code field}. */
    public static LocalDate check(LocalDate date, LocalDate today, String field) {
        if (date == null) return null;
        LocalDate first = today.minusMonths(MONTHS), last = today.plusMonths(MONTHS);
        if (date.isBefore(first) || date.isAfter(last)) {
            throw ApiException.validation(field + ": between " + first + " and " + last
                    + " (up to " + MONTHS + " months before or after today)");
        }
        return date;
    }
}
