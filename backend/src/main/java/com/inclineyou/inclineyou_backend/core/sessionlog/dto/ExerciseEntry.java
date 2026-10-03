package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.util.List;

/**
 * One movement in the log — the shape every exercise write also answers with. {@code id} is session_exercise.id and
 * the key of every write; it is null in a plan preview. {@code swappedFromName} is the original movement's name when
 * the exercise was swapped (null otherwise), so the console can say "swapped from Back squat" without another read. {@code removedAt} is set while a removed exercise can still be
 * un-removed.
 */
public record ExerciseEntry(
        String id, String exerciseId, String name, String equipment, int position, String section, String groupId,
        String source, String plannedFrom, String swappedFrom, String swappedFromName, String swapReason, Long removedAt,
        String notes,
        List<SetRow> sets, List<Alternative> alternatives, LastSets last, BestSet best) {}
