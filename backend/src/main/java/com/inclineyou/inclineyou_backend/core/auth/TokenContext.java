package com.inclineyou.inclineyou_backend.core.auth;

/**
 * What the request knew about the caller's device when a credential was minted.
 *
 * <p>Only a session token stores this — it is what makes "you are signed in on
 * a MacBook and an iPhone" answerable, and therefore what makes "sign that one
 * out" possible. A JWT has nowhere to put it and does not want it: it is a
 * self-contained claim set, and a claim about the browser that requested it
 * would be a claim nobody checks.
 */
public record TokenContext(String userAgent, String ip) {
    public static final TokenContext NONE = new TokenContext(null, null);

    /** Long enough to recognise a browser, short enough to be a label. */
    public String truncatedUserAgent() {
        if (userAgent == null) return null;
        return userAgent.length() <= 300 ? userAgent : userAgent.substring(0, 300);
    }
}
