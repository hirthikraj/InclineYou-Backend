package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;

import java.util.List;

/** An assessment template on the wire (contract Assessments L3). */
public record TemplateItem(
        String id,
        String name,
        String description,
        Measurements measurements,
        Questions questions,
        /* Clients on it right now — the shelf warns before a delete. */
        int liveCycles,
        long createdAt,
        long updatedAt,
        String version
) {
    public record Measurements(boolean on, List<String> keys) {}

    public record Questions(boolean on, List<AssessmentCatalogue.Question> items) {}
}
