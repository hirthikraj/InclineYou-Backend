package com.inclineyou.inclineyou_backend.core.session;

import java.util.Optional;

/**
 * The session milestones a client reaches (UC-CP-31): their 1st, 10th, 25th, 50th … finished session, counting both kinds — the
 * sessions their trainer ran and the ones they ran alone. One list and one wording for the two places a session becomes done: the
 * trainer's Mark done ({@link SessionWriteService}) and the client's own finish (the portal), so neither can name a milestone the
 * other does not (21 Nov 2026 — before, only the client's finish minted any).
 */
public final class SessionMilestones {

    private SessionMilestones() {}

    static final int[] THRESHOLDS = {1, 10, 25, 50, 100, 250, 500, 1000};

    public record Reached(String kind, String label, int value) {}

    /** The milestone the {@code n}th finished session reaches, if it is one. */
    public static Optional<Reached> at(int n) {
        for (int m : THRESHOLDS) {
            if (m == n) return Optional.of(new Reached("sessions_" + m, m == 1 ? "Your first session" : ordinal(m) + " session", m));
        }
        return Optional.empty();
    }

    static String ordinal(int n) {
        int mod100 = n % 100;
        String suffix = mod100 >= 11 && mod100 <= 13 ? "th" : switch (n % 10) { case 1 -> "st"; case 2 -> "nd"; case 3 -> "rd"; default -> "th"; };
        return n + suffix;
    }
}
