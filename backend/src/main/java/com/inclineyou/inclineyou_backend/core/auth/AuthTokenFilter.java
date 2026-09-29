package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * One credential surface, two kinds of credential, and the tenant context that
 * the database will be told about.
 *
 * <p>Replaces {@code JwtAuthFilter}. The authentication half is unchanged in
 * effect — same subject, same {@code ROLE_*} authority, same
 * {@code RequestAttributeSecurityContextRepository} — so the 46 places that read
 * {@code SecurityContextHolder} carry on working. What is new is that the token
 * may be a session rather than a JWT, and that the request now also carries a
 * workspace.
 *
 * <h2>The credential may arrive two ways</h2>
 *
 * {@code Authorization: Bearer …} for both kinds, and a cookie for the web,
 * because a token in an httpOnly cookie is a token browser JavaScript cannot
 * read. {@link AuthTokenService} works out which issuer owns it.
 *
 * <h2>Combined or focused</h2>
 *
 * The {@value #VIEW_HEADER} header says whether reads should span every
 * workspace this person is in, or just the one they are standing in. Default is
 * combined, because the diary is the screen this is mostly for and a trainer's
 * day does not stop at a workspace boundary. The money book ignores the header
 * entirely — tier 2 reads the active workspace and nothing else, whatever this
 * says.
 *
 * <h2>The finally block is not optional</h2>
 *
 * A tenant context left on a pooled request thread is the next caller reading
 * the previous caller's workspace. That is the single worst outcome available in
 * this file, and it is one missing {@code clear()} away.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuthTokenFilter extends OncePerRequestFilter {

    private final AuthTokenService tokens;
    private final TenantScope tenantScope;

    /** {@code combined} (default) or {@code focused}. */
    public static final String VIEW_HEADER = "X-InclineYou-View";
    public static final String SESSION_COOKIE = "inclineyou_session";
    public static final String TOKEN_ATTRIBUTE = "inclineyou.rawToken";

    private final SecurityContextRepository securityContextRepository =
            new RequestAttributeSecurityContextRepository();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String raw = extractToken(request);
        try {
            if (raw != null) {
                tokens.resolve(raw).ifPresent(principal -> authenticate(request, response, raw, principal));
            }
            chain.doFilter(request, response);
        } finally {
            // All three, always. A context or a scope left on a pooled request
            // thread is the next caller reading the previous caller's workspace,
            // which is the worst outcome available in this file and is one
            // missing clear() away.
            TenantContext.clear();
            CurrentScope.clear();
            SecurityContextHolder.clearContext();
        }
    }

    private void authenticate(HttpServletRequest request, HttpServletResponse response,
                              String raw, AuthPrincipal principal) {
        var auth = new UsernamePasswordAuthenticationToken(
                principal.subject(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + principal.role().toUpperCase())));
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        securityContextRepository.saveContext(ctx, request, response);
        request.setAttribute(TOKEN_ATTRIBUTE, raw);

        TenantContext.set(tenantContextFor(principal, combinedView(request)));
        log.debug("auth ok: subject={} role={} tenant={}",
                principal.subject(), principal.role(), principal.tenantId());
    }

    private TenantContext tenantContextFor(AuthPrincipal p, boolean combined) {
        if (JwtService.ROLE_CLIENT.equals(p.role())) {
            // A client is not staff of anything. They get their own rows through
            // tier 4 and the catalogue of the workspaces they train in — never
            // tier 1, which would be the whole roster.
            var clientIds = tenantScope.clientIdsFor(p.phone());
            var tenantIds = tenantScope.clientTenantIdsFor(p.phone());
            return TenantContext.client(p.phone(),
                    tenantIds.isEmpty() ? null : tenantIds.getFirst(), tenantIds, clientIds);
        }

        if (!JwtService.ROLE_TRAINER.equals(p.role())) {
            // `pending`, `invited` and `phone_change` have proved a number and
            // belong to no workspace. The bootstrap context lets them look up
            // their own memberships — which is exactly what the invite screen
            // asks — and nothing else.
            return TenantContext.bootstrap(p.phone());
        }

        UUID trainerId = parseUuid(p.subject());
        // Resolved on a bootstrap context so the membership lookup can see its
        // own rows; the full context replaces it before the request runs.
        TenantContext.set(TenantContext.bootstrap(p.phone()));
        var scope = tenantScope.resolve(p.phone(), trainerId, p.tenantId(), combined);
        CurrentScope.set(scope);
        if (scope.activeTenantId() == null) {
            log.warn("trainer {} has no workspace — request will read nothing", p.subject());
            return TenantContext.bootstrap(p.phone());
        }
        return TenantContext.staff(p.phone(), scope.activeTenantId(),
                scope.readableTenantIds(), trainerId);
    }

    private static boolean combinedView(HttpServletRequest request) {
        String header = request.getHeader(VIEW_HEADER);
        return header == null || !"focused".equalsIgnoreCase(header);
    }

    /** Header first, cookie second. Both are accepted; neither is required. */
    private static String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String value = header.substring(7).trim();
            if (!value.isEmpty()) return value;
        }
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) {
                if (SESSION_COOKIE.equals(cookie.getName()) && cookie.getValue() != null
                        && !cookie.getValue().isBlank()) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
