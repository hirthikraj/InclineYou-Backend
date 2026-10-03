package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/**
 * The active workspace's calendar — where "today" starts and a month ends.
 *
 * <p>The v1 wire takes calendar dates ({@code from=2026-09-01}) rather than epoch
 * ms, because the caller is the Next server and its clock zone is not the
 * trainer's (api-contract R8). So the day boundary is resolved here, from
 * {@code tenant.timezone} — the workspace's clock, not {@code trainer.timezone},
 * because a workspace's books have to close on one calendar (R55).
 *
 * <p>One indexed read by primary key per call. Callers that need the zone more
 * than once in a request take it once and pass it down.
 */
@Component
@RequiredArgsConstructor
public class WorkspaceClock {

    private final TenantJdbcRepository repo;

    public ZoneId zone() {
        var tenantId = CurrentScope.require().activeTenantId();
        String tz = repo.timezone(tenantId);
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException | NullPointerException e) {
            // The column defaults to Asia/Kolkata and nothing writes an unchecked
            // value, but a bad zone must not blank every screen that reads a date.
            return ZoneId.of("Asia/Kolkata");
        }
    }

    /** The active workspace's currency — an aggregate states it, a row carries its own. */
    public String currency() {
        return repo.currency(CurrentScope.require().activeTenantId());
    }

    public static LocalDate today(ZoneId zone) {
        return LocalDate.now(zone);
    }

    /** The first instant of {@code date} in {@code zone}. */
    public static Instant startOf(LocalDate date, ZoneId zone) {
        return date.atStartOfDay(zone).toInstant();
    }

    public static Instant startOf(YearMonth month, ZoneId zone) {
        return startOf(month.atDay(1), zone);
    }

    /**
     * {@code yyyy-MM-dd}, or a 400 {@code VALIDATION} that names the parameter —
     * coded, so the UI can branch on it. Null passes through.
     */
    public static LocalDate parseDate(String value, String param) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDate.parse(value.strip());
        } catch (DateTimeParseException e) {
            throw ApiException.validation(param + ": expected a date as yyyy-MM-dd");
        }
    }
}
