package com.xrep.xrep_backend.team;

import com.xrep.xrep_backend.config.AppProperties;
import com.xrep.xrep_backend.push.PushService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Team coaching, Phase 1: forming a team and who is in it.
 *
 * <p>See {@code agent/XRep_team_coaching_prd.md}. Two things worth carrying in
 * your head while reading this class:
 *
 * <ol>
 *   <li><b>Joining a team is additive to a coach's own book.</b> Nothing about
 *       their clients, programs or money changes when they accept, and nothing
 *       changes back when they leave. That is what makes it safe to say yes to,
 *       and it is why removal ends <em>visibility</em> and never ownership.</li>
 *   <li><b>An invite can precede the account.</b> {@code team_member.trainer_id}
 *       is nullable and bound the first time the invited number signs in, which
 *       makes the invite an acquisition channel rather than only an internal
 *       permission grant.</li>
 * </ol>
 *
 * <p>Hand-written SQL through {@code NamedParameterJdbcTemplate}, like the
 * services around it. {@code team} and {@code team_member} are deliberately not
 * JPA entities: the five entities stay five.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TeamService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TeamScope scope;
    private final TeamPhoneGuard phoneGuard;
    private final PushService push;
    private final AppProperties props;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateTeamRequest(
            @NotBlank @Size(max = 120) String name,
            /** Optional. Falls back to app.team.default-seat-limit. */
            Integer seatLimit
    ) {}

    /** PATCH semantics: null means "leave it alone", not "clear it". */
    public record UpdateTeamRequest(
            @Size(max = 120) String name,
            @Size(max = 500) String logoUrl,
            Integer seatLimit
    ) {}

    public record TeamResponse(
            UUID id,
            String name,
            String logoUrl,
            Integer seatLimit,
            int activeMembers,
            int pendingInvites,
            UUID ownerTrainerId,
            /** The caller's own role — the app draws its whole team screen off this. */
            String myRole,
            long createdAt,
            long updatedAt
    ) {}

    public record MemberResponse(
            UUID id,
            UUID trainerId,
            String name,
            String phone,
            String role,
            String status,
            /** Live clients on their roster. The one number that makes the list useful. */
            int clientCount,
            Long invitedAt,
            Long joinedAt
    ) {}

    public record InviteRequest(@NotBlank @Size(max = 15) String phone) {}

    /**
     * @param whatsappUrl a {@code wa.me} deep link the app opens, or null when
     *                    the number cannot be normalised. The backend does not
     *                    send messages — it never has; {@code NudgeService} works
     *                    the same way — so the invitation travels by the
     *                    inviter's own WhatsApp, from their own number, which is
     *                    also why a coach believes it.
     */
    public record InviteResponse(MemberResponse member, String whatsappUrl, String message) {}

    public record PhoneCheckRequest(@NotBlank String phone) {}

    public record AvailabilityResponse(boolean available, String code, String message) {}

    public record RoleRequest(@NotBlank String role) {}

    public record TransferRequest(@NotNull UUID memberId) {}

    public record InvitationResponse(
            UUID id,
            UUID teamId,
            String teamName,
            String invitedByName,
            long invitedAt,
            long expiresAt
    ) {}

    // ── The team ──────────────────────────────────────────────────────────────

    /** @return null when the caller is in no team — the controller answers 204. */
    @Transactional(readOnly = true)
    public TeamResponse get(UUID trainerId) {
        var s = scope.resolve(trainerId);
        if (!s.inTeam()) return null;
        return readTeam(s.teamId(), s.teamRole());
    }

    @Transactional
    public TeamResponse create(UUID trainerId, CreateTeamRequest req) {
        if (scope.resolve(trainerId).inTeam()) throw TeamRuleException.alreadyInTeam();

        Integer seats = req.seatLimit() != null
                ? req.seatLimit()
                : props.getTeam().getDefaultSeatLimit();

        String teamId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO team (id, owner_trainer_id, name, seat_limit, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :seats, NOW(), NOW())
                """, Map.of(
                "id", teamId, "tid", trainerId.toString(),
                "name", req.name().trim(), "seats", seats));

        // The owner is a member row like everybody else, not a special case on
        // the team. Every capability check then reads one table, and the owner
        // shows up in the coach list without being unioned in.
        insertMember(teamId, trainerId.toString(), null, TeamRole.OWNER,
                TeamMemberStatus.ACTIVE, null, true);

        log.info("team created id={} owner={}", teamId, trainerId);
        return readTeam(UUID.fromString(teamId), TeamRole.OWNER);
    }

    @Transactional
    public TeamResponse update(UUID trainerId, UpdateTeamRequest req) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireOwner();

        // A seat limit below the current headcount is allowed on purpose: it
        // only gates future accepts, and refusing it would mean an owner who
        // downgrades has to remove a coach before they can say so.
        jdbc.update("""
                UPDATE team SET
                    name       = COALESCE(:name, name),
                    logo_url   = COALESCE(:logoUrl, logo_url),
                    seat_limit = COALESCE(:seats, seat_limit),
                    updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, params(
                "id", teamId.toString(),
                "name", req.name() == null ? null : req.name().trim(),
                "logoUrl", req.logoUrl(),
                "seats", req.seatLimit()));

        return readTeam(teamId, s.teamRole());
    }

    /**
     * Soft-deletes the team and every membership in it. Nothing cascades into
     * client data, ever — every coach walks away with exactly the clients,
     * programs and payments they walked in with.
     */
    @Transactional
    public void delete(UUID trainerId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireOwner();

        // deleted_at as well as the status, because sync propagates the
        // tombstone from deleted_at and a status change alone would leave the
        // team drawn on every member's phone until they reinstalled.
        jdbc.update("""
                UPDATE team_member
                SET status = 'removed', removed_at = NOW(), deleted_at = NOW(), updated_at = NOW()
                WHERE team_id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", teamId.toString()));

        jdbc.update("""
                UPDATE team SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", teamId.toString()));

        log.info("team deleted id={} by owner={}", teamId, trainerId);
    }

    /**
     * The demote comes first, and that ordering is load-bearing.
     *
     * {@code uq_team_member_one_owner} allows one active owner per team and is
     * checked per statement, so promoting the target while the caller is still
     * owner violates it. Standing down before handing over is also the honest
     * order of events.
     */
    @Transactional
    public TeamResponse transferOwnership(UUID trainerId, TransferRequest req) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireOwner();

        var target = requireActiveMember(teamId, req.memberId());
        if (trainerId.toString().equals(target.get("trainer_id"))) {
            // Already the owner. Nothing to do, and no reason to fail.
            return readTeam(teamId, s.teamRole());
        }

        setRole(s.memberId().toString(), TeamRole.ADMIN);
        setRole(req.memberId().toString(), TeamRole.OWNER);
        jdbc.update("""
                UPDATE team SET owner_trainer_id = :newOwner::uuid, updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", teamId.toString(), "newOwner", (String) target.get("trainer_id")));

        log.info("team {} ownership transferred from={} to={}", teamId, trainerId, target.get("trainer_id"));
        notify((String) target.get("trainer_id"), "You're now the team owner",
                "You own the coaching team on XRep.");
        return readTeam(teamId, TeamRole.ADMIN);
    }

    // ── Members ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MemberResponse> members(UUID trainerId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireTeam();

        return jdbc.queryForList("""
                SELECT tm.id::text                AS id,
                       tm.trainer_id::text        AS trainer_id,
                       tm.role                    AS role,
                       tm.status                  AS status,
                       tm.invited_phone           AS invited_phone,
                       tm.invited_at              AS invited_at,
                       tm.joined_at               AS joined_at,
                       t.name                     AS trainer_name,
                       t.phone                    AS trainer_phone,
                       (SELECT COUNT(*) FROM client c
                        WHERE c.trainer_id = tm.trainer_id
                          AND c.deleted_at IS NULL
                          AND c.status <> 'archived')  AS client_count
                FROM team_member tm
                LEFT JOIN trainer t ON t.id = tm.trainer_id
                WHERE tm.team_id = :teamId::uuid
                  AND tm.deleted_at IS NULL
                  AND tm.status IN ('active', 'invited')
                -- Owner, then admins, then coaches, then by when they arrived.
                -- The list is read as a hierarchy, so it is ordered as one.
                ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                         tm.created_at
                """, Map.of("teamId", teamId.toString()))
                .stream().map(TeamService::toMember).toList();
    }

    @Transactional
    public InviteResponse invite(UUID trainerId, InviteRequest req) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireAdmin();

        var inviter = trainerRow(trainerId);
        String phone = req.phone().trim();
        phoneGuard.require(teamId.toString(), (String) inviter.get("phone"), phone);

        // The invitee may or may not have an account. Both are normal: binding
        // now when we can saves a lookup later, and leaving it null is what lets
        // a gym owner invite a coach who has never heard of XRep.
        String existingTrainerId = queryOne("""
                SELECT id::text FROM trainer WHERE phone = :phone AND deleted_at IS NULL LIMIT 1
                """, Map.of("phone", phone));

        String memberId;
        try {
            memberId = insertMember(teamId.toString(), existingTrainerId, phone,
                    TeamRole.COACH, TeamMemberStatus.INVITED, trainerId.toString(), false);
        } catch (DuplicateKeyException e) {
            // uq_team_member_pending_invite, or the one-active-membership index
            // if they accepted somewhere else in the last instant. The guard
            // above already answered both; this is the race, and it deserves the
            // same sentence rather than a 500.
            throw new TeamRuleException(
                    HttpStatus.CONFLICT,
                    TeamPhoneGuard.CODE_ALREADY_INVITED,
                    "That number already has an invitation from this team.");
        }

        var team = teamRow(teamId);
        String message = inviteMessage((String) inviter.get("name"), (String) team.get("name"));
        String waPhone = normalizePhone(phone);
        String whatsappUrl = waPhone == null ? null
                : "https://wa.me/" + waPhone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);

        if (existingTrainerId != null) {
            notify(existingTrainerId, "Team invitation",
                    inviter.get("name") + " invited you to join " + team.get("name") + " on XRep.");
        }

        log.info("team {} invited a number, inviter={}, hasAccount={}",
                teamId, trainerId, existingTrainerId != null);
        return new InviteResponse(readMember(memberId), whatsappUrl, message);
    }

    @Transactional(readOnly = true)
    public AvailabilityResponse phoneAvailability(UUID trainerId, PhoneCheckRequest req) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireAdmin();
        var inviter = trainerRow(trainerId);

        var verdict = phoneGuard.check(teamId.toString(), (String) inviter.get("phone"), req.phone().trim());
        return new AvailabilityResponse(verdict.available(), verdict.code(), verdict.message());
    }

    @Transactional
    public void revokeInvite(UUID trainerId, UUID memberId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireAdmin();

        int updated = jdbc.update("""
                UPDATE team_member
                SET status = 'removed', removed_at = NOW(), deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND team_id = :teamId::uuid
                  AND status = 'invited' AND deleted_at IS NULL
                """, Map.of("id", memberId.toString(), "teamId", teamId.toString()));

        // Not in this team, or already answered. Either way it is not there as
        // far as this caller is concerned — the same 404 every other
        // out-of-scope id gets.
        if (updated == 0) throw TeamRuleException.memberNotInTeam();
    }

    @Transactional
    public MemberResponse changeRole(UUID trainerId, UUID memberId, RoleRequest req) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireAdmin();

        String role = req.role().trim().toLowerCase(Locale.ROOT);
        if (!TeamRole.isAssignable(role)) throw TeamRuleException.invalidRole();

        var target = requireActiveMember(teamId, memberId);
        String targetRole = (String) target.get("role");

        if (TeamRole.OWNER.equals(targetRole)) throw TeamRuleException.cannotDemoteOwner();
        // An admin may promote a coach but not touch another admin. Two admins
        // who fall out could otherwise demote each other in a race, and the
        // loser loses sight of their clients mid-session; escalating to the
        // owner costs one WhatsApp message and removes the whole class of
        // incident.
        if (TeamRole.ADMIN.equals(targetRole) && !s.owns()) throw TeamRuleException.notOwner();

        setRole(memberId.toString(), role);
        log.info("team {} member {} role {} -> {} by {}", teamId, memberId, targetRole, role, trainerId);

        if (TeamRole.ADMIN.equals(role)) {
            notify((String) target.get("trainer_id"), "You're a team admin",
                    "You can now see and reassign your team's clients on XRep.");
        }
        return readMember(memberId.toString());
    }

    /**
     * Removal ends visibility, not ownership: their clients stay theirs.
     *
     * If the team wants the clients to stay with the team, an admin reassigns
     * them first, deliberately, which writes {@code client_assignment} rows —
     * rather than forty clients silently changing hands as a side effect of a
     * removal nobody wrote down.
     */
    @Transactional
    public void removeMember(UUID trainerId, UUID memberId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireAdmin();

        var target = requireActiveMember(teamId, memberId);
        String targetRole = (String) target.get("role");

        if (TeamRole.OWNER.equals(targetRole)) throw TeamRuleException.cannotRemoveOwner();
        if (TeamRole.ADMIN.equals(targetRole) && !s.owns() && !memberId.equals(s.memberId())) {
            throw TeamRuleException.notOwner();
        }

        endMembership(memberId.toString());
        log.info("team {} removed member {} by {}", teamId, memberId, trainerId);
        notify((String) target.get("trainer_id"), "Removed from the team",
                "You're no longer part of the coaching team. Your clients are still yours.");
    }

    /** Leaving is removing yourself, and the owner cannot do it without handing over. */
    @Transactional
    public void leave(UUID trainerId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireTeam();
        if (s.owns()) throw TeamRuleException.cannotRemoveOwner();

        endMembership(s.memberId().toString());
        log.info("trainer {} left team {}", trainerId, teamId);
    }

    // ── The invitee's side ────────────────────────────────────────────────────

    /**
     * Invitations addressed to the caller, whether or not they are bound yet.
     *
     * The unbound ones are matched on the trainer's phone number, which is what
     * makes an invite sent before the account existed findable the moment it
     * does. Binding happens on accept or decline rather than here, so that
     * merely looking is not an action.
     */
    @Transactional(readOnly = true)
    public List<InvitationResponse> myInvitations(UUID trainerId) {
        var me = trainerRow(trainerId);
        int expiryDays = props.getTeam().getInviteExpiryDays();

        return jdbc.queryForList("""
                SELECT tm.id::text     AS id,
                       tm.team_id::text AS team_id,
                       tm.invited_at    AS invited_at,
                       t.name           AS team_name,
                       inviter.name     AS inviter_name
                FROM team_member tm
                JOIN team t ON t.id = tm.team_id AND t.deleted_at IS NULL
                LEFT JOIN trainer inviter ON inviter.id = tm.invited_by_trainer_id
                WHERE tm.status = 'invited'
                  AND tm.deleted_at IS NULL
                  AND (tm.trainer_id = :tid::uuid
                       OR (tm.trainer_id IS NULL AND tm.invited_phone = :phone))
                  -- Expired ones are hidden rather than shown greyed out: there
                  -- is nothing the invitee can do with one. The accept path
                  -- still answers TEAM_INVITE_EXPIRED for a stale id held by an
                  -- app that had already drawn it.
                  AND tm.invited_at > NOW() - make_interval(days => :expiryDays)
                ORDER BY tm.invited_at DESC
                """, params("tid", trainerId.toString(), "phone", me.get("phone"), "expiryDays", expiryDays))
                .stream()
                .map(r -> new InvitationResponse(
                        UUID.fromString((String) r.get("id")),
                        UUID.fromString((String) r.get("team_id")),
                        (String) r.get("team_name"),
                        (String) r.get("inviter_name"),
                        millis(r.get("invited_at")),
                        millis(r.get("invited_at")) + Duration.ofDays(expiryDays).toMillis()))
                .toList();
    }

    @Transactional
    public TeamResponse acceptInvitation(UUID trainerId, UUID inviteId) {
        var invite = requireInvitationFor(trainerId, inviteId);
        UUID teamId = UUID.fromString((String) invite.get("team_id"));

        if (scope.resolve(trainerId).inTeam()) throw TeamRuleException.alreadyInTeam();

        // The seat check belongs here rather than at invite time: seats are
        // consumed by people and not by intentions, so an owner may invite six
        // for five seats and the first five in get them.
        Integer seatLimit = (Integer) teamRow(teamId).get("seat_limit");
        if (seatLimit != null && activeMemberCount(teamId) >= seatLimit) {
            throw TeamRuleException.seatLimit(seatLimit);
        }

        try {
            jdbc.update("""
                    UPDATE team_member
                    SET trainer_id = :tid::uuid,
                        status     = 'active',
                        joined_at  = NOW(),
                        updated_at = NOW()
                    WHERE id = :id::uuid AND status = 'invited' AND deleted_at IS NULL
                    """, Map.of("id", inviteId.toString(), "tid", trainerId.toString()));
        } catch (DuplicateKeyException e) {
            // uq_team_member_active_trainer: two invitations accepted at once.
            // The index is the arbiter and this is the loser.
            throw TeamRuleException.alreadyInTeam();
        }

        log.info("trainer {} joined team {}", trainerId, teamId);
        notify(queryOne("SELECT owner_trainer_id::text FROM team WHERE id = :id::uuid",
                        Map.of("id", teamId.toString())),
                "Coach joined your team", "A coach accepted your invitation on XRep.");

        return readTeam(teamId, TeamRole.COACH);
    }

    @Transactional
    public void declineInvitation(UUID trainerId, UUID inviteId) {
        requireInvitationFor(trainerId, inviteId);

        // Bound on the way out as well as on the way in. Without the trainer_id
        // the row says a number said no and cannot say who, and re-inviting them
        // later is a decision somebody wants the history for.
        jdbc.update("""
                UPDATE team_member
                SET trainer_id  = COALESCE(trainer_id, :tid::uuid),
                    status      = 'declined',
                    declined_at = NOW(),
                    deleted_at  = NOW(),
                    updated_at  = NOW()
                WHERE id = :id::uuid AND status = 'invited' AND deleted_at IS NULL
                """, Map.of("id", inviteId.toString(), "tid", trainerId.toString()));
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private TeamResponse readTeam(UUID teamId, String myRole) {
        var row = teamRow(teamId);
        var counts = jdbc.queryForMap("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'active')  AS active_members,
                    COUNT(*) FILTER (WHERE status = 'invited') AS pending_invites
                FROM team_member
                WHERE team_id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", teamId.toString()));

        return new TeamResponse(
                teamId,
                (String) row.get("name"),
                (String) row.get("logo_url"),
                (Integer) row.get("seat_limit"),
                ((Number) counts.get("active_members")).intValue(),
                ((Number) counts.get("pending_invites")).intValue(),
                UUID.fromString((String) row.get("owner_trainer_id")),
                myRole,
                millis(row.get("created_at")),
                millis(row.get("updated_at")));
    }

    private MemberResponse readMember(String memberId) {
        return toMember(jdbc.queryForMap("""
                SELECT tm.id::text         AS id,
                       tm.trainer_id::text AS trainer_id,
                       tm.role             AS role,
                       tm.status           AS status,
                       tm.invited_phone    AS invited_phone,
                       tm.invited_at       AS invited_at,
                       tm.joined_at        AS joined_at,
                       t.name              AS trainer_name,
                       t.phone             AS trainer_phone,
                       (SELECT COUNT(*) FROM client c
                        WHERE c.trainer_id = tm.trainer_id
                          AND c.deleted_at IS NULL
                          AND c.status <> 'archived') AS client_count
                FROM team_member tm
                LEFT JOIN trainer t ON t.id = tm.trainer_id
                WHERE tm.id = :id::uuid
                """, Map.of("id", memberId)));
    }

    private static MemberResponse toMember(Map<String, Object> r) {
        String trainerId = (String) r.get("trainer_id");
        // A pending invite to a number with no account has no name yet. The
        // phone is the only thing we know about them, and the app shows it.
        return new MemberResponse(
                UUID.fromString((String) r.get("id")),
                trainerId == null ? null : UUID.fromString(trainerId),
                (String) r.get("trainer_name"),
                r.get("trainer_phone") != null ? (String) r.get("trainer_phone")
                                               : (String) r.get("invited_phone"),
                (String) r.get("role"),
                (String) r.get("status"),
                r.get("client_count") == null ? 0 : ((Number) r.get("client_count")).intValue(),
                millisOrNull(r.get("invited_at")),
                millisOrNull(r.get("joined_at")));
    }

    /**
     * The two timestamps are decided here rather than in SQL. A {@code CASE WHEN
     * :status = 'invited'} would leave Postgres inferring the type of a parameter
     * compared against an untyped literal, which is a class of failure that only
     * shows up at runtime — and the caller already knows which moment this is.
     */
    private String insertMember(String teamId, String trainerId, String phone, String role,
                                String status, String invitedBy, boolean joinedNow) {
        String id = UUID.randomUUID().toString();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO team_member (id, team_id, trainer_id, invited_phone, role, status,
                                         invited_by_trainer_id, invited_at, joined_at,
                                         created_at, updated_at)
                VALUES (:id::uuid, :teamId::uuid, :trainerId::uuid, :phone, :role, :status,
                        :invitedBy::uuid, :invitedAt, :joinedAt, NOW(), NOW())
                """, params(
                "id", id, "teamId", teamId, "trainerId", trainerId, "phone", phone,
                "role", role, "status", status, "invitedBy", invitedBy,
                "invitedAt", TeamMemberStatus.INVITED.equals(status) ? now : null,
                "joinedAt", joinedNow ? now : null));
        return id;
    }

    private void setRole(String memberId, String role) {
        jdbc.update("""
                UPDATE team_member SET role = :role, updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", memberId, "role", role));
    }

    /**
     * Both the status and {@code deleted_at}, deliberately.
     *
     * The status is the history — this person was in the team and is not any
     * more — and {@code deleted_at} is what sync propagates, so a status change
     * on its own would leave a removed coach drawn in the team list on every
     * teammate's phone until they reinstalled. Soft delete is the house rule for
     * exactly this reason.
     */
    private void endMembership(String memberId) {
        jdbc.update("""
                UPDATE team_member
                SET status = 'removed', removed_at = NOW(), deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", memberId));
    }

    private Map<String, Object> requireActiveMember(UUID teamId, UUID memberId) {
        var rows = jdbc.queryForList("""
                SELECT id::text AS id, trainer_id::text AS trainer_id, role
                FROM team_member
                WHERE id = :id::uuid AND team_id = :teamId::uuid
                  AND status = 'active' AND deleted_at IS NULL
                """, Map.of("id", memberId.toString(), "teamId", teamId.toString()));
        if (rows.isEmpty()) throw TeamRuleException.memberNotInTeam();
        return rows.getFirst();
    }

    /**
     * The invitation, if it is the caller's to answer.
     *
     * Matched on the trainer id or, for an invite that predates the account, on
     * the phone number — which is safe because the number is what the OTP
     * proved. An id belonging to somebody else's invite is a 404, like every
     * other out-of-scope id in this backend.
     */
    private Map<String, Object> requireInvitationFor(UUID trainerId, UUID inviteId) {
        var me = trainerRow(trainerId);
        var rows = jdbc.queryForList("""
                SELECT tm.id::text      AS id,
                       tm.team_id::text AS team_id,
                       tm.invited_at    AS invited_at
                FROM team_member tm
                JOIN team t ON t.id = tm.team_id AND t.deleted_at IS NULL
                WHERE tm.id = :id::uuid
                  AND tm.status = 'invited'
                  AND tm.deleted_at IS NULL
                  AND (tm.trainer_id = :tid::uuid
                       OR (tm.trainer_id IS NULL AND tm.invited_phone = :phone))
                """, params("id", inviteId.toString(), "tid", trainerId.toString(),
                            "phone", me.get("phone")));
        if (rows.isEmpty()) throw TeamRuleException.memberNotInTeam();

        var invite = rows.getFirst();
        Instant invitedAt = ((Timestamp) invite.get("invited_at")).toInstant();
        if (invitedAt.isBefore(Instant.now().minus(Duration.ofDays(props.getTeam().getInviteExpiryDays())))) {
            throw TeamRuleException.inviteExpired();
        }
        return invite;
    }

    private int activeMemberCount(UUID teamId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM team_member
                WHERE team_id = :id::uuid AND status = 'active' AND deleted_at IS NULL
                """, Map.of("id", teamId.toString()), Integer.class);
        return count == null ? 0 : count;
    }

    private Map<String, Object> teamRow(UUID teamId) {
        return jdbc.queryForMap("""
                SELECT id::text AS id, owner_trainer_id::text AS owner_trainer_id, name,
                       logo_url, seat_limit, created_at, updated_at
                FROM team WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", teamId.toString()));
    }

    private Map<String, Object> trainerRow(UUID trainerId) {
        return jdbc.queryForMap("""
                SELECT id::text AS id, name, phone FROM trainer WHERE id = :id::uuid
                """, Map.of("id", trainerId.toString()));
    }

    private String queryOne(String sql, Map<String, ?> params) {
        var rows = jdbc.queryForList(sql, params);
        if (rows.isEmpty()) return null;
        return (String) rows.getFirst().values().iterator().next();
    }

    /** Best effort. A push that does not arrive must never fail the action. */
    private void notify(String trainerId, String title, String body) {
        if (trainerId == null) return;
        try {
            push.sendToTrainer(UUID.fromString(trainerId), title, body, Map.of("type", "team"));
        } catch (RuntimeException e) {
            log.warn("team push to trainer={} failed: {}", trainerId, e.getMessage());
        }
    }

    private static String inviteMessage(String inviterName, String teamName) {
        String from = inviterName == null || inviterName.isBlank() ? "A trainer" : inviterName;
        return String.format(
                "Hi! %s has invited you to join the coaching team \"%s\" on XRep. "
                + "Open the XRep trainer app and sign in with this number to accept. 💪",
                from, teamName);
    }

    /** Same normalisation NudgeService uses — Indian numbers, with or without 91. */
    private static String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("91") && digits.length() == 12) return digits;
        if (digits.length() == 10) return "91" + digits;
        return null;
    }

    private static long millis(Object ts) {
        return ((Timestamp) ts).toInstant().toEpochMilli();
    }

    private static Long millisOrNull(Object ts) {
        return ts == null ? null : millis(ts);
    }

    /** {@code Map.of} rejects nulls, and half of these are legitimately null. */
    private static Map<String, Object> params(Object... kv) {
        var map = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) map.put((String) kv[i], kv[i + 1]);
        return map;
    }
}
