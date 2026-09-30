package com.inclineyou.inclineyou_backend.shared.wire;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.springframework.http.HttpStatus;

/**
 * The optimistic-lock half of the 1.1 wire: a resource's {@code version} is its
 * {@code updated_at} as epoch ms, it rides out as {@code version} and {@code ETag},
 * and comes back as {@code If-Match}.
 *
 * <p>Two strengths, as the contract has them. A PUT replaces a whole value, so a
 * lost update loses data and the header is {@link #require required} (428). A
 * PATCH sends only what changed, so the header is honoured when sent and a write
 * without one simply goes through — {@link #stale} alone.
 */
public final class IfMatch {

    private IfMatch() {}

    /**
     * An If-Match that was sent, isn't {@code *}, and names another version. A
     * weak-validator prefix and the quotes an ETag travels in are both ignored.
     */
    public static boolean stale(String ifMatch, String version) {
        if (ifMatch == null || ifMatch.isBlank() || "*".equals(ifMatch.strip())) return false;
        return !ifMatch.strip().replaceFirst("^W/", "").replace("\"", "").equals(version);
    }

    /** 428 when the header is missing — for the routes that replace a whole value. */
    public static void require(String ifMatch, String what) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new ApiException(HttpStatus.PRECONDITION_REQUIRED, "PRECONDITION_REQUIRED",
                    "Send If-Match with " + what + "'s version.");
        }
    }

    /** 412 when the header names a version other than the current one. */
    public static void check(String ifMatch, String version, String message) {
        if (stale(ifMatch, version)) throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED", message);
    }
}
