package com.inclineyou.inclineyou_backend.core.sessionlog;

/** A write's answer and whether this call made it (201) or found what an earlier call with the same id made (200). */
public record Created<T>(T body, boolean created) {}
