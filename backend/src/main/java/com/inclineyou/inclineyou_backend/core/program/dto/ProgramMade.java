package com.inclineyou.inclineyou_backend.core.program.dto;

/** What a create answers with: the program, and whether this call made it (201) or found it (200). */
public record ProgramMade(ProgramItem program, boolean created) {}
