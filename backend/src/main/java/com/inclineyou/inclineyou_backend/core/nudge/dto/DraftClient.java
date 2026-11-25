package com.inclineyou.inclineyou_backend.core.nudge.dto;

/**
 * The client a message is for, and who it is from — what the wording and the link need.
 * {@code upiVpa} is the UPI ID of the client's workspace's business (tenant_business.upi_vpa, V46), null when they have not set one.
 */
public record DraftClient(String name, String phone, String trainerName, String upiVpa) {}
