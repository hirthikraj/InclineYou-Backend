package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.auth.AuthPrincipal;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.IssuedToken;
import com.inclineyou.inclineyou_backend.core.auth.JwtService;
import com.inclineyou.inclineyou_backend.core.tenant.dto.ActivateRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.ActivateResponse;
import com.inclineyou.inclineyou_backend.core.tenant.dto.MemberView;
import com.inclineyou.inclineyou_backend.core.tenant.dto.UpdateRoleRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.UpdateSharesRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.WorkspaceView;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Workspaces, the people in them, and what each of them keeps.
 *
 * <h2>A person belongs to several workspaces</h2>
 *
 * That is the requirement this whole layer exists for. One trainer coaches
 * privately and at a gym with different clients; one human can be a client under
 * two different arrangements. So membership is a table, not a column, and every
 * method here works in terms of "which workspace are we talking about" rather
 * than "who is the caller".
 *
 * <h2>Nothing here moves data</h2>
 *
 * Joining a workspace creates a membership. Leaving one soft-deletes it. Neither
 * touches a single client, program, session or payment — because those rows were
 * stamped with the workspace they were created in and V39's trigger refuses to
 * move them. A coach who leaves a gym stops being able to READ the gym's rows;
 * the rows do not follow them out, and their private practice was never in
 * scope to begin with.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TenantService {

    private final TenantJdbcRepository repo;
    private final AuthTokenService tokens;
    private final TenantScope scope;
    private final AppProperties props;

    /** The switcher at the top of the app. */
    public List<WorkspaceView> myWorkspaces() {
        var s = CurrentScope.require();
        return s.memberships().stream()
                .map(m -> new WorkspaceView(
                        m.tenantId().toString(), m.tenantType(), m.tenantName(), m.role(),
                        m.home(), m.tenantId().equals(s.activeTenantId()),
                        TenantRole.administers(m.role()),
                        m.revenueSharePercent(), m.assignmentMarginPercent()))
                .toList();
    }

    /**
     * Which workspace this caller is standing in from now on.
     *
     * <p>Refused for a workspace they are not a member of, and refused with
     * {@code NOT_A_MEMBER} rather than a silent fallback — a switcher that
     * quietly puts you somewhere else is worse than one that says no.
     */
    public UUID requireSwitchable(UUID tenantId) {
        if (!props.getTenant().isSwitchingEnabled()) throw TenantRuleException.switchingDisabled();
        var s = CurrentScope.require();
        if (!s.isMemberOf(tenantId)) throw TenantRuleException.notAMember();
        return tenantId;
    }

    /** Remember it, so the next sign-in opens here. */
    @Transactional
    public void makeHome(String phone, UUID tenantId) {
        repo.makeHome(phone, tenantId);
    }

    /**
     * Stand in a different workspace.
     *
     * <p>The answer says whether the caller's credential changed. On the web it
     * does not — a session is a row, and moving it is an UPDATE, so the browser
     * keeps the token it has. On the phone it does: a JWT's workspace is a signed
     * claim, so a new token comes back and the old one is left to expire. That
     * asymmetry is the whole reason the two issuers exist.
     *
     * @param rawToken the credential this request came in on
     * @param subject  the authenticated subject — the trainer id
     */
    @Transactional
    public ActivateResponse activate(UUID tenantId, ActivateRequest req, String rawToken, String subject) {
        requireSwitchable(tenantId);
        var s = CurrentScope.require();
        if (req.remember()) makeHome(s.phone(), tenantId);
        var principal = new AuthPrincipal(subject, s.phone(), JwtService.ROLE_TRAINER, tenantId, null);
        var reissued = tokens.switchTenant(rawToken, principal, tenantId);
        return new ActivateResponse(tenantId.toString(),
                reissued.map(IssuedToken::value).orElse(null),
                reissued.map(IssuedToken::kind).orElse(tokens.kindOf(rawToken)));
    }

    /* ------------------------------------------------------------- members */

    public List<MemberView> members(UUID tenantId) {
        var s = CurrentScope.require();
        if (!s.isMemberOf(tenantId)) throw TenantRuleException.notAMember();

        return repo.members(tenantId);
    }

    /**
     * Set what a member keeps, and what an admin earns for placing a client.
     *
     * <p>Owner or admin only, and it changes the rate from NOW — every handover
     * already recorded keeps the margin frozen onto its
     * {@code client_assignment} row. That is the V11 argument again: an admin
     * who renegotiates in March must not silently restate what they earned in
     * January.
     */
    @Transactional
    public void updateShares(UUID tenantId, UUID memberId, UpdateSharesRequest req) {
        requireAdmin(tenantId);
        BigDecimal revenueShare = req.revenueSharePercent();
        BigDecimal assignmentMargin = req.assignmentMarginPercent();
        int n = repo.updateShares(tenantId, memberId, revenueShare, assignmentMargin);
        if (n == 0) throw TenantRuleException.notAMember();
    }

    @Transactional
    public void updateRole(UUID tenantId, UUID memberId, UpdateRoleRequest req) {
        requireAdmin(tenantId);
        String role = req.role();
        if (TenantRole.CLIENT.equals(role)) throw TenantRuleException.notACoachHere();
        int n = repo.updateRole(tenantId, memberId, role);
        if (n == 0) throw TenantRuleException.notAMember();
    }

    public UUID requireAdmin(UUID tenantId) {
        var s = CurrentScope.require();
        var membership = s.memberships().stream()
                .filter(m -> m.tenantId().equals(tenantId))
                .findFirst()
                .orElseThrow(TenantRuleException::notAMember);
        if (!TenantRole.administers(membership.role())) throw TenantRuleException.notAdmin();
        return tenantId;
    }

    /** Which app_user a phone is, creating nothing. */
    public UUID appUserIdFor(String phone) {
        return repo.appUserIdFor(phone).orElse(null);
    }
}
