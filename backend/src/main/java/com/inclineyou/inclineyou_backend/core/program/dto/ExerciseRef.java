package com.inclineyou.inclineyou_backend.core.program.dto;

/**
 * A program read's dictionary entry: each exercise's name once, so the builder
 * stops asking {@code /v1/exercises?ids=} for names (R48). The descriptive
 * columns are what its row meta lines print.
 */
public record ExerciseRef(String name, String equipment, String logType, String muscleGroup, String bodyPart,
                          String target, String movementPattern, String level, boolean isCustom) {}
