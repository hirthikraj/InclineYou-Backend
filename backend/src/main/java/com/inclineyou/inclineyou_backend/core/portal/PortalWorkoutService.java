package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.exercise.LogTypes;
import com.inclineyou.inclineyou_backend.core.portal.PortalWorkoutJdbcRepository.LogRow;
import com.inclineyou.inclineyou_backend.core.portal.PortalWorkoutJdbcRepository.SessionRow;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalWorkout;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalWorkoutRequests;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionLogJdbcRepository;
import com.inclineyou.inclineyou_backend.core.sessionlog.SessionLogJdbcRepository.Want;
import com.inclineyou.inclineyou_backend.core.sessionlog.SetLogService;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.AddSetRequest;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.Alternative;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.SetRow;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.Totals;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The client's workout (api-contract 1.2, pw-*, pp-l6): preview a program day, start a self-run, log it, swap a movement, finish it and
 * say how it felt, and list what was done.
 *
 * <p><b>A client logs only their own self-run day.</b> A trainer-led session is read here and never written: every write finds the
 * session through the client's own lens, then refuses a trainer-led one as {@code 422 SESSION_READ_ONLY}. The set writes are the
 * trainer console's own ({@code SetLogService}) run under the client's coach with {@code entered_by = client}, so what a set accepts and
 * what counts as a personal best cannot differ between the two screens.
 */
@Service
@RequiredArgsConstructor
public class PortalWorkoutService {

    private static final int MAX_SETS = 50;
    private static final int[] MILESTONES = {1, 10, 25, 50, 100, 250, 500, 1000};

    private final PortalWorkoutJdbcRepository repo;
    private final SessionLogJdbcRepository log;
    private final SetLogService sets;
    private final PortalAccess access;

    // ── preview ──────────────────────────────────────────────────────────────────────────────────

    public PortalWorkout.Preview preview(String phone, UUID workoutId) {
        UUID client = access.clientId(phone);
        var day = repo.planDay(client, workoutId).orElseThrow(() -> ApiException.notFound("That workout is not in your plan."));
        var rows = repo.planRows(workoutId);
        var ids = rows.stream().map(PortalWorkoutJdbcRepository.PlanRow::id).toList();
        var planSets = log.planSets(ids);
        var alts = log.alternatives(ids);
        var history = log.history(repo.trainerOf(client), null, client, wants(rows, planSets), ZoneId.of(repo.zoneOf(client)));

        var out = new ArrayList<PortalWorkout.PreviewExercise>();
        int seconds = 0;
        for (var r : rows) {
            var ps = new ArrayList<PortalWorkout.PreviewSet>();
            for (SetRow s : planSets.getOrDefault(r.id(), List.of())) {
                var t = s.target();
                ps.add(new PortalWorkout.PreviewSet(s.position(), s.loadKind(), s.effortKind(), t == null ? null : t.load(), t == null ? null : t.effort(),
                        t == null ? null : t.restSeconds()));
                seconds += (t == null || t.restSeconds() == null ? 60 : t.restSeconds()) + 40;
            }
            var h = history.get(r.exerciseId());
            out.add(new PortalWorkout.PreviewExercise(r.id().toString(), r.exerciseId().toString(), r.name(), r.equipment(), r.target(), r.position(),
                    r.section(), r.groupId() == null ? null : r.groupId().toString(), blankToNull(r.cue()), steps(r.description()), ps,
                    approved(alts.get(r.id()), r.exerciseId()), h == null ? null : h.last()));
        }
        boolean startable = "active".equals(day.programStatus()) && !repo.trainerSessionBooked(client, workoutId, Instant.now());
        var inProgress = repo.resumable(client, workoutId).map(id -> new PortalWorkout.InProgress(id.toString())).orElse(null);
        return new PortalWorkout.Preview(new PortalWorkout.WorkoutHead(day.workoutId().toString(), day.name(), day.week(), day.day(), estimate(seconds)),
                new PortalWorkout.ProgramHead(day.programId().toString(), day.programName(), day.weeks()), startable, inProgress, out);
    }

    // ── start ────────────────────────────────────────────────────────────────────────────────────

