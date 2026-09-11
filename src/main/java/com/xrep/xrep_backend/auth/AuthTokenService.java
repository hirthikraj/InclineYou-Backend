package com.xrep.xrep_backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The interface layer: the one place that decides WHICH kind of credential a
 * caller gets, and the one place that turns any credential back into an identity.
 *
 * <p>Everything below this class is issuer-blind. {@code AuthService} mints
 * through {@link #issueForCurrentRequest}, the filter resolves through
 * {@link #resolve}, and neither knows nor can find out whether it is dealing
 * with a JWT or a session.
 *
 * <h2>How the platform is chosen</h2>
 *
 * From the {@value #CLIENT_HEADER} header: {@code web} gets a session,
 * everything else gets a JWT. <b>Absence means mobile</b>, and that default is
 * load-bearing — every build in the field today sends no such header, and a
 * default of "session" would hand offline-first phones a credential that needs a
 * server to mean anything.
 *
 * <p>The header is read from the ambient request rather than threaded through
 * eight {@code AuthService} signatures. That is a deliberate trade: the
 * alternative spreads a transport concern through the sign-in domain, and the
 * fallback when there is no request at all (a scheduled job, a test) is the
 * mobile default, which is safe.
 */
@Service
@Slf4j
public class AuthTokenService {

    public static final String CLIENT_HEADER = "X-XRep-Client";
    public static final String WEB = "web";

    private final List<AuthTokenIssuer> issuers;
    private final JwtTokenIssuer jwt;
    private final SessionTokenIssuer session;

    public AuthTokenService(JwtTokenIssuer jwt, SessionTokenIssuer session) {
        this.jwt = jwt;
        this.session = session;
        this.issuers = List.of(session, jwt);
    }

    public enum Platform { MOBILE, WEB }

    public IssuedToken issue(AuthPrincipal principal, Platform platform, TokenContext context) {
        return (platform == Platform.WEB ? session : jwt).issue(principal, context);
    }

    /** Mint for whoever is calling right now, on whatever they are calling from. */
    public IssuedToken issueForCurrentRequest(AuthPrincipal principal) {
        HttpServletRequest req = currentRequest();
        Platform platform = platformOf(req);
        TokenContext ctx = req == null ? TokenContext.NONE
                : new TokenContext(req.getHeader("User-Agent"), req.getRemoteAddr());
        return issue(principal, platform, ctx);
    }

    /**
     * @return the identity behind a credential of either kind. Empty for an
     *         expired, revoked, forged or unrecognised token — the filter treats
     *         all four the same as no credential, which is what stops a bad token
     *         from being distinguishable from a missing one.
     */
    public Optional<AuthPrincipal> resolve(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return Optional.empty();
        for (AuthTokenIssuer issuer : issuers) {
            if (issuer.handles(rawToken)) return issuer.resolve(rawToken);
        }
        return Optional.empty();
    }

    public void revoke(String rawToken) {
        for (AuthTokenIssuer issuer : issuers) {
            if (issuer.handles(rawToken)) { issuer.revoke(rawToken); return; }
        }
    }

    /**
     * Point this credential at another workspace.
     *
     * @return empty when the credential was moved in place (a session — the
     *         browser keeps the token it has), or a freshly minted token when it
     *         could not be (a JWT — its workspace is a signed claim).
     */
    public Optional<IssuedToken> switchTenant(String rawToken, AuthPrincipal principal, UUID tenantId) {
        for (AuthTokenIssuer issuer : issuers) {
            if (issuer.handles(rawToken) && issuer.switchTenant(rawToken, tenantId)) {
                return Optional.empty();
            }
        }
        return Optional.of(issue(principal.withTenant(tenantId),
                platformOf(currentRequest()),
                TokenContext.NONE));
    }

    /** What kind of credential this raw token is, for the response body. */
    public String kindOf(String rawToken) {
        for (AuthTokenIssuer issuer : issuers) {
            if (issuer.handles(rawToken)) return issuer.kind();
        }
        return JwtTokenIssuer.KIND;
    }

    private static Platform platformOf(HttpServletRequest req) {
        if (req == null) return Platform.MOBILE;
        String header = req.getHeader(CLIENT_HEADER);
        return WEB.equalsIgnoreCase(header) ? Platform.WEB : Platform.MOBILE;
    }

    private static HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        return attrs instanceof ServletRequestAttributes s ? s.getRequest() : null;
    }
}
