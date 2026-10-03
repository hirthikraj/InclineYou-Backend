package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** Who the log is for. */
public record LogClient(String id, String name, boolean hasPinnedNote) {}