    /** 201 for a new self-run, 200 when it resumes the client's own (same id, or another id for a day already started). */
    @Transactional
    public Started start(String phone, PortalWorkoutRequests.Start req) {
        UUID client = access.clientId(phone);
        UUID id = uuid(req.id(), "id");
        UUID workoutId = uuid(req.workoutId(), "workoutId");
        repo.lockStarts(client);

        var existing = repo.session(client, id, false);
        if (existing.isPresent()) {
            var s = existing.get();
            if (!"client".equals(s.loggedBy())) throw ApiException.idConflict();
            if ("done".equals(s.status())) throw ApiException.conflict("SESSION_DONE", "That workout is already finished.");
            return new Started(view(client, s, null), false);
        }
        if (repo.idTaken(id)) throw ApiException.idConflict();

        var day = repo.planDay(client, workoutId)
                .orElseThrow(() -> ApiException.conflict("WORKOUT_NOT_STARTABLE", "That workout isn't in your plan."));
        var resume = repo.resumable(client, workoutId);
        if (resume.isPresent()) return new Started(view(client, repo.session(client, resume.get(), false).orElseThrow(), null), false);
        if (!"active".equals(day.programStatus())) {
            throw ApiException.conflict("WORKOUT_NOT_STARTABLE", "This plan isn't active right now. Ask your trainer.");
        }
        if (repo.trainerSessionBooked(client, workoutId, Instant.now())) {
            throw ApiException.conflict("WORKOUT_NOT_STARTABLE", "Your trainer has this day booked — they'll log it with you.");
        }
        int seconds = 0;
        for (var set : log.planSets(repo.planRows(workoutId).stream().map(PortalWorkoutJdbcRepository.PlanRow::id).toList()).values().stream().flatMap(List::stream).toList()) {
            seconds += (set.target() == null || set.target().restSeconds() == null ? 60 : set.target().restSeconds()) + 40;
        }
        repo.insertSelfRun(id, repo.trainerOf(client), client, workoutId, Math.min(480, estimate(seconds)));
        repo.layDownPlan(id);
        return new Started(view(client, repo.session(client, id, false).orElseThrow(), null), true);
    }

    public record Started(PortalWorkout.Log log, boolean created) {}

    // ── the log ──────────────────────────────────────────────────────────────────────────────────

    public PortalWorkout.Log log(String phone, UUID sessionId) {
        UUID client = access.clientId(phone);
        return view(client, repo.session(client, sessionId, false).orElseThrow(PortalWorkoutService::notYours), null);
    }

    private PortalWorkout.Log view(UUID client, SessionRow s, UUID only) {
        var rows = repo.logRows(client, s.id(), only);
        var sets = log.sets(rows.stream().map(LogRow::id).toList());
        var alts = log.alternatives(rows.stream().map(LogRow::plannedFrom).filter(java.util.Objects::nonNull).toList());
        var wantList = new ArrayList<Want>();
        var seen = new LinkedHashMap<UUID, Want>();
        for (var r : rows) {
            var first = sets.getOrDefault(r.id(), List.of()).stream().findFirst();
            seen.putIfAbsent(r.exerciseId(), new Want(r.exerciseId(), first.map(SetRow::loadKind).orElse("weight"), first.map(SetRow::effortKind).orElse("reps")));
        }
        wantList.addAll(seen.values());
        var history = log.history(s.trainerId(), s.id(), client, wantList, ZoneId.of(repo.zoneOf(client)));

        var exercises = new ArrayList<PortalWorkout.LogExercise>();
        for (var r : rows) {
            var h = history.get(r.exerciseId());
            exercises.add(new PortalWorkout.LogExercise(r.id().toString(), r.exerciseId().toString(), r.name(), r.position(), r.section(),
                    r.groupId() == null ? null : r.groupId().toString(), r.source(),
                    r.swappedFrom() == null ? null : new PortalWorkout.Original(r.swappedFrom().toString(), r.swappedFromName()), r.swapSource(), r.swapReason(),
                    r.removedAt() == null ? null : r.removedAt().getTime(), blankToNull(r.cue()), steps(r.description()), sets.getOrDefault(r.id(), List.of()),
                    r.plannedFrom() == null ? List.of() : approved(alts.get(r.plannedFrom()), r.exerciseId()), h == null ? null : h.last()));
        }
        var head = new PortalWorkout.SessionHead(s.id().toString(), s.loggedBy(), s.status(), s.startedAt() == null ? null : s.startedAt().getTime(),
                s.endedAt() == null ? null : s.endedAt().getTime(), s.pausedSeconds(),
                s.workoutId() == null ? null : new PortalWorkout.WorkoutRef(s.workoutId().toString(), s.workoutName(), s.week(), s.day()), String.valueOf(s.version()));
        return new PortalWorkout.Log(head, !"client".equals(s.loggedBy()), exercises, log.totals(s.id()), repo.autoRestTimer(client),
                repo.feedback(client, s.id()).orElse(null), repo.recap(client, s.id()).orElse(null));
    }

