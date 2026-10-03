package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** One of the plan's own swaps for a movement, shown before the library. */
public record Alternative(String planRowId, String exerciseId, String name) {}
