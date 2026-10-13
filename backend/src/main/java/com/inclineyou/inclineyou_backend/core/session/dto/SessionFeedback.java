package com.inclineyou.inclineyou_backend.core.session.dto;

/** What a client said about a workout (workout_feedback, one per session). {@code effort} is easy · right · hard, or null for a note alone. */
public record SessionFeedback(String effort, String note, long at) {}
