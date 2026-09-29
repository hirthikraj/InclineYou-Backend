package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.auth.AuthPrincipal;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Workspaces: which ones am I in, which am I standing in, and who else is here.
 *
 * <p>The switcher at the top of the app is {@code GET /v1/tenants} plus
 * {@code POST /v1/tenants/{id}/activate}. Everything else on this controller is
 * for somebody who administers a workspace.
 */
@RestController
@RequestMapping("/v1/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenants;
    private final TenantRevenueService revenue;
    private final ClientHandoverService handover;
    private final AuthTokenService tokens;

    /** The switcher. Home first, then by name. */
    @GetMapping
    public List<TenantService.WorkspaceView> mine() {
        return tenants.myWorkspaces();
    }

    public record ActivateBody(boolean remember) {}

    /**
     * Stand in a different workspace.
     *
     * <p>The response tells the caller whether their credential changed. On the
     * web it does not — a session is a row, and moving it is an UPDATE, so the
     * browser keeps the token it has. On the phone it does: a JWT's workspace is
     * a signed claim, so a new token comes back and the old one is left to
     * expire. That asymmetry is the whole reason the two issuers exist.
     */
    @PostMapping("/{tenantId}/activate")
    public ResponseEntity<ActivateResponse> activate(@PathVariable UUID tenantId,
                                                     @RequestBody(required = false) ActivateBody body,
                                                     HttpServletRequest request) {
        tenants.requireSwitchable(tenantId);
        var scope = CurrentScope.require();

        if (body != null && body.remember()) tenants.makeHome(scope.phone(), tenantId);

        String raw = (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
        var principal = new AuthPrincipal(
                SecurityContextHolder.getContext().getAuthentication().getName(),
                scope.phone(), JwtService.ROLE_TRAINER, tenantId, null);

        var reissued = tokens.switchTenant(raw, principal, tenantId);
        return ResponseEntity.ok(new ActivateResponse(
                tenantId.toString(),
                reissued.map(t -> t.value()).orElse(null),
                reissued.map(t -> t.kind()).orElse(tokens.kindOf(raw))));
    }

    /**
     * @param token null when the existing credential still works — which is the
     *              web case, and the client must NOT treat null as a sign-out.
     */
    public record ActivateResponse(String tenantId, String token, String tokenKind) {}

    /* ------------------------------------------------------------- members */

    @GetMapping("/{tenantId}/members")
    public List<TenantService.MemberView> members(@PathVariable UUID tenantId) {
        return tenants.members(tenantId);
    }

    public record SharesBody(BigDecimal revenueSharePercent, BigDecimal assignmentMarginPercent) {}

    /** Null means leave it alone, the same contract {@code /v1/trainers/me} uses. */
    @PatchMapping("/{tenantId}/members/{memberId}/shares")
    public ResponseEntity<Void> shares(@PathVariable UUID tenantId,
                                       @PathVariable UUID memberId,
                                       @RequestBody SharesBody body) {
        tenants.updateShares(tenantId, memberId,
                body.revenueSharePercent(), body.assignmentMarginPercent());
        return ResponseEntity.noContent().build();
    }

    public record RoleBody(@NotBlank String role) {}

    @PatchMapping("/{tenantId}/members/{memberId}/role")
    public ResponseEntity<Void> role(@PathVariable UUID tenantId,
                                     @PathVariable UUID memberId,
                                     @Valid @RequestBody RoleBody body) {
        tenants.updateRole(tenantId, memberId, body.role());
        return ResponseEntity.noContent().build();
    }

    /* ------------------------------------------------------------ revenue */

    /**
     * What this workspace took.
     *
     * <p>An owner or admin gets the total and the per-coach split; a coach gets
     * their own line and no total. Both get what they personally keep, and an
     * admin also gets what their placements earned.
     */
    @GetMapping("/{tenantId}/revenue")
    public TenantRevenueService.RevenueView revenue(
            @PathVariable UUID tenantId,
            @RequestParam LocalDate from,
            @RequestParam LocalDate to) {
        return revenue.revenue(tenantId, from, to);
    }

    /* ----------------------------------------------------------- handover */

    /** Everyone here with no working coach. */
    @GetMapping("/{tenantId}/stale-clients")
    public List<ClientHandoverService.StaleClient> stale(@PathVariable UUID tenantId) {
        return handover.queue(tenantId);
    }

    public record AssignBody(@NotBlank String toTrainerId, String note, String reason) {}

    /** Give a client a coach. Their history, plan and payments are untouched. */
    @PostMapping("/{tenantId}/clients/{clientId}/assign")
    public ResponseEntity<Void> assign(@PathVariable UUID tenantId,
                                       @PathVariable UUID clientId,
                                       @Valid @RequestBody AssignBody body) {
        handover.assign(tenantId, clientId, UUID.fromString(body.toTrainerId()),
                body.note(), body.reason());
        return ResponseEntity.noContent().build();
    }

    public record UnavailableBody(String reason) {}

    /**
     * A coach has stopped working here. Everyone they hold in THIS workspace
     * needs a new one; their clients anywhere else are untouched, because those
     * are a different workspace and were never in scope.
     */
    @PostMapping("/{tenantId}/members/{trainerId}/unavailable")
    public ResponseEntity<StaleCount> unavailable(@PathVariable UUID tenantId,
                                                  @PathVariable UUID trainerId,
                                                  @RequestBody(required = false) UnavailableBody body) {
        tenants.requireAdmin(tenantId);
        String reason = body == null || body.reason() == null
                ? ClientHandoverService.REASON_UNAVAILABLE : body.reason();
        return ResponseEntity.ok(new StaleCount(handover.markStale(tenantId, trainerId, reason)));
    }

    public record StaleCount(int clientsNeedingACoach) {}
}
