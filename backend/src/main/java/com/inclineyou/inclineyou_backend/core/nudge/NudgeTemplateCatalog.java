package com.inclineyou.inclineyou_backend.core.nudge;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The eight templates, their default wording, and which variables each one may
 * use — in ONE place, because three readers need all three facts and any of them
 * holding its own copy is a drift waiting to happen.
 *
 * <ul>
 *   <li>{@link NudgeService} renders a message: it needs the default body for a
 *       trainer who has not overridden it, and the variable list to know what to
 *       look up.</li>
 *   <li>{@link NudgeTemplateService} serves the library screen: it needs the
 *       label, the default, and the variables so the editor can print them
 *       beside the box.</li>
 *   <li>The web's template editor prints the variable names and a live preview.
 *       It holds NO copy of any of this — it reads
 *       {@code GET /v1/nudge-templates} — which is the reason the label and the
 *       variable list are on the wire at all.</li>
 * </ul>
 *
 * <h2>{@code {count}} means a different number in every template, on purpose</h2>
 *
 * The brief writes {@code {count}} in two of its six sentences and means two
 * different things by it — "you have {count} sessions left" and "that's your
 * 50th session". Splitting it into {@code {left}} and {@code {done}} was the
 * first attempt and it is worse: a trainer editing the renewal template does not
 * want to remember which of five count-shaped variables this one takes.
 *
 * So {@code {count}} is "the number this template is about", it means something
 * different per template, and {@link Variable#meaning()} is what the editor
 * prints beside it. There is exactly one count per template, so a trainer can
 * never be looking at two.
 *
 * <h2>Every default is a FIRST DRAFT and none of them sends</h2>
 *
 * The message is rendered here, logged, and handed back as a {@code wa.me} deep
 * link. The trainer's own WhatsApp opens with it typed in the box and they press
 * send — which is the one part of "sending a WhatsApp" that never happens on a
 * server, and the part that makes the message come from a number the client has
 * saved rather than from a platform number they will ignore.
 */
public final class NudgeTemplateCatalog {

    private NudgeTemplateCatalog() {}

    /**
     * A substitution the trainer may type into a template body.
     *
     * @param token   what they type, braces included — {@code "{name}"}
     * @param meaning what it becomes, in the trainer's words. Printed in the
     *                editor and nowhere else.
     */
    public record Variable(String token, String meaning) {}

    /**
     * One template.
     *
     * @param name      the wire name, which is also {@code nudge_log.template_name}
     *                  and the key of a {@code nudge_template} override
     * @param label     what the library screen calls it
     * @param purpose   one sentence on when a trainer would send it, drawn under
     *                  the label. The library is edited months before it is read
     *                  back, so a row that only says "Renewal" is a row the
     *                  trainer has to open to remember.
     * @param body      the built-in wording, used until the trainer overrides it
     * @param variables what {@code body} may contain
     */
    public record Template(
            String name,
            String label,
            String purpose,
            String body,
            List<Variable> variables
    ) {}

    /* ── the variables, declared once ─────────────────────────────────────── */

    private static final Variable NAME =
            new Variable("{name}", "the client's first name");
    private static final Variable TRAINER =
            new Variable("{trainer}", "your own first name");
    private static final Variable AMOUNT =
            new Variable("{amount}", "what they still owe you, as ₹");
    private static final Variable PACKAGE =
            new Variable("{package}", "the pack they are on");

    private static Variable count(String meaning) {
        return new Variable("{count}", meaning);
    }

    private static Variable days(String meaning) {
        return new Variable("{days}", meaning);
    }

    /**
     * {@code {nth}} exists because {@code "your {count}th session"} produces
     * "your 101th" and "your 3th". An ordinal is not a number with two letters
     * after it, and a template language that makes the trainer discover that is
     * a template language that ships a typo to a client.
     */
    private static final Variable NTH =
            new Variable("{nth}", "the same number as an ordinal — 50th, 100th");

    /* ── the eight ────────────────────────────────────────────────────────── */

    /**
     * Insertion-ordered, and the order is the library screen's: the four the
     * brief names first, because they are the four a trainer sends, then the two
     * that are about a session rather than about a relationship.
     */
    private static final Map<String, Template> BY_NAME = new LinkedHashMap<>();

    private static void add(Template t) {
        BY_NAME.put(t.name(), t);
    }

    static {
        add(new Template(
                "renewal",
                "Renewal",
                "Their pack is nearly done and the next one has not been discussed.",
                "Hi {name}, you have {count} sessions left on your {package}. Shall I set up your next pack?",
                List.of(NAME, count("sessions left on their current pack"), PACKAGE, TRAINER)));

        add(new Template(
                "payment_reminder",
                "Payment",
                "Money is owed. The hardest message a trainer sends, so the default is gentle on purpose.",
                "Hi {name}, gentle reminder on the pending {amount} for your {package}. Thanks!",
                List.of(NAME, AMOUNT, PACKAGE, days("days it has been outstanding"), TRAINER)));

        add(new Template(
                "missed_session",
                "Missed sessions",
                "They have missed sessions they were booked into.",
                "Hey {name}, missed you this week. Everything alright? Want to reschedule?",
                List.of(NAME, count("sessions missed in the last month"), TRAINER)));

        add(new Template(
                "well_done",
                "Milestone",
                "A round number of sessions delivered. The one message on this list that is good news.",
                "{name}, that's your {nth} session. Brilliant consistency. 💪",
                List.of(NAME, count("sessions delivered, all time"), NTH, TRAINER)));

        add(new Template(
                "session_summary",
                "Post-session summary",
                "Sent after a session, while it is still in their head.",
                "Great work today, {name}. That's {count} sessions in the bank. Rest up, drink water, and I'll see you next time.",
                List.of(NAME, count("sessions delivered, all time"), TRAINER)));

        add(new Template(
                "re_engagement",
                "Re-engagement",
                "They have gone quiet — no session, no log, nothing for weeks.",
                "Hi {name}, it's been {days} days since your last session. No pressure at all — but if you want to pick it back up, tell me what suits you and I'll find a slot.",
                List.of(NAME, days("days since their last session"), TRAINER)));

        add(new Template(
                "check_in",
                "Check-in",
                "Nothing is wrong. You just want to know how the week is going.",
                "Hi {name}! How's your week going? Keeping up with your training? Let me know if you want anything adjusted.",
                List.of(NAME, days("days since their last session"), TRAINER)));

        add(new Template(
                "session_reminder",
                "Session reminder",
                "Tomorrow's session, confirmed the day before.",
                "Hi {name}! Just a reminder for your training session tomorrow. See you there! 💪",
                List.of(NAME, TRAINER)));
    }

    public static List<Template> all() {
        return List.copyOf(BY_NAME.values());
    }

    /** Null for a name that is not in the catalogue. */
    public static Template find(String name) {
        return name == null ? null : BY_NAME.get(name);
    }

    public static boolean isKnown(String name) {
        return find(name) != null;
    }

    /**
     * The fallback for an unknown template name.
     *
     * <p>A sentence rather than a 400, and that is the standing behaviour of this
     * endpoint: a rolling deploy where the web knows a ninth template and the
     * server does not should hand the trainer a WhatsApp with something in it,
     * not an error on a button they pressed while standing next to the client.
     * The message is deliberately bland — it is the one draft nobody wrote.
     */
    public static final String FALLBACK_BODY = "Hi {name}, just getting in touch about your training.";
}
