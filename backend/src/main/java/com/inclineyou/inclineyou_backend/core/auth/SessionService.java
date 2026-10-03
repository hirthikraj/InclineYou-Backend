package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.SessionItem;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * THE SIGNED-IN BROWSERS (api-contract v1.1, Settings A10) — see them, end one,
 * end all the others.
 *
 * <p>Everything is keyed by the caller's subject and nothing else, which is the
 * whole of the authorisation: a session id that belongs to somebody else matches
 * no row and is therefore indistinguishable from one that is already gone. The
 * contract says so out loud — a revoke of "an id that isn't yours still answers
 * 204 — nothing to leak and nothing to retry" — so there is no 404 to probe.
 *
 * <p>A JWT caller (the phone) has no stored session. The list is then empty and
 * "sign out" is a no-op, the honest answer {@link JwtTokenIssuer} already gives.
 */
@Service
@RequiredArgsConstructor
public class SessionService {

    /** The path word that means "the session this request came in on". */
    public static final String CURRENT = "current";

    private final SessionStore sessions;
    private final AuthTokenService tokens;

    public List<SessionItem> list(String subject, String rawToken) {
        String current = currentHash(rawToken);
        return sessions.listForSubject(subject).stream()
                .map(s -> new SessionItem(s.id().toString(), s.userAgent(),
                        s.issuedAt().toEpochMilli(), s.lastSeenAt().toEpochMilli(),
                        s.tokenHash().equals(current)))
                .toList();
    }

    /** One browser — or {@code current}, which is sign-out. Idempotent. */
    public void signOut(String subject, String rawToken, String idOrCurrent) {
        if (CURRENT.equals(idOrCurrent)) {
            tokens.revoke(rawToken);
            return;
        }
        UUID id;
        try {
            id = UUID.fromString(idOrCurrent);
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("id: a session id, or \"current\"");
        }
        sessions.revokeById(id, subject, Instant.now(), SessionStore.SIGN_OUT);
    }

    /** Everything except the browser this request came in on. */
    public void signOutOthers(String subject, String rawToken, String scope) {
        if (!"others".equals(scope)) throw ApiException.validation("scope: only \"others\" is defined");
        sessions.revokeOthers(subject, currentHash(rawToken), Instant.now(), SessionStore.SIGN_OUT_ALL);
    }

    private static String currentHash(String rawToken) {
        return rawToken != null && rawToken.startsWith(SessionTokenIssuer.PREFIX)
                ? SessionTokenIssuer.hash(rawToken) : null;
    }
}
