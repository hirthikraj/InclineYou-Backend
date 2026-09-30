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
}
