package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * {@code PATCH /v1/portal/me} (p-a4): the five things a client may change about themselves — and no others, because strict binding
 * refuses an unknown key before the database's column guard has to. A component left null was not sent; a {@link Patch} holding null
 * clears it, except where the column is NOT NULL ({@code name}, {@code timezone}), where {@code @NotNull} on the type argument means
 * "may be left out, may not be cleared".
 */
public record UpdatePortalMeRequest(
        Patch<@NotBlank(message = "required") @Size(max = 100, message = "at most 100 characters") String> name,
        Patch<@Size(max = 1000, message = "at most 1000 characters") String> goal,
        Patch<@DecimalMin(value = "50", message = "between 50 and 250")
              @DecimalMax(value = "250", message = "between 50 and 250") BigDecimal> heightCm,
        Patch<@NotNull(message = "required") @Size(max = 64, message = "at most 64 characters") String> timezone,
        Patch<@Pattern(regexp = "sedentary|light|moderate|active|very_active",
                       message = "sedentary, light, moderate, active, very_active or null") String> activityLevel
) {
    public UpdatePortalMeRequest {
        name = Patch.map(name, String::strip);
        goal = Patch.map(goal, Text::orNull);
        timezone = Patch.map(timezone, String::strip);
    }

    public boolean isEmpty() {
        return name == null && goal == null && heightCm == null && timezone == null && activityLevel == null;
    }
}
