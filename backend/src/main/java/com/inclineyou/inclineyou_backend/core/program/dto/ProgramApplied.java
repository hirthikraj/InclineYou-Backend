package com.inclineyou.inclineyou_backend.core.program.dto;

/** The new plan with {@code linkedSessions}; {@code created} is 201, a replayed id is 200. */
public record ProgramApplied(ProgramItem plan, boolean created) {}
