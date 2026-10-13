package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * A line from the trainer to one client (api-contract 1.2, tr-a7).
 *
 * @param kind      {@code note}, {@code weekly}, or {@code recap} — the last is derived: it is what a message about a session is
 * @param sessionId the session a recap is about; null for every other kind
 * @param at        epoch ms it was written
 * @param readAt    epoch ms the client opened it, or null: the trainer sees whether it was read, and it can be edited only until then
 * @param version   {@code updated_at} as epoch ms — the {@code If-Match} for an edit
 */
public record Message(String id, String kind, String body, String sessionId, long at, Long readAt, String version) {}
