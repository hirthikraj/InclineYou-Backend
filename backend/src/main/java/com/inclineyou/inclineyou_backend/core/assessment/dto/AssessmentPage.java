package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * {@code GET /v1/assessments}.
 *
 * @param total      only with {@code includeTotal=true} — matching the filter
 * @param grandTotal only with {@code includeTotal=true} — ignoring the filter: the "3 of 57" the list prints
 */
public record AssessmentPage(List<AssessmentItem> items, String nextCursor,
                             @JsonInclude(JsonInclude.Include.NON_NULL) Integer total,
                             @JsonInclude(JsonInclude.Include.NON_NULL) Integer grandTotal) {}
