package com.inclineyou.inclineyou_backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

/**
 * What a web sign-in can do that a phone sign-in cannot: see its own sessions
 * and end them.
 *
 * <p>These endpoints work for a JWT caller too, and answer honestly rather than
 * pretending: the list is empty and revoking is a no-op, because a JWT is not
 * stored anywhere and cannot be recalled. Saying so is better than a button that
 * appears to work.
 */
@RestController
@RequestMapping("/v1/auth/session")
@RequiredArgsConstructor
public class SessionController {

    private final SessionStore sessions;
    private final AuthTokenService tokens;
    private final SessionTokenIssuer sessionIssuer;

    public record SessionView(
            String id, String userAgent, Instant issuedAt, Instant lastSeenAt,
            Instant expiresAt, boolean current
    ) {}

    /** The "you are signed in on" list. */
    @GetMapping
    public List<SessionView> list(HttpServletRequest request) {
        String raw = rawToken(request);
        String currentHash = raw != null && raw.startsWith(SessionTokenIssuer.PREFIX)
                ? SessionTokenIssuer.hash(raw) : null;

        return sessions.listForSubject(caller()).stream()
                .map(s -> new SessionView(
                        s.id().toString(), s.userAgent(),
                        s.issuedAt(), s.lastSeenAt(), s.expiresAt(),
                        s.tokenHash().equals(currentHash)))
                .toList();
    }

    /** Sign out here. On a JWT this is a no-op and the response says so. */
    @DeleteMapping
    public ResponseEntity<SignOut> signOut(HttpServletRequest request) {
        String raw = rawToken(request);
        String kind = tokens.kindOf(raw);
        tokens.revoke(raw);
        return ResponseEntity.ok(new SignOut(kind,
                SessionTokenIssuer.KIND.equals(kind)));
    }

    /**
     * @param revoked false for a JWT, which expires on its own clock. The client
     *                should still clear its local copy; this only says whether
     *                the server can stop honouring it.
     */
    public record SignOut(String tokenKind, boolean revoked) {}

    /** Sign out everywhere — every browser, right now. */
    @DeleteMapping("/all")
    public ResponseEntity<SignOutAll> signOutAll() {
        return ResponseEntity.ok(new SignOutAll(sessionIssuer.revokeAllFor(caller())));
    }

    public record SignOutAll(int sessionsEnded) {}

    private static String caller() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static String rawToken(HttpServletRequest request) {
        return (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
    }
}
