package com.inclineyou.inclineyou_backend.shared.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * An ETag for a read whose answer is more than one row's version: a SHA-256 of the answer's text, its first 12 bytes in
 * hex (19 Nov 2026 — the third place that needed it: the client file header, one assessment, the forms shelf). The
 * answer must be records, lists and maps of plain values, whose {@code toString} is stable for equal content.
 */
public final class ContentTag {

    private ContentTag() {}

    public static String of(Object answer) {
        try {
            var md = MessageDigest.getInstance("SHA-256").digest(String.valueOf(answer).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(md, 0, 12);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
