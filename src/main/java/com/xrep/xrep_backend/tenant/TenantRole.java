package com.xrep.xrep_backend.tenant;

import java.util.Set;

/**
 * What somebody is inside a workspace.
 *
 * <p>Six values across three kinds of workspace. A solo tenant only ever has an
 * {@link #OWNER}; a team has all three of owner, admin and coach; a gym adds two
 * that do not coach at all.
 *
 * <p>The owner is not a fourth kind of admin — it is the admin who cannot be
 * removed, which is the same reading {@code team_member.role} has had since V26.
 */
public final class TenantRole {

    public static final String OWNER = "owner";
    public static final String ADMIN = "admin";
    public static final String COACH = "coach";
    public static final String GYM_ADMIN = "gym_admin";
    public static final String GYM_STAFF = "gym_staff";
    public static final String CLIENT = "client";

    /** Roles that may run the roster: assign clients, invite, see the numbers. */
    private static final Set<String> ADMINISTERS = Set.of(OWNER, ADMIN, GYM_ADMIN);

    /** Roles that may see what the whole workspace took. */
    private static final Set<String> READS_TENANT_REVENUE = Set.of(OWNER, ADMIN, GYM_ADMIN);

    public static boolean administers(String role) {
        return role != null && ADMINISTERS.contains(role);
    }

    public static boolean readsTenantRevenue(String role) {
        return role != null && READS_TENANT_REVENUE.contains(role);
    }

    public static boolean coaches(String role) {
        return OWNER.equals(role) || ADMIN.equals(role) || COACH.equals(role);
    }

    private TenantRole() {}
}
