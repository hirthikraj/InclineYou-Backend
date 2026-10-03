package com.inclineyou.inclineyou_backend.core.nudge;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * The words a nudge is made of — substitution, Indian digit grouping, ordinals, first names and the {@code wa.me}
 * number. Pure functions with no database in them, which is why they are tested alone and why
 * {@link NudgeDraftService} can stay about the rules.
 */
final class NudgeText {

    private NudgeText() {}

    /**
     * Replace every {@code {token}} the map knows about, and <b>leave the ones it
     * does not exactly as they are.</b>
     *
     * <p>Blanking an unknown token was the alternative and it fails silently in
     * the worst place: a trainer who typed {@code {nmae}} would send "Hi , how's
     * the week going". Left in, the typo arrives in their own WhatsApp composer,
     * in front of them, before they press send — which is the whole reason the
     * composer is in this loop.
     */
    static String interpolate(String body, Map<String, String> vars) {
        String out = body;
        for (var e : vars.entrySet()) {
            out = out.replace(e.getKey(), e.getValue());
        }
        return out;
    }

    static String firstName(String full, String fallback) {
        if (full == null || full.isBlank()) return fallback;
        return full.trim().split("\\s+")[0];
    }

    /**
     * ₹6,000 — Indian digit grouping, which is 2,2,3 and not 3,3,3 past a
     * thousand. ₹1,20,000 is what a trainer writes; ₹120,000 reads as a foreign
     * number in a message to a client in Bengaluru.
     */
    static String rupees(BigDecimal amount) {
        if (amount == null) return "₹0";
        BigDecimal whole = amount.setScale(0, RoundingMode.HALF_UP);
        /*
         * Written out rather than left to `DecimalFormat`, and the pattern that
         * looks right is the one that does not work: `#,##,##0` declares two
         * group sizes and DecimalFormat honours only the LAST one, so it emits
         * ₹120,000. Caught by a test, which is the only way it would ever have
         * been caught — the bug is invisible under a lakh and every figure in
         * development is under a lakh.
         */
        String digits = whole.abs().toPlainString();
        StringBuilder grouped = new StringBuilder();
        if (digits.length() <= 3) {
            grouped.append(digits);
        } else {
            String tail = digits.substring(digits.length() - 3);
            String head = digits.substring(0, digits.length() - 3);
            // The head groups in TWOS, right to left: 1,20 · 12,34,56.
            for (int i = head.length(); i > 0; i -= 2) {
                int from = Math.max(0, i - 2);
                grouped.insert(0, head.substring(from, i));
                if (from > 0) grouped.insert(0, ',');
            }
            grouped.append(',').append(tail);
        }
        return "₹" + (whole.signum() < 0 ? "-" : "") + grouped;
    }

    /**
     * 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 101st.
     *
     * <p>The teens are the whole reason this is a method and not string
     * concatenation: 11, 12 and 13 take "th" while 1, 2 and 3 take "st", "nd",
     * "rd", and a template language that lets a trainer discover that by shipping
     * "your 111st session" to a client is a template language with a bug in it.
     */
    static String ordinal(int n) {
        int mod100 = Math.abs(n) % 100;
        String suffix = (mod100 >= 11 && mod100 <= 13) ? "th" : switch (Math.abs(n) % 10) {
            case 1 -> "st";
            case 2 -> "nd";
            case 3 -> "rd";
            default -> "th";
        };
        return n + suffix;
    }

    /** E.164 without the plus, as wa.me wants; ten Indian digits get their 91. Null if unusable. */
    static String waNumber(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 10) return "91" + digits;
        if (digits.length() >= 11 && digits.length() <= 15) return digits;
        return null;
    }
}
