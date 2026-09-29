package com.inclineyou.inclineyou_backend.core.auth.dto;

import com.inclineyou.inclineyou_backend.core.auth.JwtTokenIssuer;
import com.inclineyou.inclineyou_backend.core.auth.SessionTokenIssuer;

import java.util.List;

/** What every sign-in route answers: the credential, and which screen this sign-in is owed. */
public record AuthResponse(
        String token,
        String trainerId,
        boolean isNewUser,
        boolean setupComplete,
        /**
         * "trainer" | "client" | "pending" | "invited" | "removed" |
         * "unattached" | "gym_admin" — which screen this sign-in is owed.
         */
        String role,
        /** The trainer's own name, for "Welcome back, Ravi". Null before setup. */
        String trainerName,
        /** Every roster this number is on that is still worth drawing. */
        List<Membership> clientOf,
        /** Set only when every LIVE roster is paused — who paused it and when. */
        PausedInfo paused,
        /** Set only on the `removed` role — who removed them and when. */
        RemovedInfo removed,

        /**
         * `jwt` or `session` — which kind of credential {@code token} is.
         *
         * <p>The web needs to know it holds something revocable (so "sign
         * out" can mean it) and the phone needs to know it holds something
         * that works with no signal. Nothing on the server branches on it.
         *
         * <p>Derived from the token rather than passed in, so the eight
         * places that build this response did not have to learn about
         * issuers to keep working.
         */
        String tokenKind
) {
    /** The nine-argument form every mint site already used. */
    public AuthResponse(String token, String trainerId, boolean isNewUser,
                        boolean setupComplete, String role, String trainerName,
                        List<Membership> clientOf, PausedInfo paused, RemovedInfo removed) {
        this(token, trainerId, isNewUser, setupComplete, role, trainerName,
             clientOf, paused, removed, kindOf(token));
    }

    private static String kindOf(String token) {
        if (token == null) return null;
        return token.startsWith(SessionTokenIssuer.PREFIX)
                ? SessionTokenIssuer.KIND : JwtTokenIssuer.KIND;
    }

    /**
     * One roster this number is on. `clientId` is what the client endpoints are
     * asked for; the trainer's name and gym are what the screen says.
     *
     * The trainer's UPI VPA is deliberately not here. It reaches the device with
     * the rest of the coach record on the first client sync, is used to build a
     * deep link, and is never rendered.
     */
    public record Membership(
            String clientId,
            String trainerId,
            String clientName,
            String trainerName,
            String gymName,
            String trainerPhone,
            /** The TRAINER's view: `active` | `paused` | `archived` | `inactive`. */
            String status,
            /**
             * The CLIENT's own answer: `invited` | `accepted` | `declined` |
             * `paused` | `removed`. Kept apart from `status` because the two
             * answer to different people and can legitimately disagree.
             */
            String membershipStatus,
            /** "2026-07-22", or null when this roster isn't paused. */
            String pausedOn
    ) {}

    public record PausedInfo(String trainerName, String trainerPhone, String pausedOn) {}

    /** Who ended it and when, so the notice can name them rather than just close. */
    public record RemovedInfo(
            String clientId,
            String trainerName,
            String trainerPhone,
            String removedOn
    ) {}
}
