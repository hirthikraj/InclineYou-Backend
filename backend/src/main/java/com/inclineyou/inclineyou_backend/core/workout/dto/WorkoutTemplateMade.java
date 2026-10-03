package com.inclineyou.inclineyou_backend.core.workout.dto;

/** What a create answers with: the workout, and whether this call made it (201) or found it (200). */
public record WorkoutTemplateMade(WorkoutTemplateItem workout, boolean created) {}