    // ── set writes ───────────────────────────────────────────────────────────────────────────────

    @Transactional
    public PortalWorkout.SetAnswer patchSet(String phone, UUID sessionId, UUID setId, Map<String, Object> body) {
        UUID client = access.clientId(phone);
        var s = ownOpen(client, sessionId);
        var w = sets.patch(s.trainerId(), sessionId, setId, body);
        return new PortalWorkout.SetAnswer(w.set(), w.totals(), w.isBest(), String.valueOf(repo.session(client, sessionId, false).orElseThrow().version()));
    }

    @Transactional
    public Added addSet(String phone, UUID sessionId, UUID sxId, AddSetRequest req) {
        UUID client = access.clientId(phone);
        var s = ownOpen(client, sessionId);
        var made = sets.add(s.trainerId(), sessionId, sxId, req, "client");
        return new Added(new PortalWorkout.SetAdded(made.body().set(), made.body().totals()), made.created());
    }

    public record Added(PortalWorkout.SetAdded body, boolean created) {}

    @Transactional
    public PortalWorkout.SessionHead pause(String phone, UUID sessionId, PortalWorkoutRequests.Pause req) {
        UUID client = access.clientId(phone);
        var s = ownOpen(client, sessionId);
        if (req.pausedSeconds() != null) repo.setPaused(s.id(), req.pausedSeconds());
        return view(client, repo.session(client, sessionId, false).orElseThrow(), null).session();
    }

    // ── swap ─────────────────────────────────────────────────────────────────────────────────────

    public List<PortalWorkout.LibraryAlt> alternatives(String phone, UUID exerciseId, UUID sessionId, int limit) {
        UUID client = access.clientId(phone);
        if (!repo.exerciseExists(exerciseId)) throw ApiException.notFound("That exercise isn't available to you.");
        if (sessionId != null) repo.session(client, sessionId, false).orElseThrow(PortalWorkoutService::notYours);
        return repo.libraryAlternatives(exerciseId, sessionId, Math.max(1, Math.min(limit, 20)));
    }

