package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * What every sign-in route answers: the credential, and which screen this
 * sign-in is owed. Instants are epoch milliseconds.
 *
 * @param token                the bearer credential — an opaque session token on the web
 * @param sessionId            {@code web_session.id}, "this device" in Settings; null for a JWT
 * @param expiresAt            when the credential stops working
 * @param role                 {@code trainer} | {@code pending} (a new number)
 * @param trainerName          for "Welcome back, Ravi"; null before setup
 * @param setupCompletedAt     null until onboarding is finished
 * @param privacyPolicyVersion what they accepted; null for a number with no account
 * @param currentPolicyVersion what is in force — a mismatch sends them to the consent screen
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
        String currentPolicyVersion
) {}
