package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST} and {@code PUT /v1/assessment-templates} — the whole form, because
 * the editor saves one form. {@code id} is a POST's safe-retry key; a PUT that
 * sends one must send its own. What only the catalogue can judge (a key, a
 * scale, a choice with one option) is checked in {@code AssessmentTemplateService}.
 *
 * <p>{@code name}, {@code measurements} and {@code questions} are required unless {@code systemKey} is sent, which is a
 * different request altogether (<em>give me the weekly check-in</em>) and so takes nothing else; the service says which,
 * because a bean constraint cannot say "unless".
 */
public record TemplateRequest(
        UUID id,
        @Size(max = 120, message = "at most 120 characters") String name,
        @Size(max = 2000, message = "at most 2,000 characters") String description,
        @Valid Measurements measurements,
        @Valid Questions questions,
        /* POST only: make (or find) the product's own template of this key, with nothing else in the body. */
        String systemKey,
        /* Offered to clients under "Start a new one". POST: default false. PUT: absent leaves it as it was. */
        Boolean clientCanStart
) {
    public record Measurements(@NotNull(message = "required") Boolean on, List<String> keys) {}

    public record Questions(@NotNull(message = "required") Boolean on,
                            @Size(max = 50, message = "at most 50 questions") List<AssessmentCatalogue.Question> items) {}
}
