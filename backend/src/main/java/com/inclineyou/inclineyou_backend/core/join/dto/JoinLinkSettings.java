package com.inclineyou.inclineyou_backend.core.join.dto;

import java.util.List;
import java.util.UUID;

/**
 * {@code GET /v1/join-link} and the answer to {@code PUT}: the active workspace's join link. {@code exists} is false until the
 * first save, and the rest is then the defaults the screen starts from — a suggested {@code slug}, joins off.
 */
public record JoinLinkSettings(
        boolean exists,
        String slug,
        String url,
        boolean takingJoins,
        String welcomeLine,
        List<JoinQuestion> questions,
        List<UUID> packIds,
        boolean allowNoPlan,
        String welcomeMessage,
        UUID checkInTemplateId,
        Long updatedAt
) {}
