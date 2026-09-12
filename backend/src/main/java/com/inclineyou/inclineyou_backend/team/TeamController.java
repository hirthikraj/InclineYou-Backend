package com.inclineyou.inclineyou_backend.team;

import com.inclineyou.inclineyou_backend.config.AppProperties;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Team coaching, Phase 1.
 *
 * <p>Everything here is {@code ROLE_TRAINER} — {@code SecurityConfig} already
 * says so, since {@code /v1/team/**} falls through to
 * {@code anyRequest().hasRole("TRAINER")} and needs no rule of its own. The role
 * checks <em>inside</em> a team are {@link TeamScope}'s job rather than the
 * security chain's, because they depend on a database row and not on a path.
 *
 * <p>Team-wide reads of other coaches' clients live under this same namespace
 * and land in Phase 2. Keeping them here rather than widening the existing
 * {@code /v1/clients} endpoints is deliberate: not one of the 63 endpoints that
 * predate V26 changes what it returns, so a bug in the team resolver cannot leak
 * data through a path written before the resolver existed.
 */
@RestController
@RequestMapping("/v1/team")
@RequiredArgsConstructor
public class TeamController {

    private final TeamService service;
    private final TeamClientService clients;
    private final TeamLibraryService library;
    private final TeamEditService edits;
    private final TeamRevenueService revenue;
    private final AppProperties props;

    // ── The team ──────────────────────────────────────────────────────────────

    /** @return 204 when the caller is in no team, which is not an error. */
    @GetMapping
    public ResponseEntity<TeamService.TeamResponse> get() {
        requireEnabled();
        var team = service.get(trainerId());
        return team == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(team);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeamService.TeamResponse create(@Valid @RequestBody TeamService.CreateTeamRequest req) {
        requireEnabled();
        return service.create(trainerId(), req);
    }

    @PatchMapping
    public TeamService.TeamResponse update(@Valid @RequestBody TeamService.UpdateTeamRequest req) {
        requireEnabled();
        return service.update(trainerId(), req);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete() {
        requireEnabled();
        service.delete(trainerId());
    }

    @PostMapping("/transfer-ownership")
    public TeamService.TeamResponse transferOwnership(
            @Valid @RequestBody TeamService.TransferRequest req) {
        requireEnabled();
        return service.transferOwnership(trainerId(), req);
    }

    // ── Members and invites ───────────────────────────────────────────────────

    @GetMapping("/members")
    public List<TeamService.MemberResponse> members() {
        requireEnabled();
        return service.members(trainerId());
    }

    /**
     * Spends a WhatsApp message on the inviter's behalf, so it sits in the
     * {@code MESSAGING} rate-limit tier — 10/min, the standing rule for anything
     * that sends. Here that ceiling doubles as the anti-spam control: an invite
     * puts a message in front of somebody who never asked for one.
     */
    @PostMapping("/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public TeamService.InviteResponse invite(@Valid @RequestBody TeamService.InviteRequest req) {
        requireEnabled();
        return service.invite(trainerId(), req);
    }

    /** Pre-flight for the invite screen — the same shape as `/v1/clients/phone-availability`. */
    @PostMapping("/invites/phone-availability")
    public TeamService.AvailabilityResponse phoneAvailability(
            @Valid @RequestBody TeamService.PhoneCheckRequest req) {
        requireEnabled();
        return service.phoneAvailability(trainerId(), req);
    }

    @DeleteMapping("/invites/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeInvite(@PathVariable UUID id) {
        requireEnabled();
        service.revokeInvite(trainerId(), id);
    }

    @PatchMapping("/members/{id}/role")
    public TeamService.MemberResponse changeRole(@PathVariable UUID id,
                                                 @Valid @RequestBody TeamService.RoleRequest req) {
        requireEnabled();
        return service.changeRole(trainerId(), id, req);
    }

    /**
     * Mapped before {@code /members/{id}} would be, so that a literal "me" is
     * never parsed as a UUID. Spring prefers the exact path anyway; the ordering
     * here is for the reader.
     */
    @DeleteMapping("/members/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave() {
        requireEnabled();
        service.leave(trainerId());
    }

    @DeleteMapping("/members/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable UUID id) {
        requireEnabled();
        service.removeMember(trainerId(), id);
    }

    // ── Team-wide clients · Phase 2 ───────────────────────────────────────────

    /**
     * The team's whole roster, grouped by coach. Admin+.
     *
     * Online-only, like everything team-wide: this is not in sync and must not
     * be. Mirroring every coach's roster onto every admin's phone multiplies the
     * local database by the size of the team, and an offline copy leaves with
     * the phone — an admin removed on Tuesday must not still be holding forty
     * clients' history on Wednesday.
     */
    @GetMapping("/clients")
    public List<TeamClientService.CoachClients> teamClients() {
        requireEnabled();
        return clients.list(trainerId());
    }

    /**
     * One teammate's client — profile, plan, sessions, measurements. Admin+.
     *
     * **No money, at any role.** `package`, `payment` and `gym_settlement` are
     * never returned under this path; the response carries `moneyHidden: true`
     * so the app can say so rather than drawing an empty money section and
     * letting the trainer conclude the data was lost.
     */
    @GetMapping("/clients/{id}")
    public TeamClientService.TeamClientDetail teamClient(@PathVariable UUID id) {
        requireEnabled();
        return clients.detail(trainerId(), id);
    }

    /**
     * Move a client to another coach in the team. Admin+.
     *
     * The plan moves, the history stays — see {@link TeamClientService#reassign}.
     * `STANDARD` tier: it sends a push rather than a WhatsApp message, and a
     * push costs nothing per call.
     */
    @PostMapping("/clients/{id}/reassign")
    public TeamClientService.ReassignResult reassign(
            @PathVariable UUID id,
            @Valid @RequestBody TeamClientService.ReassignRequest req) {
        requireEnabled();
        return clients.reassign(trainerId(), id, req);
    }

    /** Every move this client has been through, newest first. Admin+. */
    @GetMapping("/clients/{id}/assignments")
    public List<TeamClientService.AssignmentRow> assignments(@PathVariable UUID id) {
        requireEnabled();
        return clients.assignments(trainerId(), id);
    }

    // ── The shared library · Phase 2 ──────────────────────────────────────────

    /**
     * Every template in the team, the caller's own included and labelled.
     *
     * Any active member, not just admins: the library is the one team-wide read
     * a plain coach gets, and it is most of what a coach joins a team for.
     */
    @GetMapping("/templates")
    public List<TeamLibraryService.TeamTemplateRow> teamTemplates() {
        requireEnabled();
        return library.templates(trainerId());
    }

    /**
     * Copy a teammate's template into the caller's own book.
     *
     * A copy rather than a share, because a template two coaches use and one
     * coach edits is a template that changed under the other's clients.
     */
    @PostMapping("/templates/{id}/copy")
    @ResponseStatus(HttpStatus.CREATED)
    public TeamLibraryService.CopyResult copyTemplate(@PathVariable UUID id) {
        requireEnabled();
        return library.copy(trainerId(), id);
    }

    // ── Editing a teammate's plan · Phase 3 ───────────────────────────────────

    /**
     * A teammate's program with its exercises. Admin+.
     *
     * Answers for the caller's own programs too, flagged `teammates: false`, so
     * the roster can link to a plan without first working out whose it is.
     */
    @GetMapping("/programs/{id}")
    public TeamEditService.TeamProgramDetail teamProgram(@PathVariable UUID id) {
        requireEnabled();
        return edits.program(trainerId(), id);
    }

    /** Name, goal, or status. Admin+. Creating or deleting a plan is not offered. */
    @PatchMapping("/programs/{id}")
    public TeamEditService.TeamProgramDetail updateTeamProgram(
            @PathVariable UUID id,
            @Valid @RequestBody TeamEditService.UpdateProgramRequest req) {
        requireEnabled();
        return edits.updateProgram(trainerId(), id, req);
    }

    @PostMapping("/programs/{id}/exercises")
    @ResponseStatus(HttpStatus.CREATED)
    public TeamEditService.ProgramExerciseRow addTeamExercise(
            @PathVariable UUID id,
            @Valid @RequestBody TeamEditService.ExerciseRequest req) {
        requireEnabled();
        return edits.addExercise(trainerId(), id, req);
    }

    @PatchMapping("/programs/{id}/exercises/{exId}")
    public TeamEditService.ProgramExerciseRow updateTeamExercise(
            @PathVariable UUID id, @PathVariable UUID exId,
            @Valid @RequestBody TeamEditService.UpdateExerciseRequest req) {
        requireEnabled();
        return edits.updateExercise(trainerId(), id, exId, req);
    }

    @DeleteMapping("/programs/{id}/exercises/{exId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeTeamExercise(@PathVariable UUID id, @PathVariable UUID exId) {
        requireEnabled();
        edits.removeExercise(trainerId(), id, exId);
    }

    /**
     * Fix a team custom exercise for everybody. Admin+.
     *
     * The one thing shared in place rather than copied, which is what makes
     * editing it the right shape: a typo is wrong in every program that points
     * at it, and a copy would fix none of them.
     */
    @PatchMapping("/exercises/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateTeamExerciseLibrary(
            @PathVariable UUID id,
            @Valid @RequestBody TeamEditService.UpdateCustomExerciseRequest req) {
        requireEnabled();
        edits.updateCustomExercise(trainerId(), id, req);
    }

    /**
     * Who changed what, on whose clients. **Any member**, not just admins.
     *
     * The coach whose plan was edited is the reason this record exists, so a log
     * only its authors could read would be an account of nothing. A coach sees
     * the crossings that happened to them; an admin sees the team's.
     */
    @GetMapping("/activity")
    public List<TeamEditService.ActivityRow> activity(
            @RequestParam(required = false) UUID clientId) {
        requireEnabled();
        return edits.activity(trainerId(), clientId);
    }

    // ── The owner's numbers · Phase 3 ─────────────────────────────────────────

    /**
     * What the team took, per coach, over a date range. **Owner only.**
     *
     * The single carve-out in the rule that no role sees a teammate's money, and
     * kept narrow on purpose: totals, counts, and a client count — never a
     * payment row and never a client's name. See {@link TeamRevenueService}.
     */
    @GetMapping("/revenue")
    public TeamRevenueService.TeamRevenue revenue(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        requireEnabled();
        return revenue.revenue(trainerId(), parseDate(from), parseDate(to));
    }

    /** ISO or nothing. A malformed date is a 400 from the parser, not a silent default. */
    private static java.time.LocalDate parseDate(String raw) {
        return raw == null || raw.isBlank() ? null : java.time.LocalDate.parse(raw);
    }

    // ── The invitee's side ────────────────────────────────────────────────────

    /**
     * Read over REST rather than through sync, and that is the rule and not an
     * omission: an invitation is a permission change, and a permission change
     * that can be answered offline and replayed later can be replayed after the
     * grant was revoked.
     */
    @GetMapping("/invitations")
    public List<TeamService.InvitationResponse> myInvitations() {
        requireEnabled();
        return service.myInvitations(trainerId());
    }

    @PostMapping("/invitations/{id}/accept")
    public TeamService.TeamResponse accept(@PathVariable UUID id) {
        requireEnabled();
        return service.acceptInvitation(trainerId(), id);
    }

    @PostMapping("/invitations/{id}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@PathVariable UUID id) {
        requireEnabled();
        service.declineInvitation(trainerId(), id);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /**
     * 404 rather than 403 when the feature is switched off, because a disabled
     * feature should look absent and not forbidden — the same shape
     * {@code BATCHES_ENABLED} and {@code SELF_TRAINING_ENABLED} take on the app
     * side. {@link TeamScope} independently refuses to widen anybody's read
     * scope while the switch is off; two mechanisms, because they answer two
     * different questions.
     */
    private void requireEnabled() {
        if (!props.getTeam().isEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
