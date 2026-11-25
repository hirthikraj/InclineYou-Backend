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
        /** v1.2: no WhatsApp session reminders for this client, whatever the trainer's switch says. */
        Boolean remindersExcluded,
        /** v1.2: {@code true} / {@code false} is the trainer's answer for this client, {@code null} follows {@code clients_see_money}. */
        Patch<Boolean> portalShowMoney,
        @Null(message = "use pause, resume, archive or unarchive") Object status,
        /* V43 (22 Nov 2026): the business record, like the date of birth — not consent-locked. Null clears it. */
        Patch<@Pattern(regexp = "female|male|other|prefer_not_to_say", message = "female, male, other or prefer_not_to_say") String> gender,
        /* V48 (23 Nov 2026): the lead fields — the business record, not consent-locked. Null clears each. */
        Patch<@Pattern(regexp = Lead.SOURCES, message = Lead.SOURCES_MESSAGE) String> leadSource,
        Patch<@Size(max = 80, message = "at most 80 characters") String> leadSourceDetail,
        Patch<java.util.UUID> interestedPackId,
        Patch<LocalDate> nextFollowUpOn
) {
    public UpdateClientRequest {
        name = Patch.map(name, String::strip);
        phone = Patch.map(phone, Text::orNull);
        goal = Patch.map(goal, Text::orNull);
        leadSourceDetail = Patch.map(leadSourceDetail, Text::orNull);
    }

    public boolean isEmpty() {
        return name == null && phone == null && dateOfBirth == null && clientType == null
                && goal == null && heightCm == null && activityLevel == null && gender == null
                && remindersExcluded == null && portalShowMoney == null
                && leadSource == null && leadSourceDetail == null && interestedPackId == null && nextFollowUpOn == null;
    }
}
