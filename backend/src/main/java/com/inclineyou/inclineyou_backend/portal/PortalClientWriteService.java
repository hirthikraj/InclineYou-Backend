package com.inclineyou.inclineyou_backend.portal;

import com.inclineyou.inclineyou_backend.assessment.AssessmentCatalogue;
import com.inclineyou.inclineyou_backend.assessment.AssessmentTemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

import static com.inclineyou.inclineyou_backend.portal.PortalReadService.*;

/**
 * Module 11c · what a client writes about themselves: answering an assessment,
 * submitting it, and logging a body reading.
 *
 * <h2>Answering: validate the replacement BEFORE removing the old one</h2>
 *
 * One answer (a measurement or a question) is replaced per call, and the
 * replacement is checked in full first — so a refused save leaves the answer
 * the client already gave exactly where it was. What is asked comes from the
 * LIVE template, as the portal's reads say; a key or question it does not ask
 * is refused. The fields that do not belong to a question's kind are nulled,
 * and readings are kept in the template's order.
 *
 * <h2>There is no weigh-in</h2>
 *
 * The portal's loose reading ({@code POST /v1/me/metrics}) was withdrawn with
 * {@code body_metric} in V22: a body is measured in an assessment and nowhere
 * else, so a client's numbers reach their trainer by answering one.
 */
@Service
@RequiredArgsConstructor
public class PortalClientWriteService {

    private static final int MAX_TEXT = 2000;

    private final NamedParameterJdbcTemplate jdbc;
    private final PortalReadService reads;

    // ── Answering ─────────────────────────────────────────────────────────────

    /**
     * {@code {kind:'measurement', key, value?, clear?}} or
     * {@code {kind:'question', questionId, yes?|rating?|text?|optionIds?, clear?}}.
     * Returns the assessment, re-read.
     */
    @Transactional
    public CheckInDetail answer(PortalScope.Me me, UUID id, Map<String, Object> body) {
        var a = lockOpen(me, id);
        var b = body == null ? Map.<String, Object>of() : body;
        var measurements = a.get("t_measurements") == null ? null
                : AssessmentTemplateService.readMeasurements(s(a.get("t_measurements")));
        var questions = a.get("t_questions") == null ? null
                : AssessmentTemplateService.readQuestions(s(a.get("t_questions")));
        boolean clear = Boolean.TRUE.equals(b.get("clear"));
        var p = params(me);
        p.put("aid", id.toString());

        String kind = b.get("kind") instanceof String k ? k : "";
        switch (kind) {
            case "measurement" -> {
                var asked = measurements == null || !measurements.on() ? List.<String>of() : measurements.keys();
                String key = b.get("key") instanceof String k ? k : null;
                if (key == null || !asked.contains(key)) throw PortalRuleException.validation("key: not asked in this assessment");
                var readings = new ArrayList<Map<String, Object>>(listOfMaps(s(a.get("readings"))));
                Map<String, Object> replacement = null;
                if (!clear) {
                    double value = finite(b.get("value"));
                    if (!(value > 0) || value >= 100_000) throw PortalRuleException.validation("value: must be a number greater than 0");
                    replacement = new LinkedHashMap<>(Map.of("key", key, "value", value));
                }
                // Validated above; only now does the old one go.
                readings.removeIf(r -> key.equals(r.get("key")));
                if (replacement != null) readings.add(replacement);
                readings.sort(Comparator.comparingInt(r -> asked.indexOf(String.valueOf(r.get("key")))));
                p.put("readings", write(readings));
                jdbc.update("UPDATE assessment SET readings = CAST(:readings AS jsonb), updated_at = now() WHERE id = :aid::uuid", p);
            }
            case "question" -> {
                var asked = questions == null || !questions.on() ? List.<AssessmentCatalogue.Question>of() : questions.items();
                String qid = b.get("questionId") instanceof String q ? q : null;
                var question = asked.stream().filter(q -> q.id().equals(qid)).findFirst()
                        .orElseThrow(() -> PortalRuleException.validation("questionId: not asked in this assessment"));
                var answers = new ArrayList<Map<String, Object>>(listOfMaps(s(a.get("answers"))));
                Map<String, Object> replacement = clear ? null : answerFor(question, b);
                answers.removeIf(r -> question.id().equals(r.get("questionId")));
                if (replacement != null) answers.add(replacement);
                var order = asked.stream().map(AssessmentCatalogue.Question::id).toList();
                answers.sort(Comparator.comparingInt(r -> order.indexOf(String.valueOf(r.get("questionId")))));
                p.put("answers", write(answers));
                jdbc.update("UPDATE assessment SET answers = CAST(:answers AS jsonb), updated_at = now() WHERE id = :aid::uuid", p);
            }
            default -> throw PortalRuleException.validation("kind: measurement or question");
        }
        return reads.assessment(me, id);
    }

