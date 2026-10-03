package com.inclineyou.inclineyou_backend.core.payment.dto;

/** A create's answer: {@code created} is false for a replayed id (200). */
public record PackCreated(PackRow row, boolean created) {}
