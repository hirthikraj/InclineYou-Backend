package com.inclineyou.inclineyou_backend.core.nudge.dto;

import java.util.List;

/**
 * @param isDefault false once the trainer has saved their own — the editor draws Reset only then.
 * @param version   the override's version, null while built-in.
 */
public record TemplateResponse(
        String name,
        String label,
        String purpose,
        String body,
        boolean isDefault,
        List<VariableResponse> variables,
        String version
) {}
