package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;

import java.util.List;
import java.util.Map;

/**
 * One assessment in full (contract Assessments L2) — its page and the take screen.
 * {@code item} is flattened into the top level, so the list item's fields sit
 * beside {@code client}, {@code asked}, {@code entry} and the rest.
 */
public record AssessmentDetail(
        @com.fasterxml.jackson.annotation.JsonUnwrapped AssessmentItem item,
        ClientRef client,
        TemplateRef template,
        ScheduleItem schedule,
        Asked asked,
        Entry entry,
        List<ReadingView> readings,
        List<AnswerView> answers,
        List<History> history,
        List<Returned> returned
) {
    public record ClientRef(String id, String name, String status) {}

    /** {@code deleted} because an assessment outlives its template — its form is its own copy. */
    public record TemplateRef(String id, String name, String description, boolean deleted) {}

    /** What this assessment asks — from its own copy of the form, not the template as it now stands. */
    public record Asked(List<FormMeasurement> measurements, List<AssessmentCatalogue.Question> questions) {}

    /** A measurement as copied into a form: the catalogue's label and unit, so the copy reads on its own. */
    public record FormMeasurement(String key, String label, String group, String unit) {}

    /** The raw entry, to prefill the take screen. */
    public record Entry(Map<String, Object> readings, Map<String, Object> answers) {}

    public record ReadingView(String key, String label, String group, String unit, boolean charted, Object value) {}

    /** An answer resolved against its question. Only the fields its kind uses are present. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AnswerView(String questionId, String text, String kind, Integer scale,
                             Boolean yes, Integer rating, List<String> optionIds, List<String> chosen,
                             String answer) {}

    public record Point(String assessmentId, long at, Object value) {}

    public record History(String key, List<Point> points) {}

    public record Returned(String id, String name, long at) {}
}
