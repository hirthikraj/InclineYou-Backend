package com.inclineyou.inclineyou_backend.core.client.dto;

/** The row and whether this call made it (201) or a replay found it (200). */
public record ClientCreated(ClientSummary client, boolean created) {}
