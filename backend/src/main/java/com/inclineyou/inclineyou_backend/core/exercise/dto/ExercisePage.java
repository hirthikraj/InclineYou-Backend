package com.inclineyou.inclineyou_backend.core.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** {@code GET /v1/exercises} — a keyset page. {@code total} only when {@code includeTotal=true}. */
public record ExercisePage(List<ExerciseItem> items, String nextCursor,
                           @JsonInclude(JsonInclude.Include.NON_NULL) Integer total) {}
