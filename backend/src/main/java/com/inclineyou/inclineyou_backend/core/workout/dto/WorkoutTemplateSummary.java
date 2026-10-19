package com.inclineyou.inclineyou_backend.core.workout.dto;

/**
 * One row of the shelf ({@code GET /v1/workout-templates}): what the list draws and nothing it does not.
 *
 * <p>The whole tree is {@code GET /v1/workout-templates/{id}} ({@link WorkoutTemplateItem}); the list stopped carrying
 * it on 19 Oct 2026 because a phone was downloading every set of every template — ~35 KB gzip at 32 templates, ~114 KB
 * at 100 — to print a name, two counts and a duration. {@code estimatedMinutes} is that duration, worked out on the
 * server from the sets the list no longer sends (see {@code WorkoutEstimate}).
 */
public record WorkoutTemplateSummary(
        String id, String name, String notes, int exerciseCount, int setCount, int estimatedMinutes,
        long createdAt, long updatedAt, String version
) {}
