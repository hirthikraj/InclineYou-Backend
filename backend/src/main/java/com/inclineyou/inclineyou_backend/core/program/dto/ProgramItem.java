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
        int assignedCount, int activeAssignedCount, List<ClientRef> assignedClients,
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

    public ProgramItem withTree(List<PlanWorkout> tree, Map<String, ExerciseRef> dictionary) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, activeAssignedCount, assignedClients, createdAt, updatedAt, certified, mine,
                progress, tree, dictionary, linkedSessions);
    }

    public ProgramItem withCounts(int workouts, int exercises) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workouts, exercises, copiedFrom,
                behind, assignedCount, activeAssignedCount, assignedClients, createdAt, updatedAt, certified, mine,
                progress, this.workouts, this.exercises, linkedSessions);
    }

    public ProgramItem withProgress(Progress p) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, activeAssignedCount, assignedClients, createdAt, updatedAt, certified, mine,
                p, workouts, exercises, linkedSessions);
    }

    public ProgramItem withMine(Mine m) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, activeAssignedCount, assignedClients, createdAt, updatedAt, certified, m,
                progress, workouts, exercises, linkedSessions);
    }

    public ProgramItem withAssigned(int total, int active, List<ClientRef> sample) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, total, active, sample, createdAt, updatedAt, certified, mine, progress, workouts, exercises,
                linkedSessions);
    }

    public ProgramItem withLinked(int linked) {
        return new ProgramItem(id, origin, clientId, client, name, goal, description, weeks, days, status, startDate,
                endDate, copiedFromProgramId, syncedAt, revisedAt, version, workoutCount, exerciseCount, copiedFrom,
                behind, assignedCount, activeAssignedCount, assignedClients, createdAt, updatedAt, certified, mine,
                progress, workouts, exercises, linked);
    }
}
