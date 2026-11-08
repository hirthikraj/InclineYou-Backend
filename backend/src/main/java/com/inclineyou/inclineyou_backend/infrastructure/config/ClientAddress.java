package com.inclineyou.inclineyou_backend.infrastructure.config;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Pattern;

/**
 * The address of the person on the other end — which, for the web, is not the address that connected.
 *
 * <p>No browser talks to this backend: the Next server does, for every web user. So
 * {@code getRemoteAddr()} on a web request is the Next server's own address, the same for everybody,
 * and {@code FORWARD_HEADERS} cannot help because the hop it would read is Next's, not the browser's.
 * Every limit keyed by address — {@code OtpAbuseGuard} (5 numbers per address per hour, then a 24-hour
 * block), the invite code sends, and the {@code AUTH} rate-limit bucket — would then count the whole
 * product as one caller: the sixth person to sign in within an hour would block sign-in for everyone
 * for a day.
 *
 * <p>So the web forwards the browser's address in {@link #FORWARDED_IP}, and proves it is the web by
 * {@link #PROXY_KEY}, a secret only the two servers hold ({@code WEB_PROXY_SECRET}). Without the key the
 * header is ignored: the phone and anybody else reach this API directly, and an address header anyone can
 * set would let one caller look like a fresh stranger on every request, which is worse than the bug.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ClientAddress {

    public static final String FORWARDED_IP = "X-InclineYou-Forwarded-For";
    public static final String PROXY_KEY = "X-InclineYou-Proxy-Key";

    /** An IPv4 or IPv6 literal, loosely: enough to refuse a header used to smuggle anything else into a bucket key. */
    private static final Pattern IP = Pattern.compile("^[0-9A-Fa-f:.]{2,45}$");

    private final AppProperties props;

    @PostConstruct
    void warnIfUnset() {
        if (secret().length == 0) {
            log.warn("WEB_PROXY_SECRET is not set: every web user will be rate-limited and abuse-blocked as the web server's one address");
        }
    }

    /** The caller's address: the browser's, when the web vouches for it; otherwise whoever connected. */
    public String of(HttpServletRequest request) {
        String forwarded = request.getHeader(FORWARDED_IP);
        if (forwarded != null && IP.matcher(forwarded).matches() && fromWeb(request)) {
            return forwarded;
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : remote;
    }

    private boolean fromWeb(HttpServletRequest request) {
        byte[] expected = secret();
        String presented = request.getHeader(PROXY_KEY);
        return expected.length > 0 && presented != null
                && MessageDigest.isEqual(expected, presented.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] secret() {
        String s = props.getWeb().getProxySecret();
        return s == null || s.isBlank() ? new byte[0] : s.getBytes(StandardCharsets.UTF_8);
    }
}
