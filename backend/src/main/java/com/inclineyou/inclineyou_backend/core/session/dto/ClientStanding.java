package com.inclineyou.inclineyou_backend.core.session.dto;

/** The client's state as booking and reopening decide on it. */
public record ClientStanding(String status, String membershipStatus, Integer sessionDurationMinutes) {}
