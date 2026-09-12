package com.inclineyou.inclineyou_backend.auth;

import com.inclineyou.inclineyou_backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Deletes sessions that have been dead long enough to be uninteresting.
 *
 * <p>Written because {@code otp_request} is the cautionary tale: V1 says that
 * table is "cleaned up by a scheduled job", no such job was ever written, and it
 * has been growing since the first sign-in. A table with a documented sweeper and
 * no sweeper is worse than one with neither, because the comment stops anybody
 * looking.
 *
 * <p>Expired rows are kept for a while on purpose — {@code revoked_at} and
 * {@code last_seen_at} are the only evidence of when a session was used and when
 * it was ended, which is the first thing anybody wants after a security
 * question.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SessionSweeper {

    private final SessionStore sessions;
    private final AppProperties props;

    /** Hourly. There is nothing urgent here; the TTL in Redis does the fast half. */
    @Scheduled(fixedDelayString = "PT1H")
    public void sweep() {
        if (!props.getSession().isSweepEnabled()) return;
        Instant cutoff = Instant.now()
                .minus(props.getSession().getPurgeAfterDays(), ChronoUnit.DAYS);
        int removed = sessions.purgeExpiredBefore(cutoff);
        if (removed > 0) log.info("swept {} expired web sessions", removed);
    }
}
