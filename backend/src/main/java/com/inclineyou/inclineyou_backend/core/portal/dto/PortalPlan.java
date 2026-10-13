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

    public record Day(String workoutId, Integer week, Integer day, String name, String state, String sessionId) {}

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

    public record Consistency(int sessionsDone, int trainerLed, int selfRun, BigDecimal perWeek) {}

    public record MilestoneItem(String kind, String label, long at) {}

    public record Progress(int windowDays, Strength strength, Consistency consistency, List<MilestoneItem> milestones) {}

    // ── pp-l4 · per exercise ─────────────────────────────────────────────────────────────────────

    public record BestSet(BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm, String on) {}

    public record ExerciseItem(String exerciseId, String name, String target, int sessions, String lastOn, BestSet best) {}

    public record ExercisePage(List<ExerciseItem> items, String nextCursor) {}

    public record ExerciseHead(String id, String name, String logType) {}

    public record SeriesPoint(String on, BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm, BigDecimal volume) {}

    public record Bests(BestSet e1rm, BestSet load) {}

    public record ExerciseSeries(ExerciseHead exercise, List<SeriesPoint> series, Bests bests) {}
}
