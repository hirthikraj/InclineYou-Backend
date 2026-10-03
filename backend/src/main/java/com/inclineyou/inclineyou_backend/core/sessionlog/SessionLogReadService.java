package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.session.SessionReadService;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionLogJdbcRepository.ExRow;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionLogJdbcRepository.Want;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.*;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.id;
import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.ms;

/**
 * What the console draws, in one read (api-contract Log session L2), and the picker's three groups (L1).
 *
 * <p>Last time and best come EMBEDDED, one statement for every exercise, so the console is one request where the
 * MockUI made about nine and the Bests page is a view of the same data. Before the log is opened the exercises are
 * the plan's preview — the same entries with no ids — so a session that has not started can be drawn.
 */
@Service
@RequiredArgsConstructor
public class SessionLogReadService {

    private final SessionLogJdbcRepository repo;
    private final SessionReadService sessions;
    private final WorkspaceClock clock;

    public SessionLog log(UUID trainerId, UUID sessionId) {
        var head = repo.head(trainerId, sessionId, false).orElseThrow(SessionLogReadService::notYours);
        return assemble(trainerId, head, null);
    }

    /** One exercise in the console shape — what every exercise write answers with. */
    public ExerciseEntry entry(UUID trainerId, UUID sessionId, UUID sessionExerciseId) {
        var head = repo.head(trainerId, sessionId, false).orElseThrow(SessionLogReadService::notYours);
        var entries = entries(trainerId, head, sessionExerciseId, clock.zone());
        if (entries.isEmpty()) throw ApiException.notFound("That exercise is not in this session.");
        return entries.getFirst();
    }

    private SessionLog assemble(UUID trainerId, SessionLogJdbcRepository.Head head, UUID only) {
        var row = sessions.one(trainerId, head.id()).orElseThrow(SessionLogReadService::notYours);
        var client = repo.client(trainerId, head.clientId());
        var program = repo.program(head.workoutId()).orElse(null);
        var exercises = entries(trainerId, head, only, clock.zone());
        Totals totals = head.startedAt() != null ? repo.totals(head.id())
                : head.workoutId() != null ? repo.previewTotals(head.workoutId())
                : new Totals(0, 0, BigDecimal.ZERO);
        return new SessionLog(row, client, program, exercises, totals);
    }

    private List<ExerciseEntry> entries(UUID trainerId, SessionLogJdbcRepository.Head head, UUID only, ZoneId zone) {
        boolean started = head.startedAt() != null;
        List<ExRow> rows;
        java.util.Map<UUID, List<SetRow>> sets;
        if (started) {
            rows = repo.exerciseRows(head.id(), only);
            sets = repo.sets(rows.stream().map(ExRow::id).toList());
        } else if (head.workoutId() != null) {
            rows = repo.previewRows(head.workoutId());
            sets = repo.planSets(rows.stream().map(ExRow::id).toList());
        } else {
            return List.of();
        }
        var alts = repo.alternatives(rows.stream().map(ExRow::plannedFrom).filter(java.util.Objects::nonNull).toList());

        // The kinds each movement is being logged in: its first set's, else the usual weight × reps.
        var wants = new ArrayList<Want>();
        for (var r : rows) {
            var s = sets.getOrDefault(r.id(), List.of());
            wants.add(new Want(r.exerciseId(), s.isEmpty() ? "weight" : s.getFirst().loadKind(),
                    s.isEmpty() ? "reps" : s.getFirst().effortKind()));
        }
        var history = repo.history(trainerId, head.id(), head.clientId(), distinct(wants), zone);

        var out = new ArrayList<ExerciseEntry>();
        for (var r : rows) {
            var h = history.get(r.exerciseId());
            out.add(new ExerciseEntry(started ? id(r.id()) : null, id(r.exerciseId()), r.name(), r.equipment(), r.position(),
                    r.section(), id(r.groupId()), r.source(), id(r.plannedFrom()), id(r.swappedFrom()), r.swappedFromName(), r.swapReason(),
                    ms(r.removedAt()), r.notes(), sets.getOrDefault(r.id(), List.of()),
                    r.plannedFrom() == null ? List.<Alternative>of() : alts.getOrDefault(r.plannedFrom(), List.of()), h == null ? null : h.last(), h == null ? null : h.best()));
        }
        return out;
    }

    /** One want per exercise (the history read keys on the exercise), the first kinds seen. */
    private static List<Want> distinct(List<Want> wants) {
        var seen = new java.util.LinkedHashMap<UUID, Want>();
        for (var w : wants) seen.putIfAbsent(w.exerciseId(), w);
        return List.copyOf(seen.values());
    }

    // ── the picker ───────────────────────────────────────────────────────────────────────────────

    /** Who can be logged right now: open logs (any age), today's booked sessions, and every active client for a walk-in. */
    public PickResponse pick(UUID trainerId) {
        ZoneId zone = clock.zone();
        LocalDate today = WorkspaceClock.today(zone);
        Timestamp from = Timestamp.from(WorkspaceClock.startOf(today, zone));
        Timestamp to = Timestamp.from(WorkspaceClock.startOf(today.plusDays(1), zone));
        return new PickResponse(repo.open(trainerId), repo.booked(trainerId, from, to),
                repo.everybody(trainerId, Timestamp.from(Instant.now())));
    }

    static ApiException notYours() {
        return ApiException.notFound("That session is not on your diary.");
    }
}
