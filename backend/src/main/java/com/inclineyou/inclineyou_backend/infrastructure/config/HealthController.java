package com.inclineyou.inclineyou_backend.infrastructure.config;

import com.inclineyou.inclineyou_backend.core.auth.RedisOtpStore;
import com.inclineyou.inclineyou_backend.infrastructure.ratelimit.Bucket4jLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Unauthenticated liveness probe for Railway and the uptime monitor.
 *
 * Checks the database too — a backend that cannot reach Postgres is not healthy.
 *
 * ── Why Redis is reported but does NOT affect `status` ────────────────────────
 *
 * Because it genuinely does not affect health. Every Redis-backed component here
 * has a working fallback: OTP state drops to `otp_request`, rate limiting to
 * in-process buckets. Sign-in keeps working and the limits keep holding, so a
 * backend running without Redis is degraded, not down — and returning 503 for it
 * would tell Railway to kill a container that is serving traffic correctly.
 *
 * It is reported because the alternative is grepping logs to answer "are we on
 * Redis right now", which is a question worth being able to answer from a URL —
 * especially in production, where nobody is tailing anything.
 */
@RestController
@RequiredArgsConstructor
public class HealthController {

    private final NamedParameterJdbcTemplate jdbc;
    private final Bucket4jLimiter limiter;
    /** Optional: absent entirely when `app.redis.enabled` is false. */
    private final ObjectProvider<RedisOtpStore> otpStore;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        var body = new LinkedHashMap<String, String>();

        boolean dbUp;
        try {
            jdbc.queryForObject("SELECT 1", Map.of(), Integer.class);
            dbUp = true;
        } catch (Exception e) {
            dbUp = false;
        }

        body.put("status", dbUp ? "UP" : "DOWN");
        body.put("db", dbUp ? "UP" : "DOWN");

        boolean limitsOnRedis = limiter.distributed();
        RedisOtpStore store = otpStore.getIfAvailable();
        boolean otpOnRedis = store != null && store.available();

        body.put("rateLimiting", limitsOnRedis ? "redis" : "in-process (fallback)");
        body.put("otpStore", otpOnRedis ? "redis" : "postgres (fallback)");
        body.put("redis", (limitsOnRedis && otpOnRedis) ? "UP"
                : (limitsOnRedis || otpOnRedis) ? "PARTIAL" : "DOWN");

        return ResponseEntity.status(dbUp ? 200 : 503).body(body);
    }
}
