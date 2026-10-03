package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** Swap a movement; scope today touches this session only, scope program also the client's plan from the next session. */
public record SwapRequest(String toExerciseId, String planRowId, String reason, String scope) {}
