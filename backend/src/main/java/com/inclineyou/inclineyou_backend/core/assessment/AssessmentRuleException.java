package com.inclineyou.inclineyou_backend.core.assessment;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A measuring rule said no.
 *
 * The shape {@code PackRuleException} established, and for the reason stated
 * there: a {@code ResponseStatusException} serialises without its sentence on
 * this backend, so every refusal here would reach the trainer as "that did not
 * go through". Each of these has a cause the trainer can act on.
 */
@Getter
public class AssessmentRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AssessmentRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    private static AssessmentRuleException bad(String code, String message) {
        return new AssessmentRuleException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static AssessmentRuleException unknownMetric(String id) {
        return bad("ASSESSMENT_METRIC_UNKNOWN", "Unknown measurement: " + id);
    }

    public static AssessmentRuleException valueRange(MetricCatalogue.Metric metric) {
        return bad("ASSESSMENT_VALUE_RANGE",
                "%s should be between %s and %s %s. Check the number."
                        .formatted(metric.label(), metric.min().toPlainString(),
                                   metric.max().toPlainString(), metric.unit()));
    }

    public static AssessmentRuleException intervalRange(int min, int max) {
        return bad("ASSESSMENT_INTERVAL_RANGE",
                "How often you measure has to be between %d and %d days.".formatted(min, max));
    }

    /* ── V14 · the questionnaire ─────────────────────────────────────────── */

    /** A field was refused; the message names it. */
    public static AssessmentRuleException validation(String message) {
        return new AssessmentRuleException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
    }

    /** Not one of the caller's sent assessments, or deleted. */
    public static AssessmentRuleException assessmentNotFound() {
        return new AssessmentRuleException(HttpStatus.NOT_FOUND, "ASSESSMENT_NOT_FOUND",
                "That assessment is not on your books.");
    }

    /** Not one of the caller's assessment templates, or deleted. */
    public static AssessmentRuleException templateNotFound() {
        return new AssessmentRuleException(HttpStatus.NOT_FOUND, "ASSESSMENT_TEMPLATE_NOT_FOUND",
                "That assessment template is not in your library.");
    }
}
