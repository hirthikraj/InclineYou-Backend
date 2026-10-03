package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** The draft, and whether this call wrote it (201) or a replay found it (200). */
public record Drafted(Draft draft, boolean created) {}
