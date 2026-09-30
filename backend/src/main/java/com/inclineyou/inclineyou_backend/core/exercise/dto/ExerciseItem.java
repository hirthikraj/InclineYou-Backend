package com.inclineyou.inclineyou_backend.core.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * An exercise on the 1.1 wire (Programs L6). A list row and a detail read are
 * one shape; {@code description} and {@code formCues} are the detail's, dropped
 * from a list rather than sent as null. Text only — the library has no media,
 * by licence.
 */
public record ExerciseItem(
        String id, String name, String muscleGroup, String bodyPart, String target, List<String> secondaryTargets,
        String equipment, String movementPattern, String level,
        /* weight_reps | reps; null on the seeded library, read as weight_reps */
        String logType,
        boolean isCustom, String status, long createdAt,
        /* the row's updated_at as epoch ms; what a PATCH's If-Match carries */
        String version,
        @JsonInclude(JsonInclude.Include.NON_NULL) String description,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<String> formCues
) {
    /** The list row as it is without the two detail-only fields. */
    public ExerciseItem summary() {
        return new ExerciseItem(id, name, muscleGroup, bodyPart, target, secondaryTargets, equipment, movementPattern,
                level, logType, isCustom, status, createdAt, version, null, null);
    }
}
