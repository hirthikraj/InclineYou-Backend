package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** {@code startedAt} optionally back-dates the start (epoch ms); never in the future. */
public record StartRequest(Long startedAt) {}
