package com.inclineyou.inclineyou_backend.core.auth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The sweeper's purge: old rows go, a row still holding a lock or younger than the cutoff stays. */
@SpringBootTest
@Transactional
class OtpRequestPurgeTest {

    @Autowired OtpRequestRepository otpRequests;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private static final String PHONE = "+919100000071";

    @Test
    @DisplayName("purges only old rows whose lock has run out")
    void purge() {
        row("old", "30 days", null);
        row("locked", "30 days", "1 hour");
        row("young", "1 day", null);

        otpRequests.deleteOlderThan(Instant.now().minus(7, ChronoUnit.DAYS));

        assertThat(jdbc.queryForList("SELECT delivery_error FROM otp_request WHERE phone = :p ORDER BY 1",
                Map.of("p", PHONE), String.class)).isEqualTo(List.of("locked", "young"));
    }

    /** {@code delivery_error} carries the row's label — any free text column would do. */
    private void row(String label, String age, String lockLeft) {
        var p = new HashMap<String, Object>();   // Map.of refuses the null lock
        p.put("p", PHONE);
        p.put("age", age);
        p.put("lock", lockLeft);
        p.put("label", label);
        jdbc.update("""
                INSERT INTO otp_request (phone, purpose, otp_hash, expires_at, created_at, locked_until, delivery_error)
                VALUES (:p, 'sign_in', 'x', now(), now() - CAST(:age AS interval),
                        now() + CAST(:lock AS interval), :label)
                """, p);
    }
}
