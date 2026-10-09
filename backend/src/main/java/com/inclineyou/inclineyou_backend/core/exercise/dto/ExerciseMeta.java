package com.inclineyou.inclineyou_backend.core.exercise.dto;

import java.util.List;

/**
 * {@code GET /v1/exercises/meta} — the library's facets, read off the rows the
 * caller can see. {@code levels} is empty while the dataset is ungraded; an empty
 * facet draws as no filter, where a removed field breaks the next client.
 */
public record ExerciseMeta(List<Facet> bodyParts, List<Facet> equipment, List<Facet> levels, int total,
                           List<EquipmentGroup> equipmentGroups,
                           List<Muscle> muscles, List<Facet> patterns, List<Facet> logTypes, List<Facet> categories) {
    public record Facet(String id, int count) {}

    /** One muscle and the body part it sits under, so a category can open onto its muscles. */
    public record Muscle(String bodyPart, String target, int count) {}

    /**
     * The same equipment, grouped the way a trainer scans it (V9): one group per {@code equipment.category}, each
     * item carrying the permanent {@code key} the {@code equipmentKey} filter takes. Additive — {@code equipment}
     * above is unchanged and still counts the raw strings, which an old build keeps reading.
     */
    public record EquipmentGroup(String category, List<EquipmentItem> items) {}

    /** {@code value} is the string the exercise's {@code equipment} column holds for this kit, which is what a create must send. */
    public record EquipmentItem(String key, String name, int count, String value) {}
}
