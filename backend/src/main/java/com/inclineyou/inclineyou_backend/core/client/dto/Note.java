package com.inclineyou.inclineyou_backend.core.client.dto;

/** A trainer's note on a client. {@code version} is the If-Match for a PATCH. */
public record Note(String id, String body, boolean pinned, long createdAt, long updatedAt, String version) {}
