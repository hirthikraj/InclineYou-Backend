package com.inclineyou.inclineyou_backend.core.trainer.dto;

/** The ticket and the instant (epoch ms) it stops being good — ten minutes on. */
public record StepUpTicketResponse(String ticket, long expiresAt) {}
