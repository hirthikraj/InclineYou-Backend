package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.session.SessionBookingService;
import com.inclineyou.inclineyou_backend.core.session.SessionReadService;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.EndRequest;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.SessionLog;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.StartRequest;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.WalkInRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Opening a log, logging someone with no booking, and closing it (api-contract Log session A1 · A2 · A12).
 *
 * <p>The log is the scheduled session (R2/R40): starting stamps {@code started_at} and lays the session's workout down
 * as exercises and planned sets; there is no second row to create and one id throughout. Starting is idempotent — the
 * session row is locked and the stamp is a conditional {@code UPDATE … WHERE started_at IS NULL}, so a double tap or a
 * second tab can never lay the plan down twice.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionStartService {

    private final SessionLogJdbcRepository repo;
    private final SessionLogReadService reads;
    private final SessionBookingService bookings;
    private final SessionReadService sessions;

    /** A clock a little ahead of the server's is not a back-dated request in the future. */
    private static final long SKEW_SECONDS = 60;

    @Transactional
    public SessionLog start(UUID trainerId, UUID sessionId, StartRequest req) {
        Instant at = at(req == null ? null : req.startedAt(), "startedAt");
        startLocked(trainerId, sessionId, at);
        return reads.log(trainerId, sessionId);
    }

    /**
     * Book now and start, in one write. {@code scheduled_at} is the server's clock cut to the minute — never sent, so a
     * slow client clock cannot back-date it, and a client who already has a session starting this minute hits the same
     * unique index a booking does. The booking rules (a client who is paused, archived or removed; the next workout of
     * their program; a replayed id) are {@link SessionBookingService}'s, not copied.
     */
    @Transactional
    public Created<SessionLog> walkIn(UUID trainerId, WalkInRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        long minute = Instant.now().truncatedTo(ChronoUnit.MINUTES).toEpochMilli();
        var booked = bookings.book(trainerId, new SessionBookingService.BookRequest(req.id(), req.clientId(), minute,
                req.durationMinutes(), req.workoutId(), null, null));
        UUID sid = UUID.fromString(booked.session().id());
        startLocked(trainerId, sid, Instant.now());
        return new Created<>(reads.log(trainerId, sid), booked.created());
    }

    /** Idempotent: an already-started session is left alone, so the replay of a walk-in lays nothing down. */
    private void startLocked(UUID trainerId, UUID sessionId, Instant at) {
        var head = repo.head(trainerId, sessionId, true).orElseThrow(SessionLogReadService::notYours);
        if ("cancelled".equals(head.status())) {
            throw ApiException.conflict("SESSION_CANCELLED", "This session was cancelled, so it can't be logged.");
        }
        if ("no_show".equals(head.status())) {
            throw ApiException.conflict("SESSION_NO_SHOW", "This session was marked a no-show, so it can't be logged.");
        }
        if (head.startedAt() != null) return;
        if (repo.stampStarted(sessionId, Timestamp.from(at)) == 1 && head.workoutId() != null) {
            repo.layDownPlan(sessionId);
            log.info("session log opened trainer={} session={} planned={}", trainerId, sessionId, true);
        }
    }

    /**
     * Close the log. Idempotent — an ended log keeps its time. It does not mark the session done or charge the pack;
     * Finish does that next, and Mark done closes an open log itself.
     */
    @Transactional
    public SessionReadService.SessionRow end(UUID trainerId, UUID sessionId, EndRequest req) {
        var head = repo.head(trainerId, sessionId, true).orElseThrow(SessionLogReadService::notYours);
        if (head.startedAt() == null) {
            throw ApiException.conflict("SESSION_NOT_STARTED", "This session's log was never opened, so there is nothing to close.");
        }
        if (head.endedAt() == null) {
            Instant at = at(req == null ? null : req.endedAt(), "endedAt");
            if (at.isBefore(head.startedAt().toInstant())) throw ApiException.validation("endedAt: before the log was opened");
            repo.stampEnded(sessionId, Timestamp.from(at));
        }
        return sessions.one(trainerId, sessionId).orElseThrow(SessionLogReadService::notYours);
    }

    /** The given instant, or now; never in the future. */
    private static Instant at(Long epochMs, String field) {
        Instant now = Instant.now();
        if (epochMs == null) return now;
        Instant at = Instant.ofEpochMilli(epochMs);
        if (at.isAfter(now.plusSeconds(SKEW_SECONDS))) throw ApiException.validation(field + ": in the future");
        return at.isAfter(now) ? now : at;
    }
}
