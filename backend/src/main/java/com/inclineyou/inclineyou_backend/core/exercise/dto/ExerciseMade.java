package com.inclineyou.inclineyou_backend.core.exercise.dto;

/** What a create answers with: the exercise, and whether this call made it (201) or found it (200). */
public record ExerciseMade(ExerciseItem exercise, boolean created) {}
