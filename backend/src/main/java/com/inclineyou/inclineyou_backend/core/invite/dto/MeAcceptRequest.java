package com.inclineyou.inclineyou_backend.core.invite.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * {@code POST /v1/me/invites/{inviteId}/accept} (api-contract 1.2, inv-a7). No code and no request id: the number was proved on the
 * login page and the session carries it. Only what the client says about themselves — their date of birth and the notice they agreed to.
 */
public record MeAcceptRequest(
        @NotNull(message = "required") LocalDate dateOfBirth,
        @NotBlank(message = "required") String policyVersion
) {}
