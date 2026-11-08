package com.inclineyou.inclineyou_backend.core.nudge.dto;

/**
 * The client a message is for, and who it is from — what the wording and the link need.
 * {@code upiVpa} is the trainer's UPI ID (trainer_business.upi_vpa), null when they have not set one.
 */
public record DraftClient(String name, String phone, String trainerName, String upiVpa) {}
