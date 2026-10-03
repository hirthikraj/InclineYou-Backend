package com.inclineyou.inclineyou_backend.core.trainer.dto;

import com.inclineyou.inclineyou_backend.core.tenant.dto.Workspace;

/** {@code GET /v1/me} — the shell's own read, on every screen. */
public record MeResponse(
        String id,
        String name,
        String phone,
        /**
         * Null until setup is done — the redirect signal. Epoch ms since 1.1,
         * like every other instant on the wire (it was an ISO string in 1.0).
         */
        Long setupCompletedAt,
        String gymName,
        Workspace workspace,
        /** V8 — the directory place behind {@code gymName}; null for free text or no gym. */
        GymPlaceView gymPlace
) {}
