package com.inclineyou.inclineyou_backend.auth;

import java.time.Instant;
import java.util.UUID;

/**
 * Who a credential says the caller is — independent of how the credential was
 * spelled.
 *
 * <p>This record is the seam between the two token kinds. A JWT carries these
 * fields as signed claims; a web session carries them as a row in
 * {@code web_session} that an opaque token points at. Everything above the
 * filter sees only this, which is what lets the phone and the browser
 * authenticate by completely different mechanisms while 46 call sites that read
 * {@code SecurityContextHolder} stay untouched.
 *
 * @param subject   what {@code getAuthentication().getName()} will return: a
 *                  trainer UUID for a trainer, the phone for every other role.
 *                  Kept identical across both issuers on purpose — the moment
 *                  the two disagree, every caller has to learn which kind of
 *                  token it got.
 * @param phone     the number that was proved
 * @param role      {@code trainer} | {@code client} | {@code pending} |
 *                  {@code invited} | {@code phone_change}
 * @param tenantId  the ACTIVE workspace. Null for a role that has not got one
 *                  yet — {@code pending} has proved a number and belongs
 *                  nowhere, which is exactly what it means.
 * @param expiresAt when the credential stops working
 */
public record AuthPrincipal(
        String subject,
        String phone,
        String role,
        UUID tenantId,
        Instant expiresAt
) {
    public AuthPrincipal withTenant(UUID newTenantId) {
        return new AuthPrincipal(subject, phone, role, newTenantId, expiresAt);
    }
}
