package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Forgets join requests nobody needs any more (V45 §7): declined ones 30 days after the decision, unanswered ones 30 days after
 * they were made, everything in a closed workspace. Approved ones already hold no person. Runs as SYSTEM, the
 * {@code PackageExpirySweeper} shape.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JoinRequestSweeper {

    private final JoinJdbcRepository repo;

    @Value("${app.join.purge-enabled:true}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT5M")
    public void sweep() {
        if (!enabled) return;
        int n = purge();
        if (n > 0) log.info("purged {} old join request(s)", n);
    }

    int purge() {
        var before = TenantContext.current();
        TenantContext.set(TenantContext.SYSTEM);
        try {
            return repo.purge();
        } finally {
            TenantContext.set(before);
        }
    }
}