    @Transactional
    public PortalWorkout.Swapped swap(String phone, UUID sessionId, UUID sxId, PortalWorkoutRequests.Swap req) {
        UUID client = access.clientId(phone);
        var s = ownOpen(client, sessionId);
        UUID to = uuid(req.toExerciseId(), "toExerciseId");
        var sx = repo.lockExercise(client, sessionId, sxId).orElseThrow(() -> ApiException.notFound("That exercise isn't in this session."));
        if (sx.removedAt() != null) throw ApiException.conflict("EXERCISE_REMOVED", "That exercise was removed from the session.");
        var target = repo.visibleExercise(to).orElseThrow(() -> ApiException.notFound("That exercise isn't available to you."));

        // Idempotent by target state: already swapped to it, so nothing is touched and the entry comes back as it stands.
        if (to.equals(sx.exerciseId())) return new PortalWorkout.Swapped(view(client, s, sx.id()).exercises().getFirst(), log.totals(sessionId));

        String source = req.source() == null ? "library" : req.source();
        UUID planRow = null;
        if ("approved".equals(source)) {
            planRow = repo.approvedRow(sx.plannedFrom(), to).orElseThrow(() -> ApiException.validation("toExerciseId: not one your trainer approved for this exercise"));
        }
        if (repo.liveInSession(sessionId, to)) throw ApiException.conflict("EXERCISE_IN_SESSION", "That exercise is already in this session.");

        // The original is remembered across swaps; swapping back to it forgets the swap.
        UUID swappedFrom = to.equals(sx.swappedFrom()) ? null : sx.swappedFrom() != null ? sx.swappedFrom() : sx.exerciseId();
        int done = repo.maxDonePosition(sx.id());
        if (planRow != null) {
            if (done + repo.planSetCount(planRow) > MAX_SETS) throw ApiException.conflict("SET_LIMIT", "That would put more than " + MAX_SETS + " sets on one exercise.");
        }
        var pending = repo.pendingSets(sx.id());
        repo.swap(sx.id(), to, planRow != null ? planRow : sx.plannedFrom(), swappedFrom, source, req.reason());
        repo.deleteNotDoneSets(sx.id());
        if (planRow != null) {
            repo.insertSetsFromPlan(sx.id(), planRow, done);
        } else {
            // A library movement starts with the planned sets copied across: the targets stay when the way it is counted is the same, and
            // the sets start empty (rest kept) when it is not — a plank is not logged in kilograms.
            var kinds = LogTypes.kindsOf(target[1]);
            int position = done;
            for (var p : pending) {
                boolean same = kinds.loadKind().equals(p.loadKind()) && kinds.effortKind().equals(p.effortKind());
                repo.insertPlannedSet(sx.id(), ++position, p, kinds.loadKind(), kinds.effortKind(), same);
            }
        }
        return new PortalWorkout.Swapped(view(client, repo.session(client, sessionId, false).orElseThrow(), sx.id()).exercises().getFirst(), log.totals(sessionId));
    }

    // ── finish & feedback ────────────────────────────────────────────────────────────────────────

    /** Idempotent: a second finish answers the same summary and fires nothing again. */
    @Transactional
    public PortalWorkout.Finished finish(String phone, UUID sessionId, PortalWorkoutRequests.Finish req) {
        UUID client = access.clientId(phone);
        var s = repo.session(client, sessionId, true).orElseThrow(PortalWorkoutService::notYours);
        if (!"client".equals(s.loggedBy())) throw readOnly();
        if ("done".equals(s.status())) return finished(client, s, repo.milestonesAt(client, s.endedAt().toInstant()), repo.feedback(client, sessionId).orElse(null));

        if (repo.setsDone(client, sessionId) == 0) {
            throw ApiException.conflict("NOTHING_LOGGED", "Log at least one set before you finish — or leave it, and it won't show up anywhere.");
        }
        repo.markDone(sessionId, req == null ? null : req.pausedSeconds());
        var done = repo.session(client, sessionId, false).orElseThrow();

        var feedback = repo.feedback(client, sessionId).orElse(null);
        if (req != null && (req.effort() != null || req.note() != null)) {
            String note = req.note() == null || req.note().isBlank() ? null : req.note().strip();
            if (req.effort() != null || note != null) feedback = repo.upsertFeedback(client, sessionId, req.effort(), note).orElse(null);
        }

        var bests = repo.newBests(client, sessionId, done.startedAt().toInstant());
        int n = repo.doneCount(client);
        var marks = new ArrayList<Map<String, Object>>();
        for (int m : MILESTONES) {
            if (m == n) marks.add(Map.of("kind", "sessions_" + m, "label", m == 1 ? "Your first session" : ordinal(m) + " session", "value", m));
        }
        String bestText = bests.size() == 1 ? "New best: " + bests.getFirst().name() : "New bests on " + bests.size() + " exercises";
        var made = repo.finishExtras(sessionId, marks, bestText, bests.size());
        return finished(client, done, made, feedback);
    }

    private PortalWorkout.Finished finished(UUID client, SessionRow s, List<PortalWorkout.Milestone> milestones, PortalWorkout.Feedback feedback) {
        Totals t = log.totals(s.id());
        long seconds = Math.max(0, (s.endedAt().getTime() - s.startedAt().getTime()) / 1000 - s.pausedSeconds());
        var summary = new PortalWorkout.Summary((int) seconds, t.setsDone(), t.setsPlanned(), t.volumeKg(),
                repo.newBests(client, s.id(), s.startedAt().toInstant()), milestones);
        return new PortalWorkout.Finished(new PortalWorkout.FinishedSession(s.id().toString(), s.status(), s.endedAt().getTime(), String.valueOf(s.version())), summary, feedback);
    }

