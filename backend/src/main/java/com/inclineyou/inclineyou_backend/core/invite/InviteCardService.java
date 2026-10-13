package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.client.InviteToken;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCard;
import com.inclineyou.inclineyou_backend.core.trainer.SocialLink;
import com.inclineyou.inclineyou_backend.core.trainer.YouTubeLink;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * Opening an invite link (api-contract 1.2, inv-a1): the trainer's card, read-only.
 *
 * <p><b>Reads only, and says the same thing for every dead link.</b> A token that is malformed, unknown, expired, revoked,
 * replaced or declined answers {@code expired} with a 200, never a 404, so nothing here can be used to find out which tokens
 * exist. A malformed one never reaches the database at all.
 */
@Service
@RequiredArgsConstructor
public class InviteCardService {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final InviteCardJdbcRepository repo;
    private final AppProperties props;

    public InviteCard open(String token) {
        if (!InviteToken.wellFormed(token)) return InviteCard.expired();
        return fromJson(repo.card(InviteToken.hash(token)));
    }

    /**
     * The same card for a number that has already proved itself and so holds no token (api-contract 1.2, inv-a6). The database
     * answers {@code expired} for an id that is not for the signed-in number, exactly as for one that does not exist, so an id
     * teaches nothing; a malformed one never reaches it.
     */
    public InviteCard byId(String rawId) {
        java.util.UUID id;
        try {
            id = java.util.UUID.fromString(rawId);
        } catch (IllegalArgumentException e) {
            return InviteCard.expired();
        }
        return fromJson(repo.cardById(id));
    }

    private InviteCard fromJson(String json) {
        JsonNode card;
        try {
            card = JSON.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("invite_card returned something unreadable", e);
        }
        return switch (card.path("state").asString("expired")) {
            case "valid" -> valid(card);
            case "used" -> InviteCard.used();
            default -> InviteCard.expired();
        };
    }

    /**
     * <em>Not for me</em> (inv-a4). Needs no code: declining proves nothing and grants nothing, and the link is already the
     * bearer secret, so the worst a stranger holding it can do is ask the trainer to send another. Idempotent, and an unknown,
     * malformed or dead link is the same quiet success — a guess learns nothing.
     */
    public void decline(String token) {
        if (!InviteToken.wellFormed(token)) return;
        repo.decline(InviteToken.hash(token));
    }

    private InviteCard valid(JsonNode card) {
        JsonNode t = card.path("trainer");
        var trainer = new InviteCard.Trainer(
                text(t, "name"), text(t, "headline"), text(t, "bio"),
                YouTubeLink.idOf(text(t, "intro_video_url")),
                list(t.path("certifications")), list(t.path("specialities")), list(t.path("languages")),
                SocialLink.handleOf(text(t, "instagram_url")), SocialLink.handleOf(text(t, "youtube_url")));
        return new InviteCard("valid", text(card, "invite_id"), text(card, "phone_masked"),
                card.path("expires_at").isNumber() ? card.path("expires_at").asLong() : null, trainer,
                props.getPrivacy().getPolicyVersion(), props.getPrivacy().getInviteSummary());
    }

    private static String text(JsonNode n, String key) {
        JsonNode v = n.path(key);
        return v.isString() && !v.asString().isBlank() ? v.asString() : null;
    }

    private static List<String> list(JsonNode n) {
        var out = new ArrayList<String>();
        if (n.isArray()) n.forEach(e -> { if (e.isString()) out.add(e.asString()); });
        return out;
    }
}