    /**
     * One answer, checked against its question's kind — and every field that
     * does not belong to that kind stored as null, so a question whose kind the
     * trainer changed cannot carry a stale second answer.
     */
    private static Map<String, Object> answerFor(AssessmentCatalogue.Question q, Map<String, Object> b) {
        Boolean yes = null;
        Integer rating = null;
        String text = null;
        List<String> optionIds = new ArrayList<>();
        switch (q.kind()) {
            case "yesno" -> {
                if (!(b.get("yes") instanceof Boolean y)) throw PortalRuleException.validation("yes: true or false");
                yes = y;
            }
            case "rating" -> {
                int scale = q.scale() == null ? 10 : q.scale();
                if (!(b.get("rating") instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue())
                        || n.intValue() < 1 || n.intValue() > scale) {
                    throw PortalRuleException.validation("rating: a whole number from 1 to " + scale);
                }
                rating = n.intValue();
            }
            case "choice" -> {
                var known = q.options().stream().map(AssessmentCatalogue.Option::id).toList();
                if (b.get("optionIds") instanceof List<?> ids) {
                    for (Object o : ids) if (o instanceof String sid && known.contains(sid) && !optionIds.contains(sid)) optionIds.add(sid);
                }
                if (!q.allowMultiple() && optionIds.size() > 1) optionIds = new ArrayList<>(optionIds.subList(0, 1));
                String custom = b.get("text") instanceof String t && !t.isBlank() ? t.strip() : null;
                if (custom != null && q.allowCustom()) text = clip(custom);
                if (optionIds.isEmpty() && text == null) {
                    throw PortalRuleException.validation(q.allowCustom()
                            ? "optionIds: pick at least one, or write your own"
                            : "optionIds: pick at least one");
                }
            }
            default -> {   // text
                if (!(b.get("text") instanceof String t) || t.isBlank()) throw PortalRuleException.validation("text: required");
                text = clip(t.strip());
            }
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("questionId", q.id());
        out.put("yes", yes);
        out.put("rating", rating);
        out.put("text", text);
        out.put("optionIds", optionIds);
        return out;
    }

    /**
     * Hand it back. Nothing answered at all → {@code 400 EMPTY}; a partial
     * submission is allowed on purpose. It lands unread for the trainer, and it
     * does NOT ring the trainer's bell — the assessments list is where returned
     * ones are read.
     */
    @Transactional
    public CheckInDetail submit(PortalScope.Me me, UUID id) {
        var a = lockOpen(me, id);
        if (listOfMaps(s(a.get("readings"))).isEmpty() && listOfMaps(s(a.get("answers"))).isEmpty()) {
            throw new PortalRuleException(HttpStatus.BAD_REQUEST, "EMPTY",
                    "Answer at least one thing before you send it back.");
        }
        jdbc.update("""
                UPDATE assessment SET completed_at = now(), read_at = NULL, updated_at = now() WHERE id = :aid::uuid
                """, Map.of("aid", id.toString()));
        return reads.assessment(me, id);
    }

    /** One of the client's SENT, still-open assessments, locked; its live template alongside. */
    private Map<String, Object> lockOpen(PortalScope.Me me, UUID id) {
        var p = params(me);
        p.put("aid", id.toString());
        var rows = jdbc.queryForList("""
                SELECT a.completed_at, a.readings::text AS readings, a.answers::text AS answers,
                       t.measurements::text AS t_measurements, t.questions::text AS t_questions
                FROM assessment a
                LEFT JOIN assessment_template t ON t.id = a.template_id AND t.deleted_at IS NULL
                WHERE a.id = :aid::uuid AND a.client_id = :cid::uuid AND a.deleted_at IS NULL AND a.sent_at IS NOT NULL
                FOR UPDATE OF a
                """, p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("No such assessment.");
        var a = rows.getFirst();
        if (a.get("completed_at") != null) {
            throw new PortalRuleException(HttpStatus.CONFLICT, "CLOSED", "You've already sent this one back.");
        }
        return a;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static double finite(Object v) {
        if (v instanceof Number n && Double.isFinite(n.doubleValue())) return n.doubleValue();
        throw PortalRuleException.validation("value: must be a number greater than 0");
    }

    private static String clip(String t) {
        return t.length() > MAX_TEXT ? t.substring(0, MAX_TEXT) : t;
    }

    private static String write(Object v) {
        try {
            return JSON.writeValueAsString(v);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
