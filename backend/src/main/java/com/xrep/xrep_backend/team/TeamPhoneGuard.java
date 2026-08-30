package com.xrep.xrep_backend.team;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Who a team is allowed to invite as a coach.
 *
 * The sibling of {@link com.xrep.xrep_backend.client.ClientPhoneGuard}, written
 * in the same shape and refusing for the same family of reasons — one phone is
 * one person, and one person is in one place.
 *
 * <p>Trainer↔client duality is now allowed (see {@code ClientPhoneGuard} and
 * {@code AuthService#trainerView}): a client's number can also be invited as a
 * coach, and can switch between the two via {@code /v1/auth/mode/**}. Three
 * numbers still cannot be invited:
 *
 * <ol>
 *   <li><b>A number already in a coaching TEAM.</b> One team per trainer, and the
 *       partial unique index in V26 is the backstop; refusing here is what turns
 *       a constraint violation into a sentence.</li>
 *   <li><b>A number with an invite already PENDING to this team.</b> Two live
 *       invitations to one person is a race over which one they tap.</li>
 *   <li><b>The caller's own number.</b> They are already in the team.</li>
 * </ol>
 *
 * <h2>What does not block</h2>
 *
 * A number with a trainer account and no team — which is the common case and the
 * whole point. A number with <em>no account at all</em>, which is the acquisition
 * case: the invite is written against the phone and bound to a trainer id the
 * first time that number signs in. A number that is somebody's client — they
 * accept the invite the same way anyone does, by first claiming a trainer
 * account (`POST /v1/auth/trainer`) if they have not already, which coexists
 * with their client memberships rather than replacing them. And a number whose
 * invite was declined or whose membership was ended, for the same reason
 * {@code ClientPhoneGuard} lets an ended membership go: somebody who said no in
 * March may say yes in April, and a rule that outlives the refusal it describes
 * strands them forever.
 *
 * <h2>What the message never says</h2>
 *
 * Which team, or whose. "Already coaching at Iron House" would hand any gym
 * owner with a phone book a way to enumerate a competitor's staff one number at
 * a time. The sentence says the number is spoken for and stops there — exactly
 * the line {@code ClientPhoneGuard} draws, and for exactly the same reason.
 */
@Component
@RequiredArgsConstructor
public class TeamPhoneGuard {

    private final NamedParameterJdbcTemplate jdbc;

    /** The number is already in a coaching team. Recovery: they leave it first. */
    public static final String CODE_ALREADY_IN_TEAM = "PHONE_ALREADY_IN_TEAM";

    /** This team already has an invite out to it. Recovery: revoke it, or wait. */
    public static final String CODE_ALREADY_INVITED = "PHONE_ALREADY_INVITED";

    /** The caller's own number. Recovery: none needed. */
    public static final String CODE_IS_SELF = "PHONE_IS_SELF";

    private static final String MSG_ALREADY_IN_TEAM =
            "This number is already part of a coaching team. A trainer can only be in one team "
            + "at a time, so they need to leave that one before joining yours.";

    private static final String MSG_ALREADY_INVITED =
            "You've already invited this number. Wait for them to answer, or revoke the "
            + "invitation and send it again.";

    private static final String MSG_IS_SELF =
            "That's your own number — you're already in this team.";

    /**
     * Available, or the reason it is not.
     *
     * @param status the status the refusal deserves. Two of the three are 409 —
     *               the number is real and the request is well-formed, it is
     *               already spoken for — and inviting yourself is a 422, because
     *               nothing is in conflict, the request just does not mean
     *               anything.
     */
    public record Verdict(boolean available, String code, String message, HttpStatus status) {
        public static Verdict ok() { return new Verdict(true, null, null, null); }
    }

    /**
     * @param teamId    the inviting team — its own pending invites are what rule
     *                  2 looks at, and another team's are rule 1's business
     * @param callerPhone the inviter's number, for rule 3
     */
    public Verdict check(String teamId, String callerPhone, String phone) {
        if (phone == null || phone.isBlank()) return Verdict.ok();

        String normalized = phone.trim();
        if (normalized.equalsIgnoreCase(callerPhone)) {
            return new Verdict(false, CODE_IS_SELF, MSG_IS_SELF, HttpStatus.UNPROCESSABLE_CONTENT);
        }

        var row = jdbc.queryForMap("""
                SELECT
                    -- Any team, including this one. Matched on the trainer's own
                    -- number and on the number an unbound invite was sent to,
                    -- because an active membership may still be carrying either.
                    EXISTS(
                        SELECT 1 FROM team_member tm
                        LEFT JOIN trainer t ON t.id = tm.trainer_id
                        WHERE tm.status = 'active'
                          AND tm.deleted_at IS NULL
                          AND (t.phone = :phone OR tm.invited_phone = :phone)
                    ) AS in_a_team,

                    EXISTS(
                        SELECT 1 FROM team_member tm
                        LEFT JOIN trainer t ON t.id = tm.trainer_id
                        WHERE tm.team_id = :teamId::uuid
                          AND tm.status = 'invited'
                          AND tm.deleted_at IS NULL
                          AND (t.phone = :phone OR tm.invited_phone = :phone)
                    ) AS invited_here
                """, Map.of("phone", normalized, "teamId", teamId));

        if (Boolean.TRUE.equals(row.get("in_a_team"))) {
            return new Verdict(false, CODE_ALREADY_IN_TEAM, MSG_ALREADY_IN_TEAM, HttpStatus.CONFLICT);
        }
        if (Boolean.TRUE.equals(row.get("invited_here"))) {
            return new Verdict(false, CODE_ALREADY_INVITED, MSG_ALREADY_INVITED, HttpStatus.CONFLICT);
        }
        return Verdict.ok();
    }

    /** The same check, for callers that must not proceed. */
    public void require(String teamId, String callerPhone, String phone) {
        Verdict verdict = check(teamId, callerPhone, phone);
        if (!verdict.available()) {
            throw new TeamRuleException(verdict.status(), verdict.code(), verdict.message());
        }
    }
}
