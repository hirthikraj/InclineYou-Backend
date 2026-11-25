package com.inclineyou.inclineyou_backend.core.join.dto;

import java.util.List;

/**
 * One of the trainer's own questions on the join page — the ASSESSMENT's question shape (22 Nov 2026), so both are written
 * with one builder on the web: {@code kind} is {@code yesno}, {@code rating} (out of {@code scale}: 5, 10 or 20),
 * {@code text} or {@code choice} ({@code options}, optionally {@code allowMultiple} and an "Other" line,
 * {@code allowCustom}). {@code required} is the join page's own: an assessment has none. Never about health.
 *
 * <p>Questions saved before 22 Nov 2026 were {@code {label, kind: text|choice, options: [string]}};
 * {@code JoinJdbcRepository.questions} reads those into this shape.
 */
public record JoinQuestion(String id, String text, String kind, Integer scale, List<Option> options,
                           Boolean allowMultiple, Boolean allowCustom, Boolean required) {
    public record Option(String id, String text) {}
}
