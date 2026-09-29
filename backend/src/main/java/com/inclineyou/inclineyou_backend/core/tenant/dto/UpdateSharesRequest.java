package com.inclineyou.inclineyou_backend.core.tenant.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

/** Null means leave it alone, the same contract {@code /v1/trainers/me} uses. */
public record UpdateSharesRequest(
        @DecimalMin(value = "0", message = "between 0 and 100")
        @DecimalMax(value = "100", message = "between 0 and 100") BigDecimal revenueSharePercent,
        @DecimalMin(value = "0", message = "between 0 and 100")
        @DecimalMax(value = "100", message = "between 0 and 100") BigDecimal assignmentMarginPercent
) {}
