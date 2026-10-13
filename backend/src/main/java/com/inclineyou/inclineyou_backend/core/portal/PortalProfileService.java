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
        if (req.isEmpty()) return repo.details(clientId).orElseThrow();

        var set = new LinkedHashMap<String, Object>();
        if (req.name() != null) set.put("name", req.name().value());
        if (req.goal() != null) set.put("goal", req.goal().value());
        if (req.heightCm() != null) set.put("height_cm", req.heightCm().value());
        if (req.timezone() != null) set.put("timezone", zone(req.timezone().value()));
        if (req.activityLevel() != null) set.put("activity_level", req.activityLevel().value());
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

    private static String zone(String id) {
        if (!ZoneId.getAvailableZoneIds().contains(id)) throw ApiException.validation("timezone: not a time zone, such as Asia/Kolkata");
        return id;
    }
}
