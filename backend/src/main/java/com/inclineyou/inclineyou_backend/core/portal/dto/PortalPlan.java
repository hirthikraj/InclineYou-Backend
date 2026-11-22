package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.util.List;

/**
 * The client's plan and progress wire (api-contract 1.2, pp-l1 … pp-l4). Counts, never streaks; a weight has no good-or-bad tone, so
 * nothing here says {@code trend: bad}; and there is no body measurement in any of it — a body is measured in an assessment only.
 * Absent values ride as {@code null}, as the contract's examples show.
 */
public final class PortalPlan {

    private PortalPlan() {}

    // ── pp-l1 · what is coming ───────────────────────────────────────────────────────────────────

    /**
     * One place in the program. {@code at} (21 Nov 2026, additive) is the scheduled time of the session that did or is booked for this
     * place, epoch ms — null for a place nothing has reached yet. It is what lets the client's Home draw the week as days (Mon … Sun)
     * rather than a bare count: a done place used to carry no date at all.
     */
    public record Day(String workoutId, Integer week, Integer day, String name, String state, String sessionId, Long at) {}

    public record ProgramArc(String id, String name, int weeks, String status, String startDate, String endDate, int currentWeek, List<Day> days) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Plan(List<PortalHome.SessionCard> upcoming, ProgramArc program) {}

    // ── pp-l2 · past plans ───────────────────────────────────────────────────────────────────────

    public record PastItem(String id, String name, int weeks, String startDate, String endDate, int sessionsDone) {}

    public record PastPage(List<PastItem> items, String nextCursor) {}

    /** One plan, read-only: the days and what is in them, with the trainer's cue to the client and nothing that is the trainer's alone. */
    public record SetPlan(int position, String loadKind, String effortKind, BigDecimal targetLoad, BigDecimal targetEffort, Integer restSeconds) {}

    public record PlanExercise(String id, String exerciseId, String name, String target, String section, String cue, List<SetPlan> sets) {}

    public record PlanWorkout(String id, Integer week, Integer day, String name, List<PlanExercise> exercises) {}

    public record ProgramTree(String id, String name, int weeks, String status, String startDate, String endDate, List<PlanWorkout> workouts) {}

    // ── pp-l3 · progress ─────────────────────────────────────────────────────────────────────────

    public record Point(BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm) {}

    public record BestChange(String exerciseId, String name, BigDecimal changePct, Point from, Point to) {}

    public record Strength(int tracked, int improved, BestChange best) {}

    /**
     * {@code perWeek} is taken over the part of the window the client was training in — from their first session ever, when that is
     * inside the window — and {@code since} is that first session's local date ({@code yyyy-MM-dd}), null when they were already
     * training when the window opened (22 Nov 2026). Divided by the whole window, a client who started in August read 0.6 a week
     * on the year view.
     */
    public record Consistency(int sessionsDone, int trainerLed, int selfRun, BigDecimal perWeek, String since) {}

    public record MilestoneItem(String kind, String label, long at) {}

    /** One calendar week (Monday, the client's zone) of the window: finished sessions and weight × reps moved. */
    public record Week(String start, int sessions, BigDecimal volumeKg) {}

    /**
     * {@code lifts} and {@code weeks} are additive (22 Nov 2026). {@code lifts} is every tracked lift's change over the window,
     * biggest first (the old payload kept only {@code strength.best}); {@code weeks} is the window week by week, empty weeks
     * included, so the client's Progress can draw a rhythm and not only a total.
     */
    public record Progress(int windowDays, Strength strength, Consistency consistency, List<MilestoneItem> milestones,
                           List<BestChange> lifts, List<Week> weeks) {}

    // ── pp-l4 · per exercise ─────────────────────────────────────────────────────────────────────

    public record BestSet(BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm, String on) {}

    public record ExerciseItem(String exerciseId, String name, String target, int sessions, String lastOn, BestSet best) {}

    public record ExercisePage(List<ExerciseItem> items, String nextCursor) {}

    public record ExerciseHead(String id, String name, String logType) {}

    public record SeriesPoint(String on, BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm, BigDecimal volume) {}

    public record Bests(BestSet e1rm, BestSet load) {}

    public record ExerciseSeries(ExerciseHead exercise, List<SeriesPoint> series, Bests bests) {}
}
