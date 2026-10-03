package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** {@code endedAt} optionally back-dates the end (epoch ms), not before the start and never in the future. */
public record EndRequest(Long endedAt) {}
