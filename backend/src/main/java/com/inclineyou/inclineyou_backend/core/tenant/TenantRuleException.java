package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.Getter;

/**
 * A workspace rule the caller broke, with a code the app can branch on.
 *
 * <p>Same shape as {@code TeamRuleException}: prose is for the human, the
 * {@code code} is for the client. Adding a client-visible failure mode means
 * adding a code here AND to the catalogue in {@code API.md} — the app cannot
 * branch on a sentence.
 */
@Getter
public class TenantRuleException extends RuntimeException {

    private final String code;
    private final int status;

    public TenantRuleException(String code, int status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static TenantRuleException noWorkspace() {
        return new TenantRuleException("NO_WORKSPACE", 422,
                "You are not in a workspace yet. Finish setting up your account first.");
    }

}
