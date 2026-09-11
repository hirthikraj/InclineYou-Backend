package com.xrep.xrep_backend.tenant;

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

    public static TenantRuleException notAMember() {
        return new TenantRuleException("NOT_A_MEMBER", 404,
                "That workspace is not one of yours.");
    }

    public static TenantRuleException notAdmin() {
        return new TenantRuleException("NOT_TENANT_ADMIN", 403,
                "Only an owner or an admin can do that in this workspace.");
    }

    public static TenantRuleException switchingDisabled() {
        return new TenantRuleException("SWITCHING_DISABLED", 422,
                "Switching workspaces is turned off.");
    }

    public static TenantRuleException cannotLeaveOwn() {
        return new TenantRuleException("CANNOT_LEAVE_OWN", 422,
                "This is your own practice — you can't leave it.");
    }

    /** The narrowed roster rule: one client belongs to one coach, per workspace. */
    public static TenantRuleException alreadyInWorkspace(String name) {
        return new TenantRuleException("PHONE_IN_THIS_WORKSPACE", 409,
                ("This number is already on this workspace's roster — it's saved for %s. "
                 + "One number belongs to one coach here, so edit them instead of adding them again.")
                        .formatted(name));
    }

    public static TenantRuleException notACoachHere() {
        return new TenantRuleException("NOT_A_COACH_HERE", 422,
                "That person doesn't coach in this workspace.");
    }
}
