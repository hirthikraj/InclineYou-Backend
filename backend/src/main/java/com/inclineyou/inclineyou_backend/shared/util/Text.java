package com.inclineyou.inclineyou_backend.shared.util;

/** Normalising free text on the way in — for request records' compact constructors. */
public final class Text {

    private Text() {}

    /** Surrounding whitespace off; null stays null, so {@code @NotBlank} still sees a blank one. */
    public static String strip(String s) {
        return s == null ? null : s.strip();
    }

    /** Stripped, and a blank answer is no answer. */
    public static String orNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
