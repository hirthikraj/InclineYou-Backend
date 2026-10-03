package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** A movement added mid-session; {@code sets} is how many empty planned rows to lay down (default 0). */
public record AddExerciseRequest(String id, String exerciseId, Integer position, Integer sets) {}
