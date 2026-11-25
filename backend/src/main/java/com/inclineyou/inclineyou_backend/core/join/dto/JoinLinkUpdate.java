package com.inclineyou.inclineyou_backend.core.join.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

/**
 * {@code PUT /v1/join-link}: the whole settings form, one Save. Every field is the new value; a null text is "none".
 * The service checks the rest (slug shape and uniqueness, the questions, packs that are the trainer's own).
 */
public record JoinLinkUpdate(
        /* Ignored since 22 Nov 2026: the link is made from the business name and never edited. Kept so older callers still parse. */
        String slug,
        @NotNull(message = "required") Boolean takingJoins,
        String welcomeLine,
        List<JoinQuestion> questions,
        List<UUID> packIds,
        @NotNull(message = "required") Boolean allowNoPlan,
        String welcomeMessage,
        UUID checkInTemplateId
) {}
