package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/**
 * A movement added mid-session; {@code sets} is how many empty planned rows to lay down (default 0). {@code scope}
 * {@code today} (default) or {@code program}: the second also appends it to the client's plan day, from the next
 * session on — the same choice a swap offers (24 Nov 2026).
 */
public record AddExerciseRequest(String id, String exerciseId, Integer position, Integer sets, String scope) {}
