package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * One row of {@code GET /v1/auth/sessions} — a browser the account is signed in on.
 *
 * <p>Instants are epoch milliseconds like every other v1.1 instant. {@code
 * token_hash}, {@code created_ip} and the expiry are not here and never will be:
 * the list exists to let a person recognise a device and end it, and a hash of a
 * live credential is nothing a person needs to read.
 */
public record SessionItem(String id, String userAgent, long issuedAt, long lastSeenAt, boolean current) {}
