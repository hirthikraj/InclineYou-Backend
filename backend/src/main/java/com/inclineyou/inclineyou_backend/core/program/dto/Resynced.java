package com.inclineyou.inclineyou_backend.core.program.dto;

/**
 * {@code POST /v1/programs/{id}/resync} (A6). {@code removed} and {@code added}
 * count main exercises — the plan's before and after, since the tree below the
 * workout is replaced wholesale.
 */
public record Resynced(String programId, String sourceId, int removed, int added, String version) {}
