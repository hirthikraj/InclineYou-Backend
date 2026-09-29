package com.inclineyou.inclineyou_backend.core.trainer.dto;

import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Step 3 — the new number, and the ticket from step 2. */
public record NewPhoneRequest(
        /** From step 2. Not a bearer token — see {@code JwtService.ROLE_PHONE_CHANGE}. */
        @NotBlank String ticket,
        /* The sign-in rule exactly: the new number must be one sign-in accepts. */
        @NotBlank @Pattern(regexp = SendOtpRequest.PHONE_PATTERN, message = SendOtpRequest.PHONE_MESSAGE) String phone
) {}
