package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * {@code GET /v1/payments/export} — api-contract Business L7: the ledger as CSV.
 *
 * <p>Streamed, in the REQUEST thread. RLS labels the connection per request, so a
 * {@code StreamingResponseBody} on another thread would read with no workspace and
 * correctly see nothing. Instead this walks the ledger's own keyset — 200 rows a
 * page through {@link PackageReadService#payments} — and flushes each page to the
 * response as it arrives, so memory stays flat however long the span and the
 * export can never disagree with the screen's filters and order. Every refusal is
 * decided before the first byte, so a bad range is a clean 400 and not a file cut
 * short.
 *
 * <p>Cells starting with {@code = + - @} are prefixed with an apostrophe: a payment's
 * client name and note are typed by people, and a spreadsheet would run them.
 */
@RestController
@RequiredArgsConstructor
public class PaymentExportController {

    private static final int PAGE = 200;
    private static final String HEADER =
            "bookAt,date,client,package,status,collectedBy,method,reference,amount,gym,trainer,currency,note";

    private final PackageReadService reads;
    private final WorkspaceClock clock;

    @GetMapping("/v1/payments/export")
    public void export(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String collectedBy,
            @RequestParam(required = false) String clientType,
            HttpServletResponse response) throws IOException {
        LocalDate f = WorkspaceClock.parseDate(from, "from");
        LocalDate t = WorkspaceClock.parseDate(to, "to");
        if (f == null || t == null) throw ApiException.validation("from and to: both are required, as yyyy-MM-dd");
        if (!t.isAfter(f)) throw ApiException.validation("to: must be after from");
        if (t.isAfter(f.plusYears(3))) throw ApiException.rangeTooLarge("at most 3 years in one export");

        UUID tid = UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
        // The first page is read BEFORE the headers are committed, so a bad filter value is a 400.
        var first = reads.payments(tid, query(f, t, status, method, clientId, collectedBy, clientType, null));

        response.setStatus(200);
        response.setContentType("text/csv; charset=utf-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"payments-" + f + "-to-" + t + ".csv\"");
        var zone = clock.zone();
        var day = DateTimeFormatter.ISO_LOCAL_DATE.withZone(zone);
        Writer w = new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8);
        w.write(HEADER);
        w.write("\r\n");
        var page = first;
        while (true) {
            for (var r : page.items()) {
                w.write(String.join(",",
                        String.valueOf(r.bookAt()),
                        day.format(Instant.ofEpochMilli(r.bookAt())),
                        cell(r.clientName()), cell(r.packageName()), cell(r.status()), cell(r.collectedBy()),
                        cell(r.method()), cell(r.reference()), r.amount(),
                        r.split() == null ? "" : r.split().gym(),
                        r.split() == null ? "" : r.split().trainer(),
                        cell(r.currency()), cell(r.note())));
                w.write("\r\n");
            }
            w.flush();
            if (page.nextCursor() == null) break;
            page = reads.payments(tid, query(f, t, status, method, clientId, collectedBy, clientType, page.nextCursor()));
        }
        w.flush();
    }

    private static PackageReadService.LedgerQuery query(LocalDate f, LocalDate t, String status, String method,
                                                        String clientId, String collectedBy, String clientType,
                                                        String cursor) {
        return new PackageReadService.LedgerQuery(status, f.toString(), t.toString(), method, clientId, null,
                collectedBy, clientType, PAGE, cursor, false);
    }

    /** RFC 4180 quoting plus the spreadsheet-formula guard. */
    static String cell(String v) {
        if (v == null || v.isEmpty()) return "";
        if ("=+-@".indexOf(v.charAt(0)) >= 0) v = "'" + v;
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
