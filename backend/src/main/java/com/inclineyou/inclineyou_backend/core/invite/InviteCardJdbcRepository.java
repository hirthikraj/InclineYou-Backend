package com.inclineyou.inclineyou_backend.core.invite;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Map;

/**
 * The one read the public invite page makes: {@code invite_card(sha256(token))}.
 *
 * <p>The page has no session, so {@code client_invite} is closed to it by row-level security and this {@code SECURITY DEFINER}
 * function is the whole door. It reads and never writes, which is what lets a link be opened by something that only looks at it
 * (WhatsApp unfurls the links it is shown).
 */
@Repository
@RequiredArgsConstructor
public class InviteCardJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The function's jsonb, as text. */
    public String card(String tokenHash) {
        return jdbc.queryForObject("SELECT invite_card(:h)::text", Map.of("h", tokenHash), String.class);
    }

    /** The card for an invite the caller already holds the id of (the number proved itself, so there is no token). */
    public String cardById(java.util.UUID inviteId) {
        return jdbc.queryForObject("SELECT invite_card_by_id(:i::uuid)::text", Map.of("i", inviteId.toString()), String.class);
    }

    /** Where a live link's code goes: the invite's id and number, or empty for a link that no longer works for any reason. */
    public java.util.Optional<SendTarget> sendTarget(String tokenHash) {
        return jdbc.queryForList("SELECT invite_send_target(:h)::text AS j", Map.of("h", tokenHash), String.class).stream()
                .filter(java.util.Objects::nonNull).findFirst().map(SendTarget::parse);
    }

    /** What accept needs to know about a link in any state, or empty when the token matches nothing. */
    public java.util.Optional<AcceptTarget> acceptTarget(String tokenHash) {
        return jdbc.queryForList("SELECT invite_for_accept(:h)::text AS j", Map.of("h", tokenHash), String.class).stream()
                .filter(java.util.Objects::nonNull).findFirst().map(AcceptTarget::parse);
    }

    public record AcceptTarget(String inviteId, String clientId, String phone, String status, boolean live, boolean withAnotherTrainer,
                               String trainerName, String headline) {
        static AcceptTarget parse(String json) {
            var n = tools.jackson.databind.json.JsonMapper.builder().build().readTree(json);
            String headline = n.path("headline").isString() ? n.path("headline").asString() : null;
            return new AcceptTarget(n.path("invite_id").asString(), n.path("client_id").asString(), n.path("phone").asString(),
                    n.path("status").asString(), n.path("live").asBoolean(false), n.path("with_another_trainer").asBoolean(false),
                    n.path("trainer_name").asString(), headline);
        }
    }

    /**
     * {@code accept_client_invite()}: one transaction inside the function, idempotent, and the only thing that creates a client's
     * account. Answers its {@code result}: {@code accepted} · {@code age_requirement} · {@code unavailable} · {@code expired}.
     * Must run with the proved number as {@code app.phone} — the function refuses an invite for any other number.
     */
    public String accept(String inviteId, java.time.LocalDate dateOfBirth, String policyVersion) {
        var p = new java.util.HashMap<String, Object>();
        p.put("i", inviteId);
        p.put("dob", java.sql.Date.valueOf(dateOfBirth));
        p.put("pv", policyVersion);
        String json = jdbc.queryForObject("SELECT accept_client_invite(:i::uuid, :dob, :pv)::text", p, String.class);
        return tools.jackson.databind.json.JsonMapper.builder().build().readTree(json).path("result").asString();
    }

    /** {@code decline_client_invite()}: ends a live pending link as <em>not for me</em>. {@code declined} · {@code already} · {@code none}. */
    public String decline(String tokenHash) {
        String json = jdbc.queryForObject("SELECT decline_client_invite(:h)::text", Map.of("h", tokenHash), String.class);
        return tools.jackson.databind.json.JsonMapper.builder().build().readTree(json).path("result").asString();
    }

    /** {@code decline_client_invite_by_id()}: the same act for a number that has already signed in. Refuses any other number's id. */
    public String declineById(java.util.UUID inviteId) {
        String json = jdbc.queryForObject("SELECT decline_client_invite_by_id(:i::uuid)::text", Map.of("i", inviteId.toString()), String.class);
        return tools.jackson.databind.json.JsonMapper.builder().build().readTree(json).path("result").asString();
    }

    public record SendTarget(String inviteId, String phone) {
        static SendTarget parse(String json) {
            var n = tools.jackson.databind.json.JsonMapper.builder().build().readTree(json);
            return new SendTarget(n.path("invite_id").asString(), n.path("phone").asString());
        }
    }
}
