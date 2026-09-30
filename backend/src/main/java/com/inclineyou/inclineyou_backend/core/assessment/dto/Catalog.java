package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;

import java.util.List;

/** {@code GET /v1/assessment-catalog} — what a template can ask. */
public record Catalog(List<String> groups, List<CatalogMeasurement> measurements,
                      List<AssessmentCatalogue.Question> questions) {

    /** {@code charted}: the client file draws a series for it (the six ids of MetricCatalogue). */
    public record CatalogMeasurement(String key, String label, String group, String unit, boolean charted) {}
}
