package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.core.client.ClientPhoneGuard;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.Range;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/clients} (A5). {@code id} is optional and client-generated;
 * replaying one of this trainer's own ids answers the row that already exists.
 * The 18+ rule is the service's: it needs the workspace's calendar.
 */
public record CreateClientRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 100, message = "at most 100 characters") String name,
        /* Blank is no number (normalised to null below). */
        @Pattern(regexp = ClientPhoneGuard.PHONE_PATTERN, message = ClientPhoneGuard.PHONE_MESSAGE) String phone,
        LocalDate dateOfBirth,
        @NotNull(message = "independent or gym, required")
        @Pattern(regexp = "independent|gym", message = "independent or gym, required") String clientType,
        @Valid Schedule schedule
) {
    public CreateClientRequest {
        name = Text.strip(name);
        phone = Text.orNull(phone);
    }

    /** The {@code client_schedule} defaults the add flow's step 2 collects. */
    public record Schedule(
            @Pattern(regexp = "floor|home_visit|remote", message = "floor, home_visit or remote") String deliveryMode,
            @Range(min = 1, max = 480, message = "a whole number between {min} and {max}") Integer sessionDurationMinutes,
            @Range(min = 0, max = 14, message = "a whole number between {min} and {max}") Integer sessionsPerWeek
    ) {}
}
