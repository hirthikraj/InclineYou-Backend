package com.inclineyou.inclineyou_backend.core.report.dto;

/**
 * One exercise whose top set that week beat the all-time best by a plate or more. Numbers and the
 * prior date stay as the driver returns them — the writer formats them with {@code toString()}.
 */
public record NewBestRow(Object exercise, Object bestLoad, Object priorLoad, Object bestReps, Object priorOn) {}
