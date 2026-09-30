package com.inclineyou.inclineyou_backend.core.program.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * {@code PATCH /v1/programs/{id}} (A3) — a client plan's status, or a name, goal
 * or dates without a tree. A component left null was not sent; a {@link Patch}
 * holding null clears it. {@code status} and the dates are a plan's: a template
 * that is sent one is refused with {@code PROGRAM_IS_TEMPLATE}.
 */
public record PatchProgramRequest(
        Patch<@NotNull(message = "active, paused or completed")
              @Pattern(regexp = "active|paused|completed", message = "active, paused or completed") String> status,
        Patch<@NotBlank(message = "required") @Size(max = 150, message = "at most 150 characters") String> name,
        Patch<@Pattern(regexp = "weight_loss|strength|muscle_gain|rehab|general",
                       message = "weight_loss, strength, muscle_gain, rehab or general") String> goal,
        Patch<@Size(max = 2000, message = "at most 2000 characters") String> description,
        Patch<LocalDate> startDate,
        Patch<LocalDate> endDate
) {
    public PatchProgramRequest {
        name = Patch.map(name, String::strip);
        description = Patch.map(description, Text::orNull);
    }

    public boolean isEmpty() {
        return status == null && name == null && goal == null && description == null && startDate == null
                && endDate == null;
    }

    /** True when something other than the status is being edited — that is what bumps the program's version. */
    public boolean editsContent() {
        return name != null || goal != null || description != null || startDate != null || endDate != null;
    }
}
