package com.xrep.xrep_backend.auth;

import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The mobile credential: a signed, self-contained, unrevokable JWT.
 *
 * <p>This is a thin adapter over {@link JwtService}, which keeps every existing
 * claim exactly as it was. Old tokens issued before tenancy have no {@code tid}
 * claim and must keep working for their full seven days — {@link #resolve}
 * returns a null tenant for those and {@code TenantScope} falls back to the
 * trainer's home workspace. Rejecting them instead would sign out every trainer
 * in the field on the deploy that turned this on.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JwtTokenIssuer implements AuthTokenIssuer {

    private final JwtService jwtService;

    public static final String KIND = "jwt";

    @Override
    public String kind() { return KIND; }

    /**
     * Three dot-separated base64 segments. Structural, so a mobile request never
     * pays a database round trip to establish that its token is a JWT.
     */
    @Override
    public boolean handles(String rawToken) {
        if (rawToken == null || rawToken.startsWith(SessionTokenIssuer.PREFIX)) return false;
        int first = rawToken.indexOf('.');
        return first > 0 && rawToken.indexOf('.', first + 1) > first;
    }

    @Override
    public IssuedToken issue(AuthPrincipal p, TokenContext context) {
        String token = jwtService.build(p.subject(), p.phone(), p.role(), p.tenantId());
        return new IssuedToken(token, KIND, jwtService.parse(token).getExpiration().toInstant());
    }

    @Override
    public Optional<AuthPrincipal> resolve(String rawToken) {
        try {
            var claims = jwtService.parse(rawToken);
            return Optional.of(new AuthPrincipal(
                    claims.getSubject(),
                    claims.get("phone", String.class),
                    jwtService.extractRole(claims),
                    jwtService.extractTenantId(claims),
                    claims.getExpiration().toInstant()));
        } catch (JwtException | IllegalArgumentException e) {
            log.warn("JWT parse failed: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * A JWT cannot be revoked, and pretending otherwise would be worse than
     * saying so. The phone signs out locally; the token dies on its own clock.
     */
    @Override
    public void revoke(String rawToken) {
        log.debug("JWT revoke is a no-op — the token expires on its own");
    }

    /**
     * The workspace is a signed claim, so moving it means a new signature.
     * Returning false is how the caller is told to expect a fresh token.
     */
    @Override
    public boolean switchTenant(String rawToken, UUID tenantId) {
        return false;
    }
}
