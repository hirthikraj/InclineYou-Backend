package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The one place that answers "which workspaces is this person in, and what are
 * they in each".
 *
 * <p>Deliberately the same shape as {@code TeamScope}, which has answered the
 * narrower question — "whose rows may this caller read" — since V26. One place
 * to audit, one place to get it wrong. A query that assembles its own list of
 * workspaces is a query that will still be doing it the old way after the rules
 * change.
 *
 * <h2>Two views, because a trainer has two questions</h2>
 *
 * <b>Combined</b> is every workspace they belong to, and it is the default for
 * the diary: their 07:00 private client and their 18:00 gym client are one
 * working day, and a screen that shows half of it is lying about the day.
 *
 * <b>Focused</b> is one workspace, and it is compulsory for the money book —
 * tier 2 reads the active workspace only, so a total is never a mix of two
 * businesses. The switcher at the top of the app sets which.
 *
 * <h2>The seven-day problem</h2>
 *
 * Tokens live a week, so on the deploy that turns tenancy on, every trainer in
 * the field holds a credential minted before the workspace claim existed.
 * {@link #resolve} takes a null active workspace and falls back to the home one.
 * Rejecting instead would sign out the entire user base at once.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TenantScope {

    private final TenantJdbcRepository repo;

    /**
     * @param activeTenantId  where the caller is standing. Never null after
     *                        resolution — a trainer always has a home workspace.
     * @param memberships     every live membership, in the order the switcher
     *                        should draw them: home first, then by name.
     * @param combined        true when reads span every workspace
     */
    public record Scope(
            String phone,
            UUID trainerId,
            UUID activeTenantId,
            List<Membership> memberships,
            boolean combined
    ) {
        public List<UUID> readableTenantIds() {
            if (!combined) return List.of(activeTenantId);
            return memberships.stream().map(Membership::tenantId).distinct().toList();
        }

        public Optional<Membership> active() {
            return memberships.stream()
                    .filter(m -> m.tenantId().equals(activeTenantId))
                    .findFirst();
        }

        /** The caller's role in the workspace they are standing in. */
        public String activeRole() {
            return active().map(Membership::role).orElse(TenantRole.COACH);
        }

        public boolean administersActive() {
            return TenantRole.administers(activeRole());
        }

        public boolean ownsActive() {
            return TenantRole.OWNER.equals(activeRole());
        }

        public boolean isMemberOf(UUID tenantId) {
            return memberships.stream().anyMatch(m -> m.tenantId().equals(tenantId));
        }
    }

    public record Membership(
            UUID memberId,
            UUID tenantId,
            String tenantName,
            String tenantType,
            String role,
            boolean home,
            java.math.BigDecimal revenueSharePercent,
            java.math.BigDecimal assignmentMarginPercent
    ) {}

    /**
     * @param phone         the number the credential proved
     * @param trainerId     the caller's trainer row, or null for a non-coaching
     *                      member such as a gym administrator
     * @param requested     the workspace the token asked for, or null on a token
     *                      minted before the claim existed
     * @param combined      whether reads should span every workspace
     */
    public Scope resolve(String phone, UUID trainerId, UUID requested, boolean combined) {
        List<Membership> memberships = membershipsFor(phone);

        UUID active = null;
        if (requested != null && memberships.stream().anyMatch(m -> m.tenantId().equals(requested))) {
            active = requested;
        }
        if (active == null) {
            // Home first, then anything at all. A caller whose requested
            // workspace is not one of theirs is not refused here — they are put
            // back in their own, because the alternative is a 403 on every
            // request after an admin removes somebody mid-session.
            active = memberships.stream().filter(Membership::home).findFirst()
                    .or(() -> memberships.stream().findFirst())
                    .map(Membership::tenantId)
                    .orElse(null);
        }
        if (active == null && trainerId != null) {
            active = homeTenantOf(trainerId);
        }
        return new Scope(phone, trainerId, active, memberships, combined);
    }

    /**
     * Every live membership for a number.
     *
     * <p>Reads through the bootstrap policy in V42 — see
     * {@link TenantJdbcRepository#memberships}.
     */
    public List<Membership> membershipsFor(String phone) {
        if (phone == null || phone.isBlank()) return List.of();
        return repo.memberships(phone);
    }

    /** Where a trainer's own data lives, for a token that predates the claim. */
    public UUID homeTenantOf(UUID trainerId) {
        return repo.homeTenantOf(trainerId).orElse(null);
    }

    /** The client rows behind a phone — the client lens, plural by requirement. */
    public List<UUID> clientIdsFor(String phone) {
        if (phone == null || phone.isBlank()) return List.of();
        return repo.clientIdsFor(phone);
    }

    /** The workspaces those client rows are coached in. */
    public List<UUID> clientTenantIdsFor(String phone) {
        if (phone == null || phone.isBlank()) return List.of();
        return repo.clientTenantIdsFor(phone);
    }
}
