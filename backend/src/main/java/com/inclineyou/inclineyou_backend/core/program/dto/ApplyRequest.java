package com.inclineyou.inclineyou_backend.core.program.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/programs/{templateId}/apply} (A5). {@code id} is the new plan's,
 * minted by the caller so a retried Apply cannot make two. There is no schedule
 * key: the week has one write path, {@code PUT /v1/clients/{id}/schedule}, and
 * strict binding turns a stray one into a 400.
 */
public record ApplyRequest(
        UUID id,
        @NotNull(message = "required") UUID clientId,
        @Size(max = 150, message = "at most 150 characters") String name,
        @Pattern(regexp = "weight_loss|strength|muscle_gain|rehab|general",
                 message = "weight_loss, strength, muscle_gain, rehab or general") String goal,
        LocalDate startDate,
        /* Defaults to the start plus the template's weeks. */
        LocalDate endDate
) {
    public ApplyRequest {
        name = Text.orNull(name);
    }
}
