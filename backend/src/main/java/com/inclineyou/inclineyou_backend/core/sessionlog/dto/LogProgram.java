package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** The program the session's workout belongs to; the whole field is null for an unplanned session. */
public record LogProgram(String id, String name, int weeks) {}
