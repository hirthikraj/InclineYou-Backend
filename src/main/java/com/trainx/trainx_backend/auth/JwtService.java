package com.trainx.trainx_backend.auth;

import com.trainx.trainx_backend.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class JwtService {

    private final AppProperties props;

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(
                props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generate(UUID trainerId, String phone) {
        long now = System.currentTimeMillis();
        long expiryMs = (long) props.getJwt().getExpiryMinutes() * 60 * 1000;
        return Jwts.builder()
                .subject(trainerId.toString())
                .claim("phone", phone)
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiryMs))
                .signWith(signingKey())
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public UUID extractTrainerId(String token) {
        return UUID.fromString(parse(token).getSubject());
    }
}
