package com.inclineyou.inclineyou_backend.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Says in the log which database identity the request path connected as, and
 * whether row-level security is therefore doing anything.
 *
 * <p>This exists because the failure it catches is silent. Postgres exempts a
 * table's owner from that table's policies, so a pool pointed at {@code inclineyou}
 * instead of {@code inclineyou_app} serves every request with all 45 policies inert —
 * same connection string, same queries, same log lines, no error anywhere. The
 * only way to find it would be a tenant seeing another tenant's rows.
 *
 * <p>{@code row_security_active} is asked rather than inferred from the
 * username, because it is the question that actually matters: it accounts for
 * ownership, for {@code BYPASSRLS} on the role, and for a policy set that was
 * never applied to this table at all.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DatabaseIdentityCheck {

    private final NamedParameterJdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void report() {
        Map<String, Object> row;
        try {
            row = jdbc.queryForMap(
                    "SELECT current_user AS who, row_security_active('client') AS active", Map.of());
        } catch (RuntimeException e) {
            // Never fail a boot over a diagnostic. A database old enough to lack
            // `client` is one Flyway is about to fix or has already refused.
            log.debug("could not determine the database identity", e);
            return;
        }

        String who = String.valueOf(row.get("who"));
        if (Boolean.TRUE.equals(row.get("active"))) {
            log.info("Database identity: {} — row-level security is ACTIVE on the request path.", who);
        } else {
            log.warn("Database identity: {} — row-level security is INERT: this role is exempt from the "
                    + "tenant policies. Correct for Flyway, the seed scripts and the test suite; in a "
                    + "running API it means APP_DB_USERNAME points at the schema owner.", who);
        }
    }
}
