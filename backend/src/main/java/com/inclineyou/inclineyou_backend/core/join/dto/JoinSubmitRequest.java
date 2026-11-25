package com.inclineyou.inclineyou_backend.core.join.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** {@code POST /v1/join/{slug}/requests}: the code, and everything the form asked. */
public record JoinSubmitRequest(
        @NotBlank(message = "required") String requestId,
        @NotBlank(message = "required") @Pattern(regexp = "^\\d{6}$", message = "six digits") String otp,
        @NotBlank(message = "required") String phone,
        @NotBlank(message = "required") @Size(max = 100, message = "at most 100 characters") String name,
        @Email(message = "an email address") @Size(max = 254, message = "at most 254 characters") String email,
        @NotNull(message = "required") LocalDate dateOfBirth,
        @Pattern(regexp = "female|male|other|prefer_not_to_say", message = "female, male, other or prefer_not_to_say") String gender,
        UUID packId,
        @Valid @Size(max = 15, message = "at most 15") List<Answer> answers,
        @NotBlank(message = "required") String policyVersion,
        Boolean trainingTerms,
        Boolean whatsappReminders
) {
    /**
     * One answer, the assessment's shape: {@code yes} for yes/no, {@code rating} for a rating, {@code text} for text (and the
     * "Other" line of a choice), {@code optionIds} for a choice. {@code answer} is the pre-22-Nov plain string, still
     * read as text or as an option's wording.
     */
    public record Answer(@NotBlank(message = "required") String questionId, Boolean yes, Integer rating, String text,
                         List<String> optionIds, String answer) {}
}
