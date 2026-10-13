package com.inclineyou.inclineyou_backend.core.invite.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * {@code POST /v1/invites/{token}/code} (api-contract 1.2, inv-a2). There is no phone here and there never will be: the code goes
 * to the number on the invite, so a link cannot be used to make us message somebody else's.
 */
public record InviteCodeRequest(
        @NotNull(message = "required") LocalDate dateOfBirth,
        @NotNull(message = "required") String policyVersion
) {}
