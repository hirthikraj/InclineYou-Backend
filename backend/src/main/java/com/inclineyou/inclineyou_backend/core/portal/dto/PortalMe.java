package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;

import java.util.List;

/**
 * {@code GET /v1/portal/me} (api-contract 1.2, p-a1): who the client is, whose client they are, and the wall — the shell's one read.
 *
 * <p>It is the only portal route that answers for a paused or removed client, so everything the wall draws is here. A removed client
 * gets the trainer's NAME only: the person has left, so no bio, links or number. {@code pausedUntil} is a date, when the trainer set one.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PortalMe(
        String phone,
        String access,
        String pausedUntil,
        Long removedAt,
        String removedBy,
        Long acknowledgedAt,
        Trainer trainer,
        MyDetails myDetails,
        boolean moneyVisible,
        int unreadNotices,
        int openAssessments,
        List<AuthResponse.PendingInvite> pendingInvites,
        Policy policy,
        Push push
) {
    /** {@code whatsappUrl} carries no text: the web appends the draft for whatever the client is asking about. */
    public record Trainer(String name, String headline, String bio, String introVideoId, List<String> certifications,
                          List<String> specialities, List<String> languages, String instagramHandle, String youtubeHandle,
                          String whatsappUrl) {}

    /** {@code dateOfBirth} and {@code phone} are read-only here: a changed number goes through the trainer. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record MyDetails(String name, String goal, Double heightCm, String timezone, String activityLevel, String dateOfBirth,
                            String phone, String version) {}

    public record Policy(String accepted, String current) {}

    /** {@code vapidPublicKey} is null until push is set up, and the portal hides the switch. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Push(String vapidPublicKey) {}
}
