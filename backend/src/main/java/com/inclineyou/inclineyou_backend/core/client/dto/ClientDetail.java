package com.inclineyou.inclineyou_backend.core.client.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/** {@code GET /v1/clients/{id}}: the L3 summary row, flattened, plus the client's own fields and the pinned notes the header draws. */
public record ClientDetail(
        @JsonUnwrapped ClientSummary summary,
        String dateOfBirth,
        BigDecimal heightCm,
        String activityLevel,
        String goal,
        List<PinnedNote> pinnedNotes
) {
    public record PinnedNote(String id, String body, long updatedAt) {}

    /**
     * The ETag, and deliberately NOT {@code version}: {@code version} is
     * {@code client.updated_at}, the If-Match for a PATCH, and a pinned note or
     * a session marked done changes this response without touching that
     * column. A hash of the whole answer is the only tag a 304 can trust.
     */
    public String etag() {
        try {
            var md = MessageDigest.getInstance("SHA-256").digest(toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(md, 0, 12);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
