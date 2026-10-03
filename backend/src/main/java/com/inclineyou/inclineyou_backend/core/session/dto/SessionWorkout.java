package com.inclineyou.inclineyou_backend.core.session.dto;

/** The workout a session runs: a day of the client's program, or a standalone one. */
public record SessionWorkout(String id, String name, String programId, Integer week, Integer day) {}
