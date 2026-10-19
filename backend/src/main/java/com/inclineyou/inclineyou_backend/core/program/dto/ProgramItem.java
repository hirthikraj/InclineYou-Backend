package com.inclineyou.inclineyou_backend.core.program.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * A program on the 1.1 wire (Programs L1–L3): one shape for a summary and for
 * the whole tree, so the shelf, the builder's first read and a save's answer are
 * the same object with more or less of it filled in.
 *
 * <p>The optional blocks — {@code progress}, {@code workouts}, {@code exercises},
 * {@code linkedSessions} — are dropped when absent rather than sent as null,
 * which is what tells a list read from a detail read. Everything else is always
 * present, null included: the UI types {@code clientId: string | null}, and an
 * absent key is not a null.
 */
public record ProgramItem(
        String id, String origin, String clientId, ClientRef client, String name, String goal, String description,
        int weeks, int days, String status, String startDate, String endDate, String copiedFromProgramId,
        Long syncedAt,
        /* epoch ms; also the version If-Match carries */
        long revisedAt, String version,
        int workoutCount, int exerciseCount, CopiedFrom copiedFrom, boolean behind,
        /* a template's copies onto clients, lifetime — 0 on a plan and on a library program */
        int assignedCount,
        long createdAt, long updatedAt, Certified certified, Mine mine,
        @JsonInclude(JsonInclude.Include.NON_NULL) Progress progress,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<PlanWorkout> workouts,
        @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, ExerciseRef> exercises,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer linkedSessions
) {
    public record ClientRef(String id, String name) {}

    public record CopiedFrom(String id, String name, long revisedAt) {}

    public record Certified(String summary, String level, String equipment, Long reviewedAt, boolean isSample,
                            int usedCount) {}

    /** The trainer's own copy of a library program, if they made one. */
    public record Mine(String id, long copiedAt, boolean stale) {}

    public record Progress(int sessionsDone, int sessionsPlanned, Integer currentWeek) {}

    /**
     * A program as one database row describes it. {@code clientId}, {@code copiedFromProgramId} and {@code version} are derived
     * from what is passed, so they cannot disagree with it. What a row cannot say starts empty and is filled by the
     * {@code with…} methods: the workout and exercise counts, the library copy, progress and the tree.
     */
    public static ProgramItem ofRow(String id, String origin, ClientRef client, String name, String goal, String description,
                                    int weeks, int days, String status, String startDate, String endDate,
                                    Long syncedAt, long revisedAt, CopiedFrom copiedFrom, boolean behind, int assignedCount,
                                    long createdAt, long updatedAt, Certified certified) {
        return new ProgramItem(id, origin, client == null ? null : client.id(), client, name, goal, description, weeks, days,
                status, startDate, endDate, copiedFrom == null ? null : copiedFrom.id(), syncedAt, revisedAt,
                String.valueOf(revisedAt), 0, 0, copiedFrom, behind, assignedCount, createdAt, updatedAt, certified,
                null, null, null, null, null);
    }

    public ProgramItem withTree(List<PlanWorkout> tree, Map<String, ExerciseRef> dictionary) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, createdAt, updatedAt, certified, mine,
                progress, tree, dictionary, linkedSessions);
    }

    public ProgramItem withCounts(int workouts, int exercises) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workouts, exercises, copiedFrom,
                behind, assignedCount, createdAt, updatedAt, certified, mine,
                progress, this.workouts, this.exercises, linkedSessions);
    }

    public ProgramItem withProgress(Progress p) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, createdAt, updatedAt, certified, mine,
                p, workouts, exercises, linkedSessions);
    }

    public ProgramItem withMine(Mine m) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, createdAt, updatedAt, certified, m,
                progress, workouts, exercises, linkedSessions);
    }

    public ProgramItem withLinked(int linked) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, createdAt, updatedAt, certified, mine,
                progress, workouts, exercises, linked);
    }
}
