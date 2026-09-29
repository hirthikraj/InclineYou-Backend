package com.inclineyou.inclineyou_backend.core.tenant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * {@code PATCH /v1/tenants/{id}/members/{memberId}/role}. {@code client} passes
 * here on purpose: the service refuses it with {@code NOT_A_COACH_HERE}, a code
 * the screen branches on.
 */
public record UpdateRoleRequest(
        @NotBlank
        @Pattern(regexp = "owner|admin|coach|gym_admin|gym_staff|client",
                 message = "owner, admin, coach, gym_admin, gym_staff or client") String role
) {}
