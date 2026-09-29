package com.inclineyou.inclineyou_backend.core.trainer.dto;

import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Step 4 — the code from the new number, and the swap. */
public record ConfirmNewPhoneRequest(
        @NotBlank String ticket,
        @NotBlank @Pattern(regexp = SendOtpRequest.PHONE_PATTERN, message = SendOtpRequest.PHONE_MESSAGE) String phone,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit code") String otp
) {}
