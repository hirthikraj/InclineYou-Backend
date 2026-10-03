package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** The client a message is for, and who it is from — what the wording and the link need. */
public record DraftClient(String name, String phone, String trainerName) {}
