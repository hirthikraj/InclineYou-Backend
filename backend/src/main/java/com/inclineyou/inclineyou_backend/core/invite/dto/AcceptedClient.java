package com.inclineyou.inclineyou_backend.core.invite.dto;

import java.util.List;

/**
 * What "Let me in" answers (api-contract 1.2, inv-a3): an ordinary client web session and whose client this is. The shape the
 * verify route will answer for a client too, so the page that follows reads one thing wherever the client came from.
 *
 * <p>{@code token} is the credential and is for the Next server to put in an httpOnly cookie, never for page script.
 * {@code trainer} carries no id: nothing in the portal is addressed by it.
 */
public record AcceptedClient(
        String token,
        String sessionId,
        long expiresAt,
        String role,
        boolean isNewUser,
        String access,
        Trainer trainer,
        List<Object> pendingInvites
) {
    public record Trainer(String name, String headline) {}
}
