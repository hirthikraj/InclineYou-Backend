package com.inclineyou.inclineyou_backend.core.client;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * The secret in an invite link. 32 random bytes, base64url (43 characters, no padding); only its SHA-256 is ever
 * stored ({@code client_invite.token_hash}, 64 hex), so a database read cannot rebuild a working link. The raw token
 * exists in exactly one place after minting: the response that hands the link to the trainer.
 */
public final class InviteToken {

    /** A token is exactly this: 32 bytes as unpadded base64url. Anything else cannot be one, so it need not reach the database. */
    public static boolean wellFormed(String token) {
        return token != null && token.length() == 43 && token.chars().allMatch(c ->
                (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_');
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    private InviteToken() {}

    public static String mint() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    /** Lower-case hex SHA-256 — the shape {@code client_invite_token_format} requires. */
    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
