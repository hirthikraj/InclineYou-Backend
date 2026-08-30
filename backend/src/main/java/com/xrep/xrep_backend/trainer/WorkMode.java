package com.xrep.xrep_backend.trainer;

/**
 * The onboarding "how do you work" answer — a defaults hint only, never a
 * feature gate. Gym-vs-freelance is decided per client, not here; see
 * V23__trainer_work_mode.sql. Kept as a plain VARCHAR(20) in the database
 * (a new mode is a code change, not a migration) — this enum only makes the
 * Java side reject anything outside the three known values.
 */
public enum WorkMode {
    INDEPENDENT("independent"),
    GYM("gym"),
    BOTH("both");

    private final String value;

    WorkMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static WorkMode fromValue(String value) {
        for (WorkMode mode : values()) {
            if (mode.value.equals(value)) return mode;
        }
        throw new IllegalArgumentException("Unknown workMode: " + value);
    }
}
