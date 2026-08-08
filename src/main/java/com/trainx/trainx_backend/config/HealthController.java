package com.trainx.trainx_backend.config;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Unauthenticated liveness probe for Railway and the uptime monitor.
 * Checks the database too — a backend that can't reach Postgres isn't healthy.
 */
@RestController
@RequiredArgsConstructor
public class HealthController {

    private final NamedParameterJdbcTemplate jdbc;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.queryForObject("SELECT 1", Map.of(), Integer.class);
            return ResponseEntity.ok(Map.of("status", "UP", "db", "UP"));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("status", "DOWN", "db", "DOWN"));
        }
    }
}
