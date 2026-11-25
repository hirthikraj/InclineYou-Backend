package com.inclineyou.inclineyou_backend.core.join.dto;

import jakarta.validation.constraints.Pattern;

/** {@code POST /v1/join-requests/{id}/approve}. {@code clientType} defaults to {@code independent}, as Add client's does. */
public record ApproveJoinRequest(
        @Pattern(regexp = "independent|gym", message = "independent or gym") String clientType
) {}
