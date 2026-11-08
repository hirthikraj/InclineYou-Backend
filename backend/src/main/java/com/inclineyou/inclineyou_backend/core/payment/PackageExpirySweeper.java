package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Closes packs that have run past their end date — the "nightly job" {@link PackageReadService#list} has always
 * named and nothing implemented (V29 has the whole argument).
 *
 * <p>Hourly rather than at midnight, because "today" is each trainer's own and a single run at the server's midnight
 * would be hours late or early for most of them; the function is idempotent, so the runs that find nothing cost one
 * cheap UPDATE. The grace is {@link #GRACE_DAYS}: a pack stays open a week past its end so the sessions in that week
 * can still be marked done against it.
 *
 * <p>The call runs as the SYSTEM actor, set for that call only and put back after — the shape
 * {@code WhatsAppStatusService} uses, because a scheduler thread has no request and so no tenant context.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PackageExpirySweeper {

    /** Today's own unmarked-session window (web `deck.ts`); V29 explains why the two are the same number. */
    static final int GRACE_DAYS = 7;

    private final NamedParameterJdbcTemplate jdbc;

    @Value("${app.packages.expiry-sweep-enabled:true}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT2M")
    public void sweep() {
        if (!enabled) return;
        int closed = closeLapsed();
        if (closed > 0) log.info("closed {} pack(s) past their end date", closed);
    }

    /** Packs closed by this run. Package-private so a test can run it without the scheduler. */
    int closeLapsed() {
        var before = TenantContext.current();
        TenantContext.set(TenantContext.SYSTEM);
        try {
            Integer n = jdbc.queryForObject("SELECT close_lapsed_packages(:grace)", Map.of("grace", GRACE_DAYS),
                    Integer.class);
            return n == null ? 0 : n;
        } finally {
            TenantContext.set(before);
        }
    }
}
