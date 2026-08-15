package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
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

    /** The role a token was minted for. Absent on tokens issued before V14. */
    public static final String ROLE_TRAINER = "trainer";
    public static final String ROLE_CLIENT = "client";
    /** Verified the number, and it is on nobody's roster yet — screen 7a. */
    public static final String ROLE_PENDING = "pending";
    /**
     * Proved the number, and has a membership question outstanding — an invite
     * to answer, or a removal to acknowledge.
     *
     * Good for exactly those three calls and nothing else. It is minted for
     * somebody who has been named by a trainer but has not agreed to anything,
     * so it must not open a sync scope: until they accept, there is a person in
     * this database who has never heard of us, and handing their training
     * history to an unanswered invite would be the disclosure the invite exists
     * to ask permission for.
     */
    public static final String ROLE_INVITED = "invited";

    public String generate(UUID trainerId, String phone) {
        return build(trainerId.toString(), phone, ROLE_TRAINER);
    }

    /**
     * A client token's subject is the PHONE, not a client id — and deliberately.
     *
     * The same person can be on two trainers' rosters, which is two client rows
     * and one human being. Binding the token to the phone lets one sign-in cover
     * both memberships, and makes the authorisation check on every client
     * request the same single question: is this client row's phone the phone
     * that proved it owns this number. A client id in the subject would have to
     * be re-minted to switch trainers, and a token per membership is a token to
     * get wrong.
     */
    public String generateClient(String phone) {
        return build(phone, phone, ROLE_CLIENT);
    }

    /** For 7a — enough to claim a trainer account with, and nothing else. */
    public String generatePending(String phone) {
        return build(phone, phone, ROLE_PENDING);
    }

    /**
     * For the invite and removal screens — enough to answer a membership
     * question with, and nothing else. Subject is the phone, like the client
     * token, because the membership being answered is identified by it.
     */
    public String generateInvited(String phone) {
        return build(phone, phone, ROLE_INVITED);
    }

    private String build(String subject, String phone, String role) {
        long now = System.currentTimeMillis();
        long expiryMs = (long) props.getJwt().getExpiryMinutes() * 60 * 1000;
        return Jwts.builder()
                .subject(subject)
                .claim("phone", phone)
                .claim("role", role)
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiryMs))
                .signWith(signingKey())
                .compact();
    }

    /**
     * A token with no `role` claim is a trainer token.
     *
     * Every token in the wild before V14 was one, and they stay valid until they
     * expire. Reading absence as trainer is the only choice that doesn't sign
     * everybody out on deploy.
     */
    public String extractRole(Claims claims) {
        Object role = claims.get("role");
        return role == null ? ROLE_TRAINER : role.toString();
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
