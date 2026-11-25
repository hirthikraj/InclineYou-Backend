package com.inclineyou.inclineyou_backend.core.join.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * {@code POST /v1/join/{slug}/code}: send a code to the number they typed. Unlike an invite the page does supply the number —
 * there is no other — so this is exactly as open as the login page's own request, behind the same abuse guard.
 */
public record JoinCodeRequest(
        @NotBlank(message = "required") String phone,
        @NotNull(message = "required") LocalDate dateOfBirth,
        @NotBlank(message = "required") String policyVersion
) {}
