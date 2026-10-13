package com.inclineyou.inclineyou_backend.core.webhook;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * Meta signs every webhook POST: {@code X-Hub-Signature-256: sha256=<hex>}, an HMAC-SHA256 of the RAW body keyed by the app's
 * secret. The signature is the route's only authentication, so it is checked over the bytes as they arrived — a body parsed and
 * re-serialised is a different body — and compared in constant time.
 */
final class WhatsAppSignature {

    private static final String PREFIX = "sha256=";

    private WhatsAppSignature() {}

    /** False for a missing header, a malformed one, a blank secret, or a mismatch — nothing else is distinguished. */
    static boolean valid(String header, byte[] body, String appSecret) {
        if (header == null || !header.startsWith(PREFIX) || appSecret == null || appSecret.isBlank()) return false;
        byte[] given;
        try {
            given = HexFormat.of().parseHex(header.substring(PREFIX.length()).trim());
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(given, hmac(body, appSecret));
    }

    static byte[] hmac(byte[] body, String appSecret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(body);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Constant-time string compare, for the verify token. */
    static boolean same(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
