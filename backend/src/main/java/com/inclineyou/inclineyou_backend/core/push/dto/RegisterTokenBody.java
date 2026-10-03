package com.inclineyou.inclineyou_backend.core.push.dto;

import jakarta.validation.constraints.NotBlank;

/** {@code POST /v1/devices/token}: the app's native FCM token, and which platform it came from (logged, not stored). */
public record RegisterTokenBody(@NotBlank String token, String platform) {}
