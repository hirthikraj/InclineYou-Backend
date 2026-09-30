package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST} and {@code PUT /v1/assessment-templates} — the whole form, because
 * the editor saves one form. {@code id} is a POST's safe-retry key; a PUT that
 * sends one must send its own. What only the catalogue can judge (a key, a
 * scale, a choice with one option) is checked in {@code AssessmentTemplateService}.
 */
public record TemplateRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 120, message = "at most 120 characters") String name,
        @Size(max = 2000, message = "at most 2,000 characters") String description,
        @NotNull(message = "required") @Valid Measurements measurements,
        @NotNull(message = "required") @Valid Questions questions
) {
    public record Measurements(@NotNull(message = "required") Boolean on, List<String> keys) {}

    public record Questions(@NotNull(message = "required") Boolean on,
                            @Size(max = 50, message = "at most 50 questions") List<AssessmentCatalogue.Question> items) {}
}
