package com.inclineyou.inclineyou_backend.core.invite.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;

/**
 * {@code POST /v1/invites/{token}/accept} (api-contract 1.2, inv-a3). The code, the request it was sent for, and the two things
 * the client said on the way here: their own date of birth and the notice they agreed to. No number — the invite names it.
 */
public record AcceptRequest(
        @NotBlank(message = "required") String requestId,
        @NotBlank(message = "required") @Pattern(regexp = "^\\d{6}$", message = "six digits") String otp,
        @NotNull(message = "required") LocalDate dateOfBirth,
        @NotBlank(message = "required") String policyVersion
) {}
