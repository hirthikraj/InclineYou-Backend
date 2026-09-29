package com.inclineyou.inclineyou_backend.infrastructure.config;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Redis, and the one thing worth saying about it: nothing here is required.
 *
 * Every Redis-backed component in this application has a working fallback —
 * OTP state to {@code otp_request} in Postgres, rate limiting to the in-process
 * buckets that were there before. That is deliberate. A cache being unreachable
 * must never be the reason a trainer cannot sign in, and the limits it enforces
 * are not the kind you may quietly drop, so "off" has to mean "somewhere else",
 * not "unlimited".
 *
 * ── Durability is a security property here ────────────────────────────────────
 *
 * The OTP lock and the daily send ceiling are abuse controls. V17 moved the lock
 * out of a {@code ConcurrentHashMap} and onto a row precisely because an
 * in-memory lock made the brute-force ceiling "three attempts per deploy". Moving
 * it into a Redis without AOF would put that back, dressed as an improvement —
 * hence {@code --appendonly yes} in docker-compose, and the same on any managed
 * instance this ever points at.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class RedisConfig {

    /**
     * Bucket4j talks to Lettuce directly rather than through Spring Data.
     *
     * It runs its own compare-and-swap Lua over a connection whose values are
     * raw bytes, which is not how Spring Data's template is configured for the
     * string keys the OTP store uses. Two codecs, one server; giving Bucket4j
     * its own client is cheaper than making one connection serve both awkwardly.
     *
     * Creating the client opens nothing — {@code RedisClient.create} does no
     * I/O. The connection is made on first use by
     * {@link com.inclineyou.inclineyou_backend.infrastructure.ratelimit.RedisProxyManagerHolder}, and that
     * split is load-bearing: connecting here would make Redis a hard startup
     * dependency and turn "degrade to in-memory buckets" into "fail to boot".
     */
    @Bean(destroyMethod = "shutdown")
    public RedisClient bucket4jRedisClient(
            @Value("${spring.data.redis.host:localhost}") String host,
            @Value("${spring.data.redis.port:6379}") int port,
            @Value("${spring.data.redis.password:}") String password) {

        RedisURI.Builder uri = RedisURI.builder().withHost(host).withPort(port)
                // Matches the Spring Data timeout. A rate-limit check that hangs
                // is worse than one that fails over to the in-memory bucket.
                .withTimeout(Duration.ofMillis(250));
        if (password != null && !password.isBlank()) {
            uri.withPassword(password.toCharArray());
        }
        return RedisClient.create(uri.build());
    }

}