    /** Add or change how it felt afterwards. A finished session of either kind: the client's answer about a trainer's session is theirs to give. */
    @Transactional
    public PortalWorkout.Feedback feedback(String phone, UUID sessionId, PortalWorkoutRequests.Feedback req) {
        UUID client = access.clientId(phone);
        var s = repo.session(client, sessionId, false).orElseThrow(PortalWorkoutService::notYours);
        if (!"done".equals(s.status())) throw ApiException.conflict("SESSION_NOT_DONE", "Finish the workout first.");
        String note = req.note() == null || req.note().isBlank() ? null : req.note().strip();
        return repo.upsertFeedback(client, sessionId, req.effort(), note).orElseThrow();
    }

    // ── the list ─────────────────────────────────────────────────────────────────────────────────

    public PortalWorkout.ListPage list(String phone, String state, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        if (state != null && !"done".equals(state)) throw ApiException.validation("state: done is the only one in this release");
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        var rows = repo.listDone(client, cursor == null ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = more ? Cursor.encode(Cursor.key(page.getLast().at()), page.getLast().item().id()) : null;
        return new PortalWorkout.ListPage(page.stream().map(PortalWorkoutJdbcRepository.ListRow::item).toList(), next);
    }

    // ── internals ────────────────────────────────────────────────────────────────────────────────

    /** The client's own self-run, open: a trainer-led session is read-only and a finished self-run is final. */
    private SessionRow ownOpen(UUID client, UUID sessionId) {
        var s = repo.session(client, sessionId, true).orElseThrow(PortalWorkoutService::notYours);
        if (!"client".equals(s.loggedBy())) throw readOnly();
        if ("done".equals(s.status())) throw ApiException.conflict("SESSION_DONE", "That workout is finished.");
        return s;
    }

    private static ApiException readOnly() {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "SESSION_READ_ONLY", "Your trainer logs this session — you can read it, not change it.");
    }

    private static ApiException notYours() {
        return ApiException.notFound("That session isn't yours.");
    }

    private static UUID uuid(String raw, String field) {
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    private static List<Want> wants(List<PortalWorkoutJdbcRepository.PlanRow> rows, Map<UUID, List<SetRow>> planSets) {
        var seen = new LinkedHashMap<UUID, Want>();
        for (var r : rows) {
            var first = planSets.getOrDefault(r.id(), List.of()).stream().findFirst();
            seen.putIfAbsent(r.exerciseId(), new Want(r.exerciseId(), first.map(SetRow::loadKind).orElse("weight"), first.map(SetRow::effortKind).orElse("reps")));
        }
        return List.copyOf(seen.values());
    }

    private static List<PortalWorkout.Alt> approved(List<Alternative> alts, UUID current) {
        if (alts == null) return List.of();
        return alts.stream().filter(a -> !a.exerciseId().equals(current.toString())).limit(2)
                .map(a -> new PortalWorkout.Alt(a.exerciseId(), a.name(), "approved")).toList();
    }

    /** The exercise's description as steps: paragraphs, blank-line separated. Text only. */
    static List<String> steps(String description) {
        if (description == null || description.isBlank()) return List.of();
        return java.util.Arrays.stream(description.split("\\R\\s*\\R")).map(String::strip).filter(x -> !x.isEmpty()).toList();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    /** About how long a day is: each set's rest plus forty seconds of work, to the nearest five minutes, never under ten (Home's own rule). */
    static int estimate(int seconds) {
        return Math.max(10, (int) (Math.round(seconds / 60.0 / 5.0) * 5));
    }

    private static String ordinal(int n) {
        int mod100 = n % 100;
        String suffix = mod100 >= 11 && mod100 <= 13 ? "th" : switch (n % 10) { case 1 -> "st"; case 2 -> "nd"; case 3 -> "rd"; default -> "th"; };
        return n + suffix;
    }
}
