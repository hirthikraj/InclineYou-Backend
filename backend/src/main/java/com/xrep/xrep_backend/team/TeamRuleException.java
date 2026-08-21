package com.xrep.xrep_backend.team;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A team rule said no.
 *
 * <p>One exception type carrying its own status rather than a class per failure,
 * because these failures differ only in two values and there are fifteen of
 * them. What they share is the thing that matters: a machine-readable
 * {@code code} the app branches on, because an app that only had the prose
 * would have to match on English to tell "every seat is taken" from "you are
 * not an admin", and those have completely different recoveries.
 *
 * <h2>Why some of these are 403 and not 404</h2>
 *
 * The standing convention in this backend is that a wrong id yields 404 rather
 * than 403 — ownership is a query filter, and 404 exists so that a trainer
 * cannot confirm another trainer's row is real by probing for it.
 *
 * <p>That convention is about <em>cross-trainer</em> access, and it still holds
 * here: {@link #CLIENT_NOT_IN_TEAM} and {@link #MEMBER_NOT_IN_TEAM} — anything
 * reaching <em>outside</em> the caller's team — are 404 for exactly the old
 * reason. But inside a team the caller already knows the team is real, because
 * they are in it. Answering 404 to "you are not an admin" would hide the reason
 * from somebody entitled to know it, and the app could not draw the difference
 * between "ask your owner to promote you" and "this is gone". So 403, honestly.
 */
@Getter
public class TeamRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    /**
     * Carried on {@code TEAM_SEAT_LIMIT} only, and null everywhere else: the app
     * draws "all 5 seats are taken" and needs the number without parsing the
     * sentence for it.
     */
    private final Integer seatLimit;

    public TeamRuleException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public TeamRuleException(HttpStatus status, String code, String message, Integer seatLimit) {
        super(message);
        this.status = status;
        this.code = code;
        this.seatLimit = seatLimit;
    }

    /* ── 403: you are in the team, but not high enough ─────────────────────── */

    public static TeamRuleException notAdmin() {
        return new TeamRuleException(HttpStatus.FORBIDDEN, "NOT_TEAM_ADMIN",
                "Only a team owner or admin can do this. Ask your team owner to promote you.");
    }

    public static TeamRuleException notOwner() {
        return new TeamRuleException(HttpStatus.FORBIDDEN, "NOT_TEAM_OWNER",
                "Only the team owner can do this.");
    }

    public static TeamRuleException noTeam() {
        return new TeamRuleException(HttpStatus.FORBIDDEN, "TEAM_MEMBERSHIP_REQUIRED",
                "You are not part of a coaching team yet.");
    }

    /* ── 404: it is outside your team, so as far as you are concerned it is not
     *        there. Same reasoning as every other cross-trainer 404 here. ──── */

    public static TeamRuleException memberNotInTeam() {
        return new TeamRuleException(HttpStatus.NOT_FOUND, "MEMBER_NOT_IN_TEAM",
                "That coach is not an active member of your team.");
    }

    public static TeamRuleException clientNotInTeam() {
        return new TeamRuleException(HttpStatus.NOT_FOUND, "CLIENT_NOT_IN_TEAM",
                "That client's coach is not part of your team.");
    }

    public static TeamRuleException programNotInTeam() {
        return new TeamRuleException(HttpStatus.NOT_FOUND, "PROGRAM_NOT_IN_TEAM",
                "That plan is not in your team.");
    }

    public static TeamRuleException exerciseNotInTeam() {
        return new TeamRuleException(HttpStatus.NOT_FOUND, "EXERCISE_NOT_IN_TEAM",
                "That exercise is not one of your team's. The built-in library can't be edited.");
    }

    public static TeamRuleException templateNotInTeam() {
        return new TeamRuleException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_IN_TEAM",
                "That program is not in your team's library.");
    }

    /* ── 409: the request is well-formed and the state says no ─────────────── */

    public static TeamRuleException alreadyInTeam() {
        return new TeamRuleException(HttpStatus.CONFLICT, "ALREADY_IN_TEAM",
                "You are already part of a coaching team. A trainer can only be in one team at a time.");
    }

    public static TeamRuleException seatLimit(int seatLimit) {
        return new TeamRuleException(HttpStatus.CONFLICT, "TEAM_SEAT_LIMIT",
                "This team has no free seats — all " + seatLimit + " are taken.", seatLimit);
    }

    /* ── 410: it was valid and has lapsed ─────────────────────────────────── */

    public static TeamRuleException inviteExpired() {
        return new TeamRuleException(HttpStatus.GONE, "TEAM_INVITE_EXPIRED",
                "This invitation has expired. Ask the team to send it again.");
    }

    /* ── 422: well-formed, and asking for something that cannot exist ─────── */

    public static TeamRuleException cannotRemoveOwner() {
        return new TeamRuleException(HttpStatus.UNPROCESSABLE_ENTITY, "CANNOT_REMOVE_OWNER",
                "The team owner cannot be removed. Transfer ownership to another coach first.");
    }

    public static TeamRuleException cannotDemoteOwner() {
        return new TeamRuleException(HttpStatus.UNPROCESSABLE_ENTITY, "CANNOT_DEMOTE_OWNER",
                "The team owner's role cannot be changed. Transfer ownership instead.");
    }

    public static TeamRuleException badDateRange() {
        return new TeamRuleException(HttpStatus.UNPROCESSABLE_ENTITY, "TEAM_RANGE_INVALID",
                "That date range ends before it starts.");
    }

    public static TeamRuleException invalidRole() {
        return new TeamRuleException(HttpStatus.UNPROCESSABLE_ENTITY, "TEAM_ROLE_INVALID",
                "A member can be made an admin or a coach. Making someone the owner is a transfer.");
    }
}
