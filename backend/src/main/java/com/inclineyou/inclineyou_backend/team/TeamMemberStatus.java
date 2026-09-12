package com.inclineyou.inclineyou_backend.team;

/**
 * Where a membership is in its life, from the team's side.
 *
 * <p>Invites live in {@code team_member} rather than in a separate invite table,
 * because an invite <em>is</em> a membership that has not been agreed to — the
 * shape V18 chose for {@code client.membership_status}. Splitting them would
 * mean accepting an invite deletes one row and writes another, losing the
 * invitation date that answers "how long has this coach been with us".
 */
public final class TeamMemberStatus {

    /** Asked, not yet answered. May not have an InclineYou account yet. */
    public static final String INVITED = "invited";

    /** In the team. The only status that consumes a seat. */
    public static final String ACTIVE = "active";

    /** Said no. Re-inviting them later is allowed and deliberate. */
    public static final String DECLINED = "declined";

    /** Removed, or left, or had their pending invite revoked. */
    public static final String REMOVED = "removed";

    private TeamMemberStatus() {}
}
