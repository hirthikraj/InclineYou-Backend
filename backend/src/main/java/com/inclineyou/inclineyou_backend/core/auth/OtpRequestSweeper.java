package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * The sweeper {@code otp_request} was promised and never had.
 *
 * <p>{@link SessionSweeper}'s Javadoc names this table as the cautionary tale:
 * V1 said it was "cleaned up by a scheduled job", no such job existed, and every
 * sign-in since the first one has left a phone number behind. The V21 schema
 * review found it still growing, so this is that job.
 *
 * <p>What it must never remove is a row that is still doing work. The send
 * ceiling counts a day of rows and the wrong-attempt lock is mirrored here with
 * a {@code locked_until}; a row younger than {@code purge-after-days}, or one
 * whose lock has not yet run out, is left alone whatever its age.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OtpRequestSweeper {

    private final NamedParameterJdbcTemplate jdbc;
    private final AppProperties props;

    /** Hourly, beside the session sweep, and switched off with it. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    public void sweep() {
        if (!props.getSession().isSweepEnabled()) return;
        Instant cutoff = Instant.now().minus(props.getOtp().getPurgeAfterDays(), ChronoUnit.DAYS);
        int removed = jdbc.update("""
                DELETE FROM otp_request
                WHERE created_at < :cutoff
                  AND (locked_until IS NULL OR locked_until < NOW())
                """, Map.of("cutoff", Timestamp.from(cutoff)));
        if (removed > 0) log.info("swept {} old OTP requests", removed);
    }
}
