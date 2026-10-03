package com.inclineyou.inclineyou_backend.core.report.dto;

/**
 * One exercise's best set. The two numbers are left exactly as the driver returns them: the report
 * prints them with {@code toString()}, and a typed re-read could change the scale it prints.
 */
public record PersonalRecord(Object exercise, Object maxLoadKg, Object maxReps) {}
