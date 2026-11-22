package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMe;
import com.inclineyou.inclineyou_backend.core.portal.dto.UpdatePortalMeRequest;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.UUID;

/**
 * What a client changes about themselves (api-contract 1.2, p-a4 and p-a5): their own details, the "I have seen it" on a removed
 * arrangement, and the privacy notice in force.
 *
 * <p>The details are written through the client's own lens as the request role, so the database's column guard is the second wall
 * behind the five fields this record allows. Acknowledging and consenting go through functions (V22), because a removed client has an
 * empty lens and neither the notice's pair nor {@code accepted_policy_version} is a column a client may write.
 */
@Service
@RequiredArgsConstructor
public class PortalProfileService {

    private final PortalJdbcRepository repo;
    private final PortalAccess access;
    private final AppProperties props;

    @Transactional
    public PortalMe.MyDetails update(String phone, UpdatePortalMeRequest req, String ifMatch) {
        UUID clientId = access.clientId(phone);
        String version = repo.lockVersion(clientId).orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "PORTAL_REMOVED", "This arrangement has ended."));
        IfMatch.check(ifMatch, version, "Your details changed since you opened them. Reload and try again.");
        var current = repo.details(clientId).orElseThrow();
        if (req.isEmpty()) return current;

        // Only what differs is written (21 Nov 2026): a save with nothing changed used to write anyway, so the version moved
        // and the client's other tab met a 412 on its next save for no change at all.
        var set = new LinkedHashMap<String, Object>();
        if (req.name() != null && !java.util.Objects.equals(req.name().value(), current.name())) set.put("name", req.name().value());
        if (req.goal() != null && !java.util.Objects.equals(blankToNull(req.goal().value()), blankToNull(current.goal()))) set.put("goal", req.goal().value());
        if (req.heightCm() != null && !sameHeight(req.heightCm().value(), current.heightCm())) set.put("height_cm", req.heightCm().value());
        if (req.timezone() != null) {
            String tz = zone(req.timezone().value());
            if (!tz.equals(current.timezone())) set.put("timezone", tz);
        }
        if (req.activityLevel() != null && !java.util.Objects.equals(req.activityLevel().value(), current.activityLevel())) {
            set.put("activity_level", req.activityLevel().value());
        }
        if (req.gender() != null && !java.util.Objects.equals(req.gender().value(), current.gender())) {
            set.put("gender", req.gender().value());
        }
        if (set.isEmpty()) return current;
        repo.updateDetails(clientId, set);
        return repo.details(clientId).orElseThrow();
    }

    /** Idempotent: the first call after removal stamps the date, later ones (and a call from anyone who was not removed) change nothing. */
    @Transactional
    public void acknowledge(String phone) {
        repo.ackRemoved(phone);
    }

    /**
     * Accepting the notice in force. Any other version is {@code CONSENT_REQUIRED}: the screen was stale. Needs a live arrangement, like
     * every route but {@code /me}.
     */
    @Transactional
    public void consent(String phone, String policyVersion) {
        access.clientId(phone);
        String inForce = props.getPrivacy().getPolicyVersion();
        if (policyVersion == null || !policyVersion.strip().equals(inForce)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONSENT_REQUIRED",
                    "policyVersion: the privacy notice in force is " + inForce + ". Reload the notice and accept that one.");
        }
        repo.acceptPolicy(phone, inForce);
    }

    /** The details read answers a blank text as null, so a blank sent is compared as null. */
    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    private static boolean sameHeight(java.math.BigDecimal sent, Double stored) {
        if (sent == null || stored == null) return sent == null && stored == null;
        return sent.compareTo(java.math.BigDecimal.valueOf(stored)) == 0;
    }

    private static String zone(String id) {
        if (!ZoneId.getAvailableZoneIds().contains(id)) throw ApiException.validation("timezone: not a time zone, such as Asia/Kolkata");
        return id;
    }
}
