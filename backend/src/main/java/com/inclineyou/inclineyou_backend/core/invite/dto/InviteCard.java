package com.inclineyou.inclineyou_backend.core.invite.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * What the invite page draws before anyone has a session (api-contract 1.2, inv-a1).
 *
 * <p>{@code state} is {@code valid}, {@code expired} or {@code used}, and the two that are not {@code valid} carry nothing
 * else: an unknown, expired, revoked, replaced or declined link all read {@code expired}, so a guess teaches nothing.
 * {@code phoneMasked} is the last four digits only — the full number never goes to the page.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record InviteCard(
        String state,
        String inviteId,
        String phoneMasked,
        Long expiresAt,
        Trainer trainer,
        String policyVersion,
        List<String> privacySummary
) {
    public static InviteCard expired() {
        return new InviteCard("expired", null, null, null, null, null, null);
    }

    public static InviteCard used() {
        return new InviteCard("used", null, null, null, null, null, null);
    }

    /**
     * The trainer as a client deciding whether to accept sees them. {@code introVideoId} and the two handles are derived, like
     * on {@code /v1/trainers/me}, so no consumer re-implements the parse; there is no photo, the initials stand in.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Trainer(
            String name,
            String headline,
            String bio,
            String introVideoId,
            List<String> certifications,
            List<String> specialities,
            List<String> languages,
            String instagramHandle,
            String youtubeHandle
    ) {}
}
