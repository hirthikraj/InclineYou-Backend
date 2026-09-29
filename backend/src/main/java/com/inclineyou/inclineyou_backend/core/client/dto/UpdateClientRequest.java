package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.core.client.ClientPhoneGuard;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Null;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * {@code PATCH /v1/clients/{id}} (A6) — any subset of the client's own fields.
 * A component left null was not sent; a {@link Patch} holding null clears it.
 *
 * <p>{@code status} is accepted only so it can be refused with a sentence that
 * names the right route: a status changes through the four verbs, which have
 * effects a PATCH would skip.
 */
public record UpdateClientRequest(
        Patch<@NotBlank(message = "required") @Size(max = 100, message = "at most 100 characters") String> name,
        Patch<@Pattern(regexp = ClientPhoneGuard.PHONE_PATTERN, message = ClientPhoneGuard.PHONE_MESSAGE) String> phone,
        Patch<LocalDate> dateOfBirth,
        Patch<@NotNull(message = "independent or gym")
              @Pattern(regexp = "independent|gym", message = "independent or gym") String> clientType,
        Patch<@Size(max = 1000, message = "at most 1000 characters") String> goal,
        Patch<@DecimalMin(value = "50", message = "between 50 and 250")
              @DecimalMax(value = "250", message = "between 50 and 250") BigDecimal> heightCm,
        Patch<@Pattern(regexp = "sedentary|light|moderate|active|very_active",
                       message = "sedentary, light, moderate, active, very_active or null") String> activityLevel,
        @Null(message = "use pause, resume, archive or unarchive") Object status
) {
    public UpdateClientRequest {
        name = Patch.map(name, String::strip);
        phone = Patch.map(phone, Text::orNull);
        goal = Patch.map(goal, Text::orNull);
    }

    public boolean isEmpty() {
        return name == null && phone == null && dateOfBirth == null && clientType == null
                && goal == null && heightCm == null && activityLevel == null;
    }
}
