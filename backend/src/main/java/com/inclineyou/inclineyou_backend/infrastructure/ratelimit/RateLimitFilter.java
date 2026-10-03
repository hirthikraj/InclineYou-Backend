package com.inclineyou.inclineyou_backend.infrastructure.ratelimit;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import jakarta.annotation.PostConstruct;
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
 * The counting moved to Redis (Bucket4j) so that the ceiling is the ceiling
 * rather than the ceiling per process — the limitation the known-gaps list
 * carried, where a restart cleared every counter and each instance kept its own.
 * {@link Bucket4jLimiter} falls back to the in-process {@link RateLimiter} when
 * Redis is unreachable, which is a weaker limit and not an absent one.
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
 * message, and everything else shares one ceiling.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    private final Bucket4jLimiter limiter;
    private final AppProperties props;

    /**
     * Say it out loud at boot. An absent ceiling looks exactly like a ceiling
     * nobody has reached yet, and the one way that becomes an incident is a
     * deployment that carries a laptop's default into production — so the
     * disabled case warns, with the variable that turns it back on named in the
     * line, the same way {@code DatabaseIdentityCheck} warns about an owner
     * connection.
     */
    @PostConstruct
    void announce() {
        if (props.getRateLimit().isEnabled()) {
            log.info("rate limiting ON — standard {}/{}s, auth {}/{}s, messaging {}/{}s",
                    props.getRateLimit().getStandard().getLimit(), props.getRateLimit().getStandard().getWindowSeconds(),
                    props.getRateLimit().getAuth().getLimit(), props.getRateLimit().getAuth().getWindowSeconds(),
                    props.getRateLimit().getMessaging().getLimit(), props.getRateLimit().getMessaging().getWindowSeconds());
        } else {
            log.warn("rate limiting OFF — every tier is unlimited. "
                    + "This is the `dev` profile default; set RATE_LIMIT_ENABLED=true to restore it. "
                    + "Nothing but the per-number OTP throttle stands in front of /v1/auth/**.");
        }
    }

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
            case MESSAGING -> config.getMessaging();
            case STANDARD -> config.getStandard();
        };

        String caller = caller(request);
        // The tier is part of the key, so a trainer hammering /sync does not
        // spend the budget that their next ordinary request needs.
        var decision = limiter.tryConsume(
                "rl:" + tier.name() + ':' + caller,
                limits.getLimit(),
                java.time.Duration.ofSeconds(Math.max(1, limits.getWindowSeconds())));
        if (decision.allowed()) {
            chain.doFilter(request, response);
            return;
        }

        log.warn("rate limited {} {} for {} — retry in {}s",
                request.getMethod(), request.getRequestURI(), masked(caller), decision.retryAfterSeconds());
        refuse(request, response, decision.retryAfterSeconds());
    }

    private enum Tier { STANDARD, AUTH, MESSAGING }

    /** Null means exempt. */
    private Tier tierFor(HttpServletRequest request) {
        String path = request.getRequestURI();

        // Railway polls this to decide whether the container is alive. Limiting it
        // is a way to get a healthy deployment killed.
        if ("/health".equals(path)) return null;

        if (path.startsWith("/v1/auth/")) return Tier.AUTH;
        // Changing the number sends a code to the NEW number and ends in a swap of the
        // sign-in credential: it is an authentication act, so it is counted as one
        // (api-contract v1.1 names "the AUTH tier" for these two).
        if (path.startsWith("/v1/trainers/me/phone/")) return Tier.AUTH;
        // Each of these spends a WhatsApp message on somebody's behalf, so the
        // 10/min ceiling is the anti-spam control and not only a cost control.
        if ("POST".equals(request.getMethod())
                && (path.endsWith("/nudge")
                    // 1.1's route (POST /v1/clients/{id}/nudges). A GET of the
                    // same path is the history and stays STANDARD.
                    || path.endsWith("/nudges")
                    || path.endsWith("/report/weekly"))) {
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
