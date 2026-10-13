package com.inclineyou.inclineyou_backend.core.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * What every sign-in route answers: the credential, and which screen this
 * sign-in is owed. Instants are epoch milliseconds.
 *
 * @param token                the bearer credential — an opaque session token on the web
 * @param sessionId            {@code web_session.id}, "this device" in Settings; null for a JWT
 * @param expiresAt            when the credential stops working
 * @param role                 {@code trainer} | {@code client} | {@code pending} (a number with no account)
 * @param trainerName          for "Welcome back, Ravi"; null before setup
 * @param setupCompletedAt     null until onboarding is finished
 * @param privacyPolicyVersion what they accepted; null for a number with no account
 * @param currentPolicyVersion what is in force — a mismatch sends them to the consent screen
 * @param access               {@code client} only (api-contract 1.2): {@code active} · {@code paused} · {@code removed}, which is the
 *                             wall they land on. Absent for a trainer, so the 1.1 shape is unchanged.
 * @param trainer              {@code client} only: whose client this is. No id — nothing in the portal is addressed by it.
 * @param pendingInvites       the invites waiting for this number: for a {@code pending} number (possibly empty) and for a
 *                             {@code client} who has {@code removed} access and has been invited by somebody new. Absent otherwise.
 */
public record AuthResponse(
        String token,
        String sessionId,
        long expiresAt,
        String role,
        boolean isNewUser,
        String trainerId,
        String trainerName,
        Long setupCompletedAt,
        String privacyPolicyVersion,
        String currentPolicyVersion,
        @JsonInclude(JsonInclude.Include.NON_NULL) String access,
        @JsonInclude(JsonInclude.Include.NON_NULL) ClientTrainer trainer,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<PendingInvite> pendingInvites
) {
    /** The 1.1 shape: a trainer, or a number with nothing waiting. */
    public AuthResponse(String token, String sessionId, long expiresAt, String role, boolean isNewUser, String trainerId,
                        String trainerName, Long setupCompletedAt, String privacyPolicyVersion, String currentPolicyVersion) {
        this(token, sessionId, expiresAt, role, isNewUser, trainerId, trainerName, setupCompletedAt, privacyPolicyVersion,
                currentPolicyVersion, null, null, null);
    }

    public record ClientTrainer(String name, String headline) {}

    /** One invite waiting for the number that just signed in: enough to choose between them, never a token. */
    public record PendingInvite(String inviteId, String trainerName, String headline, long expiresAt) {}
}
