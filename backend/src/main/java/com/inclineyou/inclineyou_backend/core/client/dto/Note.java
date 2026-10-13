package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * A trainer's note on a client. {@code version} is the If-Match for a PATCH.
 *
 * <p>{@code sharedWithClient} and {@code sharedAt} (api-contract 1.2, tr-a9) go together: a note is private until the trainer
 * chooses to show it to the client, and the date it was shown is kept with the choice. Every note written before sharing existed
 * is private.
 */
public record Note(String id, String body, boolean pinned, long createdAt, long updatedAt, String version,
                   boolean sharedWithClient, Long sharedAt) {}
