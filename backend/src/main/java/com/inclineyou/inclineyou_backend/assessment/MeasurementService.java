package com.inclineyou.inclineyou_backend.assessment;

import java.util.ArrayList;
import java.util.List;

/**
 * V5 · the measuring cycle's validation.
 *
 * <p>What is left of V5 once its `assessment` sitting table was removed (23 Sep
 * 2026 — the name now belongs to the questionnaire, V14) and `body_metric` was
 * dropped (V22 — a body is measured in an assessment and nowhere else, so its
 * correction routes went with it). The cadence columns stay on `client` and
 * `trainer`, validated here for {@code ClientService} and {@code TrainerService}.
 */
public final class MeasurementService {

    public static final int MIN_INTERVAL_DAYS = 7;
    public static final int MAX_INTERVAL_DAYS = 365;

    /* ── shared validation, used by ClientService and TrainerService ─────── */

    public static Short validInterval(Integer days) {
        if (days == null || days == 0) return null;
        if (days < MIN_INTERVAL_DAYS || days > MAX_INTERVAL_DAYS) {
            throw AssessmentRuleException.intervalRange(MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
        }
        return days.shortValue();
    }

    /** Unknown ids are refused rather than stored — see {@link MetricCatalogue}. */
    public static List<String> validMetrics(List<String> ids) {
        if (ids == null) return null;
        var out = new ArrayList<String>();
        for (String id : ids) {
            String trimmed = id == null ? null : id.trim();
            if (trimmed == null || trimmed.isEmpty()) continue;
            if (!MetricCatalogue.has(trimmed)) throw AssessmentRuleException.unknownMetric(trimmed);
            if (!out.contains(trimmed)) out.add(trimmed);
        }
        return MetricCatalogue.ids().stream().filter(out::contains).toList();
    }

    private MeasurementService() {}
}
