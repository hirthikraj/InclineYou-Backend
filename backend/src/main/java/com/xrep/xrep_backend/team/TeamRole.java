package com.xrep.xrep_backend.team;

/**
 * Three roles, held as strings like every other status in this schema so that
 * adding a fourth is a code change and not a migration.
 *
 * <p>The owner is not a fourth kind of admin. It is the admin who cannot be
 * removed — that single difference is the whole reason the role exists, and
 * every other capability an owner has follows from it.
 */
public final class TeamRole {

    /** Created the team, or had it transferred to them. Exactly one per team. */
    public static final String OWNER = "owner";

    /** Everything the owner can do, except the things that end the team. */
    public static final String ADMIN = "admin";

    /** Their own clients, the coach list, and the shared library. */
    public static final String COACH = "coach";

    /** Can invite, remove coaches, reassign clients, and read teammates' clients. */
    public static boolean administers(String role) {
        return OWNER.equals(role) || ADMIN.equals(role);
    }

    /**
     * Roles a member may be moved to by hand. {@link #OWNER} is absent
     * deliberately: promoting somebody to owner is a transfer, which also
     * demotes the current owner and rewrites {@code team.owner_trainer_id}, and
     * that is one transaction rather than a role edit.
     */
    public static boolean isAssignable(String role) {
        return ADMIN.equals(role) || COACH.equals(role);
    }

    private TeamRole() {}
}
