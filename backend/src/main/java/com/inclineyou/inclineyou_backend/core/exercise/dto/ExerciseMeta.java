package com.inclineyou.inclineyou_backend.core.exercise.dto;

import java.util.List;

/**
 * {@code GET /v1/exercises/meta} — the library's facets, read off the rows the
 * caller can see. {@code levels} is empty while the dataset is ungraded; an empty
 * facet draws as no filter, where a removed field breaks the next client.
 */
public record ExerciseMeta(List<Facet> bodyParts, List<Facet> equipment, List<Facet> levels, int total) {
    public record Facet(String id, int count) {}
}
