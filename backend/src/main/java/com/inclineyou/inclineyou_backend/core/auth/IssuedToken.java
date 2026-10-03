package com.inclineyou.inclineyou_backend.core.auth;

import java.time.Instant;

/**
 * A credential as it goes out of the door.
 *
 * @param value     what the caller sends back. Opaque to everything but the
 *                  issuer that minted it.
 * @param kind      {@code jwt} or {@code session} — reported to the client so
 *                  the web app knows it holds something revocable and the phone
 *                  knows it holds something that works offline. Nothing branches
 *                  on it server-side.
 * @param expiresAt when it stops working
 * @param sessionId {@code web_session.id} — "this device" in Settings. Null for a
 *                  JWT, which has no row.
 */
public record IssuedToken(String value, String kind, Instant expiresAt, String sessionId) {}
