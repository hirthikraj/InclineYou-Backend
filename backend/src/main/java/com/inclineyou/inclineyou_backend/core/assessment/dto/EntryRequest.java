package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * {@code PUT /v1/assessments/{id}/entry} — the whole entry, which is why it is a
 * PUT: readings and answers replace what was there. Which keys and ids are
 * allowed depends on this assessment's own form, so that is checked in
 * {@code AssessmentEntryService}, not here.
 *
 * @param completedAt optional back-date, epoch ms; never in the future
 */
public record EntryRequest(
        @NotNull(message = "required") Map<String, BigDecimal> readings,
        @NotNull(message = "required") Map<String, @Valid @NotNull(message = "required") Answer> answers,
        @NotNull(message = "required") Boolean complete,
        Long completedAt
) {
    /**
     * One answer. Only the fields its question's kind uses may be set: {@code yes}
     * for yesno, {@code rating} for rating, {@code text} for text, and
     * {@code optionIds} (plus {@code text} when the question allows a custom
     * answer) for choice. Null fields are not stored.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Answer(Boolean yes, Integer rating, String text, List<String> optionIds) {}
}
