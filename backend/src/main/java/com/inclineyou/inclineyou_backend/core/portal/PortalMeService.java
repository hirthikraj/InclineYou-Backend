package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.ClientSignInLookup;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMe;
import com.inclineyou.inclineyou_backend.core.trainer.SocialLink;
import com.inclineyou.inclineyou_backend.core.trainer.YouTubeLink;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * {@code GET /v1/portal/me} — the portal shell's one read, and the only one a paused or removed client can make (api-contract 1.2).
 *
 * <p>The wall comes from a function, because a client who is paused or removed has an empty lens; the counts come through the lens,
 * which is the evidence the lens works, and are zero where there is no live arrangement to count. Every date the wall draws is
 * as the database holds it — nothing is derived here.
 */
@Service
@RequiredArgsConstructor
public class PortalMeService {

    private final PortalJdbcRepository repo;
    private final ClientSignInLookup lookup;
    private final AppProperties props;

    public PortalMe me(String phone) {
        JsonNode wall = repo.wall(phone).orElse(null);
        String current = props.getPrivacy().getPolicyVersion();
        var push = new PortalMe.Push(props.getPush().getVapidPublicKey().isBlank() ? null : props.getPush().getVapidPublicKey());
        if (wall == null) {
            // An account that is a client's in name only (every arrangement erased): the wall for somebody who has left.
            return new PortalMe(phone, "removed", null, null, null, null, null, null, false, 0, 0, lookup.invitesFor(phone),
                    new PortalMe.Policy(repo.acceptedPolicy(phone), current), push);
        }
        String access = wall.path("access").asString();
        boolean active = "active".equals(access);
        UUID clientId = UUID.fromString(wall.path("client_id").asString());
        JsonNode t = wall.path("trainer");
        JsonNode d = wall.path("my_details");
        var trainer = "removed".equals(access)
                ? new PortalMe.Trainer(text(t, "name"), null, null, null, null, null, null, null, null, null)
                : new PortalMe.Trainer(text(t, "name"), text(t, "headline"), text(t, "bio"), YouTubeLink.idOf(text(t, "intro_video_url")),
                        list(t.path("certifications")), list(t.path("specialities")), list(t.path("languages")),
                        SocialLink.handleOf(text(t, "instagram_url")), SocialLink.handleOf(text(t, "youtube_url")), whatsapp(text(t, "phone")));
        var mine = d.isObject() ? new PortalMe.MyDetails(text(d, "name"), text(d, "goal"), d.path("height_cm").isNumber() ? d.path("height_cm").asDouble() : null,
                text(d, "timezone"), text(d, "activity_level"), text(d, "date_of_birth"), text(d, "phone"), String.valueOf(d.path("version").asLong())) : null;
        return new PortalMe(text(d, "phone") != null ? text(d, "phone") : phone, access,
                text(wall, "paused_until"), wall.path("removed_at").isNumber() ? wall.path("removed_at").asLong() : null, text(wall, "removed_by"),
                wall.path("acknowledged_at").isNumber() ? wall.path("acknowledged_at").asLong() : null, trainer, mine,
                active && repo.moneyVisible(clientId), active ? repo.unreadNotices(clientId) : 0, active ? repo.openAssessments(clientId) : 0,
                "removed".equals(access) ? lookup.invitesFor(phone) : List.of(),
                new PortalMe.Policy(repo.acceptedPolicy(phone), current), push);
    }

    /** {@code https://wa.me/919841022119} — digits only, no text: the web appends the draft for whatever is being asked about. */
    private static String whatsapp(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        return digits.isEmpty() ? null : "https://wa.me/" + digits;
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
