package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.inclineyou.inclineyou_backend.core.sessionlog.dto.LastSets;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.SetRow;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.Totals;

import java.math.BigDecimal;
import java.util.List;

/**
 * The client's workout wire (api-contract 1.2, pw-l1 … pw-a6): the preview of a program day, the log a player draws, and what finishing
 * answers. Text only — there is no media on an exercise — and a client's own numbers are never hidden by {@code hideWeight}, which is
 * the body-weight metric's switch alone. Absent values ride as {@code null} here, as the contract's examples show.
 */
public final class PortalWorkout {

    private PortalWorkout() {}

    public record Alt(String exerciseId, String name, String source) {}

    /** A library movement for the swap sheet: what it is, what it trains and what it is done with. */
    public record LibraryAlt(String exerciseId, String name, String equipment, String target, String source) {}

    // ── the preview (pw-l1) ──────────────────────────────────────────────────────────────────────

    public record WorkoutHead(String id, String name, Integer week, Integer day, int estimatedMinutes) {}

    public record ProgramHead(String id, String name, int weeks) {}

    public record InProgress(String sessionId) {}

    public record PreviewSet(int position, String loadKind, String effortKind, BigDecimal targetLoad, BigDecimal targetEffort, Integer restSeconds) {}

    public record PreviewExercise(String id, String exerciseId, String name, String equipment, String target, int position, String section,
                                  String groupId, String cue, List<String> steps, List<PreviewSet> sets, List<Alt> alternatives, LastSets last) {}

    public record Preview(WorkoutHead workout, ProgramHead program, boolean startable, InProgress inProgress, List<PreviewExercise> exercises) {}

    // ── the log (pw-l2) ──────────────────────────────────────────────────────────────────────────

    public record WorkoutRef(String id, String name, Integer week, Integer day) {}

    public record SessionHead(String id, String loggedBy, String status, Long startedAt, Long endedAt, int pausedSeconds, WorkoutRef workout,
                              String version) {}

    public record Original(String exerciseId, String name) {}

    public record LogExercise(String id, String exerciseId, String name, int position, String section, String groupId, String source,
                              Original swappedFrom, String swapSource, String swapReason, Long removedAt, String cue, List<String> steps,
                              List<SetRow> sets, List<Alt> alternatives, LastSets last) {}

    public record Feedback(String effort, String note, long at) {}

    public record Recap(String id, String body, Long readAt) {}

    public record Log(SessionHead session, boolean readOnly, List<LogExercise> exercises, Totals totals, boolean autoRestTimer,
                      Feedback feedback, Recap recap) {}

    // ── writes ───────────────────────────────────────────────────────────────────────────────────

    /** The answer to a set write: the set, the session's new totals, whether it beat the client's best, and the session's version. */
    public record SetAnswer(SetRow set, Totals totals, boolean isBest, String version) {}

    public record SetAdded(SetRow set, Totals totals) {}

    public record Swapped(LogExercise exercise, Totals totals) {}

    // ── finishing (pw-a6) ────────────────────────────────────────────────────────────────────────

    public record NewBest(String exerciseId, String name, BigDecimal loadValue, BigDecimal effortValue, BigDecimal e1rm, BigDecimal previousE1rm) {}

    public record Milestone(String kind, String label) {}

    public record Summary(int durationSeconds, int setsDone, int setsPlanned, BigDecimal volumeKg, List<NewBest> newBests, List<Milestone> milestones) {}

    public record Finished(FinishedSession session, Summary summary, Feedback feedback) {}

    public record FinishedSession(String id, String status, Long endedAt, String version) {}

    // ── the list (pp-l6) ─────────────────────────────────────────────────────────────────────────

    public record ListItem(String id, String loggedBy, long at, String workoutName, int setsDone, BigDecimal volumeKg, int newBests, boolean recapUnread) {}

    public record ListPage(List<ListItem> items, String nextCursor) {}
}
