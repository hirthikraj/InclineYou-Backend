package com.inclineyou.inclineyou_backend.core.exercise;

/**
 * The six ways an exercise can be counted (V9, 6 Oct 2026), and what each one lays down when it is added to a
 * session: the {@code load_kind} and {@code effort_kind} of its empty sets. They map one-to-one onto the kinds
 * {@code set_log} already stores, so no set column is new — a plank asks for seconds, a farmer's walk for a
 * weight and metres.
 *
 * <p>{@code null} is {@code weight_reps}: every row written before V9, and every old build, never sent anything else.
 */
public final class LogTypes {

    private LogTypes() {}

    /** For {@code @Pattern}: the values the exercise table's CHECK admits. */
    public static final String REGEX = "weight_reps|reps|time|distance|weight_time|weight_distance";
    public static final String MESSAGE = "weight_reps, reps, time, distance, weight_time or weight_distance";

    /** The kinds a set of this exercise starts with. */
    public record Kinds(String loadKind, String effortKind) {}

    public static Kinds kindsOf(String logType) {
        if (logType == null) return new Kinds("weight", "reps");
        return switch (logType) {
            case "reps" -> new Kinds("bodyweight", "reps");
            case "time" -> new Kinds("bodyweight", "time");
            case "distance" -> new Kinds("bodyweight", "distance");
            case "weight_time" -> new Kinds("weight", "time");
            case "weight_distance" -> new Kinds("weight", "distance");
            default -> new Kinds("weight", "reps");   // weight_reps, and anything an older row might hold
        };
    }
}
