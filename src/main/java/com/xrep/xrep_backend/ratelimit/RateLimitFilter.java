package com.xrep.xrep_backend.ratelimit;

import com.xrep.xrep_backend.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * A ceiling on every endpoint, applied per caller.
 *
 * Sits immediately after {@code JwtAuthFilter} in the security chain, which is the
 * one position that gets both halves right: the token has been parsed, so an
 * authenticated caller is counted as themselves rather than as their network; and
 * authorisation has not run yet, so a flood of requests that will end in 401 is
 * still counted. An interceptor would have missed the second half entirely —
 * unauthorised traffic never reaches a handler, and that is exactly the traffic
 * worth limiting.
 *
 * ── The key ───────────────────────────────────────────────────────────────────
 *
 * The token's subject when there is one: a trainer id, or a client's phone. That
 * is proven, stable across reconnects, and cannot be spoofed. Only sign-in and
 * health have no subject, and those fall back to the remote address — which is
 * the proxy's behind Railway unless {@code server.forward-headers-strategy} says
 * otherwise, so the auth tier is set loose enough that a shared address does not
 * lock out a whole city. The real limit on that path is per phone number and
 * lives in {@code OtpService}.
 *
 * ── The tiers ─────────────────────────────────────────────────────────────────
 *
 * Which endpoints cost money is a fact about the endpoints, so the mapping is
 * here rather than in YAML: a nudge and a weekly report each spend a WhatsApp
 * message, sync is chatty by design, and everything else shares one ceiling.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter limiter;
    private final AppProperties props;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        var config = props.getRateLimit();
        if (!config.isEnabled()) {
            chain.doFilter(request, response);
            return;
        }

        Tier tier = tierFor(request);
        if (tier == null) { // exempt — see tierFor
            chain.doFilter(request, response);
            return;
        }

        AppProperties.Tier limits = switch (tier) {
            case AUTH -> config.getAuth();
            case SYNC -> config.getSync();
            case MESSAGING -> config.getMessaging();
            case STANDARD -> config.getStandard();
        };

        String caller = caller(request);
        var decision = limiter.take(tier.name() + '|' + caller, limits);
        if (decision.allowed()) {
            chain.doFilter(request, response);
            return;
        }

        log.warn("rate limited {} {} for {} — retry in {}s",
                request.getMethod(), request.getRequestURI(), masked(caller), decision.retryAfterSeconds());
        refuse(request, response, decision.retryAfterSeconds());
    }

    private enum Tier { STANDARD, AUTH, SYNC, MESSAGING }

    /** Null means exempt. */
    private Tier tierFor(HttpServletRequest request) {
        String path = request.getRequestURI();

        // Railway polls this to decide whether the container is alive. Limiting it
        // is a way to get a healthy deployment killed.
        if ("/health".equals(path)) return null;

        if (path.startsWith("/v1/auth/")) return Tier.AUTH;
        if (path.startsWith("/v1/sync/") || path.startsWith("/v1/client/sync/")) return Tier.SYNC;
        // Each of these spends a WhatsApp message on somebody's behalf.
        if ("POST".equals(request.getMethod())
                && (path.endsWith("/nudge") || path.endsWith("/report/weekly"))) {
            return Tier.MESSAGING;
        }
        return Tier.STANDARD;
    }

    /**
     * Who is being counted. The subject if the token gave us one — at this point
     * in the chain {@code JwtAuthFilter} has already run and anonymous requests
     * still have a null authentication, because the anonymous filter is later.
     */
    private String caller(HttpServletRequest request) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !auth.getName().isBlank()) {
            return auth.getName();
        }
        String ip = request.getRemoteAddr();
        return "ip:" + (ip == null ? "unknown" : ip);
    }

    /** A trainer id or a phone number is not something to write to a log in full. */
    private static String masked(String caller) {
        return caller.length() <= 6 ? caller : caller.substring(0, 6) + "…";
    }

    /**
     * The same shape {@code GlobalExceptionHandler} produces, written by hand:
     * a filter throws outside the reach of {@code @RestControllerAdvice}, so
     * nothing downstream would turn an exception into a body.
     *
     * `code` is `RATE_LIMITED` and deliberately neither `OTP_LOCKED` nor
     * `OTP_THROTTLED` — the app branches on that field, and a capacity refusal
     * must not be drawn as a sign-in lock.
     */
    private void refuse(HttpServletRequest request, HttpServletResponse response, int retryAfterSeconds)
            throws IOException {
        // Written by hand rather than through an ObjectMapper: there is no
        // ObjectMapper bean to inject in this application, and six fixed fields
        // do not earn one. The only value that isn't a literal is the path, and
        // that is attacker-controlled, so it gets escaped.
        String body = """
                {"type":"about:blank","title":"%s","status":%d,\
                "detail":"Too many requests — slow down and try again.",\
                "instance":"%s","code":"RATE_LIMITED","retryAfterSeconds":%d}"""
                .formatted(HttpStatus.TOO_MANY_REQUESTS.getReasonPhrase(),
                        HttpStatus.TOO_MANY_REQUESTS.value(),
                        jsonEscape(request.getRequestURI()),
                        retryAfterSeconds);

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(body);
    }

    /** Enough of a JSON string escape for a URI — quotes, backslashes, controls. */
    private static String jsonEscape(String raw) {
        if (raw == null) return "";
        StringBuilder out = new StringBuilder(raw.length() + 8);
        for (char c : raw.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.toString();
    }
}
