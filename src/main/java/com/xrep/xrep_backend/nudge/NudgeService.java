package com.xrep.xrep_backend.nudge;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A nudge: draft a WhatsApp message, log that it was drafted, hand back a
 * {@code wa.me} deep link. <b>This service has never sent a message and still
 * does not.</b>
 *
 * <h2>Why a deep link is the right delivery, and not a compromise</h2>
 *
 * The alternative is the WhatsApp Business API, which costs money, needs Meta
 * template review and a trust tier, and — the part that actually decides it —
 * sends from a platform number. A message from the trainer's own number lands in
 * a thread the client already has open and gets read. A message from a business
 * number lands beside the delivery notifications and does not. Automation would
 * make this feature worse, not better; it is v2 and it is v2 on purpose.
 *
 * <p>So the trainer reviews and presses send, every time, and the two limits
 * `app/src/nudges/rules.ts` states — the 9am–8pm window and the
 * once-per-client-per-seven-days cooldown — are the trainer's own judgement plus
 * a screen that goes quiet, rather than a server that refuses.
 *
 * <h2>The cooldown is READ here and enforced nowhere</h2>
 *
 * {@link #recentNudges} is what closes the gap `lib/today/actions.ts` recorded:
 * the phone computes the cooldown from its local {@code nudge_log} and the web
 * could not see the table at all, so a reminder sent from a laptop was invisible
 * to a phone and vice versa. Both halves can now read the same rows.
 *
 * <p>It is deliberately not a 429 on this endpoint. A trainer pressing *Remind*
 * on a client they messaged on Monday knows something the product does not — the
 * client replied, or asked to be chased again — and refusing it teaches them to
 * open WhatsApp directly, which loses the log and with it the cooldown for
 * everybody. What the read buys is a queue that stops raising a row about
 * somebody who was contacted yesterday, and a button that says *Reminded 2 days
 * ago* before it is pressed. Suppressing the prompt is the enforcement; blocking
 * the press is not.
 *
 * <h2>Every variable is resolved HERE</h2>
 *
 * Not passed in by the caller. The rule this keeps is the one the payment
 * reminder was written for: the message and the ledger must not be able to
 * disagree, so the amount in the sentence is read from the same rows the money
 * book reads rather than trusted from a screen. It costs one extra query per send
 * on a route capped at ten a minute.
 *
 * <p>The one that used to be an exception is {@code {count}} on {@code
 * well_done}. It was left uninterpolated because counting the sessions again
 * would be "a second opinion about a number the trainer is looking at on the
 * row" — a real risk, and the answer is to count them the way the deck counts
 * them rather than to leave the number out. {@code buildAttention} in
 * `lib/today/deck.ts` counts {@code workout_session} rows per client, so this
 * does too, and the two agree by construction. If that ever stops being true the
 * milestone message will be off by one and this is the paragraph to come back to.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeService {

    private final NamedParameterJdbcTemplate jdbc;
    private final NudgeTemplateService templates;

    /**
     * Never twice in this many days to the same person — {@code COOLDOWN_DAYS} in
     * `app/src/nudges/rules.ts`, and the third copy of this number, after the
     * phone's and the web's. It is not enforced here; it is the window
     * {@link #recentNudges} answers by default, so a caller that just wants "who
     * have I already contacted" gets the right span without naming it.
     */
    public static final int COOLDOWN_DAYS = 7;

    public record NudgeResult(String nudgeId, String whatsappUrl, String message, long sentAt) {}

    /**
     * One row of the follow-up history.
     *
     * <p>{@code message} is nullable and every row written before V32 has it
     * null. Left as an absence rather than re-rendered from the template name:
     * the wording is the trainer's now, so re-rendering last month's reminder in
     * this month's words would put a sentence in the history that was never sent.
     */
    public record NudgeLogResponse(
            String id,
            String clientId,
            String clientName,
            String templateName,
            String templateLabel,
            String channel,
            String status,
            String message,
            long sentAt
    ) {}

    /* ═══════════════════════════════════════════════════════ the send ═══════ */

    public NudgeResult sendNudge(UUID trainerId, UUID clientId, String templateName) {
        Map<String, Object> clientRow;
        try {
            clientRow = jdbc.queryForMap("""
                    SELECT c.name, c.phone, t.name AS trainer_name
                    FROM client c
                    JOIN trainer t ON t.id = c.trainer_id
                    WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                    """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));
        } catch (EmptyResultDataAccessException e) {
            throw NudgeRuleException.clientNotFound();
        }

        String clientName = (String) clientRow.get("name");
        String phone = (String) clientRow.get("phone");
        String normalizedPhone = normalizePhone(phone);
        if (normalizedPhone == null) throw NudgeRuleException.noPhone(clientName);

        String body = bodyFor(trainerId, templateName);
        Map<String, String> vars = resolveVariables(
                trainerId, clientId, templateName, clientName, (String) clientRow.get("trainer_name"));
        String message = interpolate(body, vars);

        String nudgeId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status,
                                       message, sent_at, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'whatsapp', :template, 'sent',
                        :message, NOW(), NOW(), NOW())
                """, Map.of(
                "id",       nudgeId,
                "tid",      trainerId.toString(),
                "cid",      clientId.toString(),
                "template", templateName == null ? "" : templateName,
                "message",  message
        ));

        String whatsappUrl = "https://wa.me/" + normalizedPhone
                + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);

        log.info("nudge trainer={} client={} template={}", trainerId, clientId, templateName);
        return new NudgeResult(nudgeId, whatsappUrl, message, System.currentTimeMillis());
    }

    /**
     * The trainer's override if they have one, the catalogue's default if they do
     * not, and a bland sentence if the name is not one this build knows.
     *
     * <p>The last branch is not a 400, and that is the standing behaviour of this
     * endpoint: on a rolling deploy where the web knows a ninth template and the
     * server does not, a trainer standing next to a client should get a WhatsApp
     * with something in it rather than an error on the button they just pressed.
     */
    private String bodyFor(UUID trainerId, String templateName) {
        String override = templates.overridesFor(trainerId).get(templateName);
        if (override != null) return override;
        var template = NudgeTemplateCatalog.find(templateName);
        return template != null ? template.body() : NudgeTemplateCatalog.FALLBACK_BODY;
    }

    /* ═══════════════════════════════════════════════ the substitutions ══════ */

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

    /**
     * Every variable this template could use, resolved from the database.
     *
     * <p>Resolved by TEMPLATE rather than all at once: {@code {count}} means a
     * different number in each of them — sessions left, sessions missed, sessions
     * delivered — and a map that carried all three would have to call the number
     * something, which is exactly the naming problem
     * {@link NudgeTemplateCatalog} argues its way out of. One count per template,
     * so the trainer can never be looking at two.
     */
    private Map<String, String> resolveVariables(
            UUID trainerId, UUID clientId, String templateName,
            String clientName, String trainerName) {

        Map<String, String> vars = new HashMap<>();
        vars.put("{name}", firstName(clientName, "there"));
        vars.put("{trainer}", firstName(trainerName, "your trainer"));

        String name = templateName == null ? "" : templateName;

        switch (name) {
            case "renewal" -> {
                var pack = livePackage(clientId);
                int left = pack.sessionsRemaining() == null ? 0 : pack.sessionsRemaining();
                vars.put("{count}", String.valueOf(left));
                vars.put("{nth}", ordinal(left));
                vars.put("{package}", pack.label());
            }
            case "payment_reminder" -> {
                var pack = livePackage(clientId);
                vars.put("{amount}", rupees(outstandingFor(trainerId, clientId)));
                vars.put("{package}", pack.label());
                vars.put("{count}", String.valueOf(daysOutstanding(trainerId, clientId)));
                vars.put("{days}", String.valueOf(daysOutstanding(trainerId, clientId)));
            }
            case "missed_session" -> {
                int missed = missedInLast30Days(trainerId, clientId);
                vars.put("{count}", String.valueOf(missed));
                vars.put("{nth}", ordinal(missed));
            }
            case "well_done", "session_summary" -> {
                int delivered = deliveredCount(clientId);
                vars.put("{count}", String.valueOf(delivered));
                vars.put("{nth}", ordinal(delivered));
            }
            case "re_engagement", "check_in" -> {
                Integer quiet = daysSinceLastSession(clientId);
                // Null means nothing has ever been logged for this client. "0
                // days since your last session" would be a lie about somebody who
                // has never had one, so the sentence gets a word instead of a
                // number and reads as English either way.
                vars.put("{days}", quiet == null ? "a few" : String.valueOf(quiet));
                vars.put("{count}", String.valueOf(deliveredCount(clientId)));
            }
            default -> {
                // session_reminder, and anything a newer build invents. Name and
                // trainer only — every other variable would be a query for a
                // token the body does not contain.
            }
        }
        return vars;
    }

    /* ── the queries behind the variables ─────────────────────────────────── */

    /**
     * What the trainer calls the pack this client is on.
     *
     * <p>The name comes from `pack` through {@code package.pack_id}, which is the
     * price list and the only place a pack has a NAME at all. A sold package that
     * predates V11's price list — or one sold off-list — has no {@code pack_id},
     * so the label is built from what the sale itself records: "12-session pack",
     * or "monthly pack" for a duration with no count in it.
     */
    private record LivePackage(Integer sessionsRemaining, String label) {}

    private LivePackage livePackage(UUID clientId) {
        try {
            var row = jdbc.queryForMap("""
                    SELECT p.sessions_remaining, p.sessions_total, p.type, k.name AS pack_name
                    FROM package p
                    LEFT JOIN pack k ON k.id = p.pack_id
                    WHERE p.client_id = :cid::uuid AND p.status = 'active' AND p.deleted_at IS NULL
                    ORDER BY p.created_at DESC LIMIT 1
                    """, Map.of("cid", clientId.toString()));

            String packName = (String) row.get("pack_name");
            Integer total = (Integer) row.get("sessions_total");
            String type = (String) row.get("type");
            String label = packName != null ? packName
                    : total != null ? total + "-session pack"
                    : "monthly".equalsIgnoreCase(type) ? "monthly pack"
                    : "pack";
            return new LivePackage((Integer) row.get("sessions_remaining"), label);
        } catch (EmptyResultDataAccessException e) {
            // No live pack. "your pack" still reads correctly in every default
            // sentence, and a trainer sending a renewal to somebody with nothing
            // running is exactly the case the message is for.
            return new LivePackage(null, "pack");
        }
    }

    /**
     * What this client still owes, across every pack.
     *
     * <p>The same arithmetic as {@code PackageService}'s {@code amount_due}, and
     * it has to be: the figure in the WhatsApp and the figure in the money book
     * are the same claim made to two different people. A collected payment is
     * {@code 'paid'} <b>or</b> {@code 'confirmed'} — REST writes the first and the
     * sync envelope has carried the second since V1 — and a write-off is
     * subtracted rather than counted as collected, because it stopped being
     * chased without ever having arrived.
     */
    private BigDecimal outstandingFor(UUID trainerId, UUID clientId) {
        BigDecimal due = jdbc.queryForObject("""
                SELECT COALESCE(SUM(
                    p.amount
                    - COALESCE((SELECT SUM(pay.amount) FROM payment pay
                                 WHERE pay.package_id = p.id
                                   AND pay.status IN ('paid', 'confirmed')
                                   AND pay.deleted_at IS NULL), 0)
                    - COALESCE(p.written_off_amount, 0)
                ), 0)
                FROM package p
                WHERE p.client_id = :cid::uuid AND p.trainer_id = :tid::uuid
                  AND p.deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), BigDecimal.class);
        if (due == null || due.signum() < 0) return BigDecimal.ZERO;
        return due;
    }

    /** How long the oldest unsettled invoice has been sitting there. */
    private int daysOutstanding(UUID trainerId, UUID clientId) {
        Integer days = jdbc.queryForObject("""
                SELECT COALESCE(MAX(EXTRACT(DAY FROM (NOW() - pay.created_at))::int), 0)
                FROM payment pay
                WHERE pay.client_id = :cid::uuid AND pay.trainer_id = :tid::uuid
                  AND pay.status NOT IN ('paid', 'confirmed')
                  AND pay.deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Integer.class);
        return days == null ? 0 : days;
    }

    /**
     * No-shows in the last thirty days — the ROSTER's reading of "missed 2+",
     * not the deck's.
     *
     * <p>`lib/today/deck.ts` raises {@code missed} on a STREAK of two consecutive
     * no-shows and `lib/clients/roster.ts` raises it on two scattered ones inside
     * a month; both are true and the web already draws them as two sentences. The
     * message names a count rather than a streak, so this is the count.
     */
    private int missedInLast30Days(UUID trainerId, UUID clientId) {
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*)::int FROM scheduled_session s
                WHERE s.client_id = :cid::uuid AND s.trainer_id = :tid::uuid
                  AND s.status = 'no_show' AND s.deleted_at IS NULL
                  AND s.scheduled_at >= NOW() - INTERVAL '30 days'
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * Sessions delivered, all time — counted as {@code workout_session} rows,
     * which is what `lib/today/deck.ts` counts to raise the milestone in the
     * first place. Counting anything else here would put a different number in
     * the message from the one on the row the trainer pressed.
     */
    private int deliveredCount(UUID clientId) {
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*)::int FROM workout_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * Days since the last session — a workout log OR a session somebody marked
     * done, whichever is later.
     *
     * <p>The roster's own rule for *last attended*, and right here for the same
     * reason: an unlogged session a client turned up to is still a session they
     * turned up to, and telling somebody it has been forty days when they trained
     * on Tuesday is how a re-engagement message loses a client rather than saving
     * one. Null when there is nothing at all.
     */
    private Integer daysSinceLastSession(UUID clientId) {
        /*
         * GREATEST is null-tolerant in Postgres — it ignores nulls and answers
         * null only when every argument is null — so the subselect always
         * produces exactly one row and the caller gets a real null for "nothing
         * has ever happened", rather than an EmptyResultDataAccessException it
         * would then have to read as the same thing.
         */
        return jdbc.queryForObject("""
                SELECT CASE WHEN t.last_at IS NULL THEN NULL
                            ELSE EXTRACT(DAY FROM (NOW() - t.last_at))::int END
                FROM (
                    SELECT GREATEST(
                        (SELECT MAX(w.session_date)::timestamptz FROM workout_session w
                          WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL),
                        (SELECT MAX(s.scheduled_at) FROM scheduled_session s
                          WHERE s.client_id = :cid::uuid AND s.status = 'done'
                            AND s.deleted_at IS NULL)
                    ) AS last_at
                ) t
                """, Map.of("cid", clientId.toString()), Integer.class);
    }

    /* ═══════════════════════════════════════════════════ the history ════════ */

    /**
     * What has been sent, newest first — the whole roster, or one client.
     *
     * <p>Two callers with one query behind them. Today's queue reads the roster's
     * window to stop raising a row about somebody who was contacted yesterday;
     * the client's file reads that one client's rows to draw the follow-up
     * history. A per-client route existing does not make the trainer-wide one
     * redundant — a dashboard that already holds the roster must never spend one
     * request per client, which is the mistake {@code GET /v1/packages} was added
     * to fix.
     *
     * @param clientId null for the whole roster
     * @param sinceDays how far back. Defaults to the cooldown window, which is
     *                  the span the queue asks about.
     */
    public List<NudgeLogResponse> recentNudges(UUID trainerId, UUID clientId, Integer sinceDays, Integer limit) {
        int days = sinceDays == null || sinceDays <= 0 ? COOLDOWN_DAYS : Math.min(sinceDays, 730);
        int cap = limit == null || limit <= 0 ? 500 : Math.min(limit, 2000);

        var params = new HashMap<String, Object>();
        params.put("tid", trainerId.toString());
        params.put("days", days);
        params.put("cap", cap);

        /*
         * The client predicate is APPENDED rather than written as
         * `(:cid::uuid IS NULL OR …)`. A bound null cast to uuid leaves the
         * driver with no type to infer and Postgres answers "could not determine
         * data type of parameter" — a failure that only appears on the
         * trainer-wide read, which is the one the dashboard makes on every load.
         */
        String clientClause = clientId == null ? "" : " AND n.client_id = :cid::uuid";
        if (clientId != null) params.put("cid", clientId.toString());

        return jdbc.query("""
                SELECT n.id::text AS id, n.client_id::text AS client_id, c.name AS client_name,
                       n.template_name, n.channel, n.status, n.message, n.sent_at
                FROM nudge_log n
                JOIN client c ON c.id = n.client_id
                WHERE n.trainer_id = :tid::uuid
                  AND n.deleted_at IS NULL
                  AND n.sent_at >= NOW() - make_interval(days => :days)
                  %s
                ORDER BY n.sent_at DESC
                LIMIT :cap
                """.formatted(clientClause), params, (rs, i) -> {
            String template = rs.getString("template_name");
            var known = NudgeTemplateCatalog.find(template);
            Timestamp sent = rs.getTimestamp("sent_at");
            return new NudgeLogResponse(
                    rs.getString("id"),
                    rs.getString("client_id"),
                    rs.getString("client_name"),
                    template,
                    // The label is resolved here rather than in the browser so a
                    // template renamed in the catalogue renames itself in every
                    // history at once. An unknown name — a row written by a build
                    // that knew a ninth template — prints as itself rather than
                    // as a blank.
                    known != null ? known.label() : template,
                    rs.getString("channel"),
                    rs.getString("status"),
                    rs.getString("message"),
                    sent == null ? 0L : sent.getTime());
        });
    }

    /* ═══════════════════════════════════════════════════ formatting ═════════ */

    private static String firstName(String full, String fallback) {
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

    /**
     * Ten digits become 91XXXXXXXXXX; twelve starting 91 are already there.
     * Anything else is null, and the caller turns that into a refusal naming the
     * client — a {@code wa.me} link built from a malformed number opens WhatsApp
     * on an error page, which reads to the trainer as the app being broken.
     */
    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("91") && digits.length() == 12) return digits;
        if (digits.length() == 10) return "91" + digits;
        return null;
    }
}
