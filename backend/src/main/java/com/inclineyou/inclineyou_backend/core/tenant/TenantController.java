package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.tenant.dto.ActivateRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.ActivateResponse;
import com.inclineyou.inclineyou_backend.core.tenant.dto.AssignClientRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.MarkUnavailableRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.MemberView;
import com.inclineyou.inclineyou_backend.core.tenant.dto.RevenueView;
import com.inclineyou.inclineyou_backend.core.tenant.dto.StaleClient;
import com.inclineyou.inclineyou_backend.core.tenant.dto.StaleCount;
import com.inclineyou.inclineyou_backend.core.tenant.dto.UpdateRoleRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.UpdateSharesRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.WorkspaceView;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

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

    /** The switcher. Home first, then by name. */
    @GetMapping
    public List<WorkspaceView> mine() {
        return tenants.myWorkspaces();
    }

    /** Stand in a different workspace — see {@link TenantService#activate}. */
    @PostMapping("/{tenantId}/activate")
    public ActivateResponse activate(@PathVariable UUID tenantId,
                                     @RequestBody(required = false) ActivateRequest body,
                                     HttpServletRequest request) {
        String raw = (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
        String subject = SecurityContextHolder.getContext().getAuthentication().getName();
        return tenants.activate(tenantId, body == null ? new ActivateRequest(false) : body, raw, subject);
    }

    /* ------------------------------------------------------------- members */

    @GetMapping("/{tenantId}/members")
    public List<MemberView> members(@PathVariable UUID tenantId) {
        return tenants.members(tenantId);
    }

    /** Null means leave it alone, the same contract {@code /v1/trainers/me} uses. */
    @PatchMapping("/{tenantId}/members/{memberId}/shares")
    public ResponseEntity<Void> shares(@PathVariable UUID tenantId,
                                       @PathVariable UUID memberId,
                                       @Valid @RequestBody UpdateSharesRequest body) {
        tenants.updateShares(tenantId, memberId, body);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{tenantId}/members/{memberId}/role")
    public ResponseEntity<Void> role(@PathVariable UUID tenantId,
                                     @PathVariable UUID memberId,
                                     @Valid @RequestBody UpdateRoleRequest body) {
        tenants.updateRole(tenantId, memberId, body);
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
    public RevenueView revenue(@PathVariable UUID tenantId,
                               @RequestParam LocalDate from,
                               @RequestParam LocalDate to) {
        return revenue.revenue(tenantId, from, to);
    }

    /* ----------------------------------------------------------- handover */

    /** Everyone here with no working coach. */
    @GetMapping("/{tenantId}/stale-clients")
    public List<StaleClient> stale(@PathVariable UUID tenantId) {
        return handover.queue(tenantId);
    }

    /** Give a client a coach. Their history, plan and payments are untouched. */
    @PostMapping("/{tenantId}/clients/{clientId}/assign")
    public ResponseEntity<Void> assign(@PathVariable UUID tenantId,
                                       @PathVariable UUID clientId,
                                       @Valid @RequestBody AssignClientRequest body) {
        handover.assign(tenantId, clientId, body);
        return ResponseEntity.noContent().build();
    }

    /**
     * A coach has stopped working here. Everyone they hold in THIS workspace
     * needs a new one; their clients anywhere else are untouched, because those
     * are a different workspace and were never in scope.
     */
    @PostMapping("/{tenantId}/members/{trainerId}/unavailable")
    public StaleCount unavailable(@PathVariable UUID tenantId,
                                  @PathVariable UUID trainerId,
                                  @RequestBody(required = false) MarkUnavailableRequest body) {
        return new StaleCount(handover.markUnavailable(tenantId, trainerId,
                body == null ? new MarkUnavailableRequest(null) : body));
    }
}
