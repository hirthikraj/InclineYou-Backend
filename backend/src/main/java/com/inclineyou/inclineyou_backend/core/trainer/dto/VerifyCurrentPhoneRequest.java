package com.inclineyou.inclineyou_backend.core.trainer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Step 2 of a number change — the code sent to the number signed in with. */
public record VerifyCurrentPhoneRequest(
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit code") String otp
) {}
