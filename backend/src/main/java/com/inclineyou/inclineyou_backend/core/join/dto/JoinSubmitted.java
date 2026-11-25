package com.inclineyou.inclineyou_backend.core.join.dto;

/** {@code received} — a new request; {@code updated} — this number had one waiting, and it now says this. */
public record JoinSubmitted(String result, String trainerName) {}
