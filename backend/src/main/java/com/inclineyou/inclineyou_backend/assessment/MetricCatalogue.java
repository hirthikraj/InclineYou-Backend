package com.inclineyou.inclineyou_backend.assessment;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The six measurements, and the only six.
 *
 * `metric_type` is an unconstrained varchar, and free text there produces two
 * spellings of one measurement — the bug this repo already has on record twice
 * (`acsm_cpt` missing from a catalogue, `fat_loss` invented by the seeds). A
 * seventh metric is a deploy, which is the honest price.
 *
 * The range is a typo guard, not a health judgement: it catches 842 kg and 8.42
 * kg, and it says nothing about whether a number is good.
 */
public final class MetricCatalogue {

    public record Metric(String id, String label, String unit, BigDecimal min, BigDecimal max) {}

    private static Metric m(String id, String label, String unit, int min, int max) {
        return new Metric(id, label, unit, BigDecimal.valueOf(min), BigDecimal.valueOf(max));
    }

    private static final Map<String, Metric> BY_ID = new LinkedHashMap<>();

    static {
        for (Metric metric : List.of(
                m("weight",   "Weight",   "kg", 20,  300),
                m("body_fat", "Body fat", "%",   1,   70),
                m("chest",    "Chest",    "cm", 30,  200),
                m("waist",    "Waist",    "cm", 30,  200),
                m("hip",      "Hips",     "cm", 30,  200),
                m("arm",      "Arms",     "cm", 10,  100))) {
            BY_ID.put(metric.id(), metric);
        }
    }

    /** Declaration order, which is the order both halves draw them in. */
    public static List<Metric> all() {
        return List.copyOf(BY_ID.values());
    }

    public static List<String> ids() {
        return List.copyOf(BY_ID.keySet());
    }

    public static Metric get(String id) {
        return id == null ? null : BY_ID.get(id);
    }

    public static boolean has(String id) {
        return id != null && BY_ID.containsKey(id);
    }

    private MetricCatalogue() {}
}
