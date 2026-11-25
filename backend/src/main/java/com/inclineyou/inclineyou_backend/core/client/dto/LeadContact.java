package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * V48 — one time the trainer reached a lead. {@code note} is what they said, at most 280 characters, private to the trainer;
 * {@code followUpOn} is the date this contact set as the next follow-up (ISO, or null — none, or a closing outcome).
 */
public record LeadContact(String id, String channel, String outcome, String note, String followUpOn, long createdAt) {}
