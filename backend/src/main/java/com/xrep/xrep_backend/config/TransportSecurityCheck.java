package com.xrep.xrep_backend.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Says in the log whether the database connection is actually encrypted, and
 * refuses to start the one configuration that is unambiguously wrong.
 *
 * <p>Sibling to {@link DatabaseIdentityCheck}, and here for the same reason: the
 * failure is silent. libpq's default {@code sslmode} is {@code prefer}, which
 * negotiates TLS if the server offers it and <b>falls back to plaintext without
 * complaint if it does not</b>. A connection string with no {@code sslmode} at
 * all therefore looks identical whether every row is crossing the network in
 * clear text or not, and no log line anywhere distinguishes them.
 *
 * <p>So the question is asked of Postgres — {@code pg_stat_ssl}, this backend's
 * own row — rather than parsed out of the JDBC URL. Same principle as
 * {@code row_security_active()} next door: the URL says what was requested, the
 * server says what happened, and only the second one is the answer. It also
 * catches the case a URL parse never would, where a pooler or sidecar sits in
 * the middle and terminates TLS a hop early.
 *
 * <h2>Encrypted, and not verified, are different answers</h2>
 *
 * <p>{@code pg_stat_ssl.ssl} being true means the bytes are encrypted. It does
 * <b>not</b> mean the server was authenticated: {@code sslmode=require} encrypts
 * and skips the certificate check entirely, which stops a passive listener and
 * not an active man in the middle. Only {@code verify-full} does both, and
 * Postgres will not tell us which mode the client asked for. That distinction
 * belongs to the deployment checklist, so this logs the fact it can prove and
 * the runbook carries the rest.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TransportSecurityCheck {

    private final NamedParameterJdbcTemplate jdbc;
    private final AppProperties props;

    @PostConstruct
    public void check() {
        Boolean encrypted = databaseConnectionEncrypted();

        if (encrypted == null) {
            log.debug("could not determine whether the database connection is encrypted");
        } else if (encrypted) {
            log.info("Database transport: ENCRYPTED. Confirm the URL says sslmode=verify-full and "
                    + "not merely require — this proves the bytes are encrypted, not that the server "
                    + "was authenticated.");
        } else {
            log.warn("Database transport: PLAINTEXT — every row crosses the network in clear text. "
                    + "Correct for a localhost development database; in a deployed API it means "
                    + "DATABASE_URL is missing sslmode=verify-full, and libpq's default of `prefer` "
                    + "downgraded silently rather than failing.");
        }

        refuseOtpCodesInLogOnARealDeployment(encrypted);
    }

    /**
     * The guard, and the reason this class fails a boot while its sibling only
     * warns.
     *
     * <p>{@code app.otp.dev-codes-in-log} has to default to on, or a fresh clone
     * cannot sign in — and a dangerous default protected by a comment is not
     * protected. The likely path to production is not malice but repair:
     * sign-in throws because no SMS provider is wired, somebody sets
     * {@code sms-enabled: false} to make it work, and every OTP in the system
     * starts flowing into the log aggregator with nothing raising its voice.
     *
     * <p>An encrypted database connection is the signal that closes it. It is
     * true of every real deployment and false on a localhost development
     * database, it needs no new environment variable that a deployment could
     * forget to set, and the two facts together — a networked database, and
     * credentials being printed — have no legitimate combination. Failing here
     * rather than warning is the point: a warning is another line in a log that
     * already contains the codes.
     *
     * <p>Deliberately a startup failure and not a request-time one. The blast
     * radius of getting this wrong grows with every sign-in, so the moment to
     * stop is before the first.
     */
    private void refuseOtpCodesInLogOnARealDeployment(Boolean encrypted) {
        if (!Boolean.TRUE.equals(encrypted)) return;
        if (!props.getOtp().isDevCodesInLog()) return;

        throw new IllegalStateException("""
                Refusing to start: OTP codes would be written to the application log.

                  app.otp.dev-codes-in-log is true, and the database connection is encrypted —
                  which means this is a real deployment, not a localhost development database.
                  Every sign-in code would be logged in clear text and retained by whatever
                  ships these logs.

                Set OTP_DEV_CODES_IN_LOG=false. If sign-in then fails with "no SMS provider is
                wired", that is the honest state of the system and the thing to fix; turning the
                log back on is not a workaround for it.""");
    }

    /** @return true, false, or null when the database could not be asked. */
    private Boolean databaseConnectionEncrypted() {
        try {
            Map<String, Object> row = jdbc.queryForMap(
                    "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()", Map.of());
            return (Boolean) row.get("ssl");
        } catch (RuntimeException e) {
            // A diagnostic must never be the reason a boot fails. The guard
            // above is the one exception, and it only fires on a definite yes.
            return null;
        }
    }
}
