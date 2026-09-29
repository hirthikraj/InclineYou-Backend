package com.inclineyou.inclineyou_backend.core.auth;

import java.util.Optional;
import java.util.UUID;

/**
 * One way of turning a proved identity into a credential, and back.
 *
 * <p>There are two implementations and they exist because the phone and the
 * browser want opposite things from a credential.
 *
 * <p><b>The phone is offline half the time</b> and cannot ask a server whether
 * it is still signed in. A self-contained JWT is exactly right for it: no round
 * trip, no dependency on reachability, and its one real cost — you cannot revoke
 * it before it expires — is acceptable on a device the trainer is holding.
 *
 * <p><b>The browser is never meaningfully offline</b> and has the opposite risk
 * profile: a token that leaks from a browser is a token somebody else's machine
 * is now holding, and "wait seven days" is not an incident response. So the web
 * gets an opaque token that means nothing on its own and is looked up on every
 * request — which buys revocation, a device list, and a workspace switch that
 * costs an UPDATE rather than a re-mint.
 *
 * <p>The interface is what stops that difference leaking upward.
 * {@link AuthTokenService} picks an issuer once, at the edge; no controller and
 * no service below it can tell which one answered.
 */
public interface AuthTokenIssuer {

    /** {@code jwt} or {@code session}. Reported to the client, branched on by nothing. */
    String kind();

    /**
     * Whether this issuer recognises the shape of a token.
     *
     * <p>Cheap and structural, never a lookup: a session token is recognised by
     * its prefix and a JWT by its three dot-separated segments. An issuer that
     * had to hit the database to answer "is this mine" would make every
     * mobile request pay for the existence of the web.
     */
    boolean handles(String rawToken);

    IssuedToken issue(AuthPrincipal principal, TokenContext context);

    /**
     * @return the identity behind the token, or empty if it is expired, revoked,
     *         forged or simply not one of ours. Empty, never an exception — an
     *         unreadable credential is an unauthenticated request, and the filter
     *         treats it the same as no credential at all.
     */
    Optional<AuthPrincipal> resolve(String rawToken);

    /**
     * End this credential now.
     *
     * <p>Honest asymmetry: a session is revoked, a JWT cannot be and says so by
     * doing nothing. The caller is told which kind it holds, so a web sign-out
     * really ends and a phone sign-out is local plus expiry.
     */
    void revoke(String rawToken);

    /**
     * Move this credential to another workspace, if it can be moved in place.
     *
     * @return true if the existing credential now points at {@code tenantId}.
     *         False means the caller must be given a new token — which is what a
     *         JWT always requires, because its claims are signed.
     */
    boolean switchTenant(String rawToken, UUID tenantId);
}
