package com.inclineyou.inclineyou_backend.core.report.dto;

/** One exercise's best set. The two numbers are the driver's {@code numeric}s; the service formats them for reading. */
public record PersonalRecord(Object exercise, Object maxLoadKg, Object maxReps) {}
