package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.ClientSignInLookup;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Whether the signed-in client may use the portal, and which client row it is (api-contract 1.2).
 *
 * <p>Every portal route except {@code GET /v1/portal/me} needs a LIVE arrangement. The database lens already gives a paused or removed
 * client an empty list of ids, so they could never read anything — but empty data is a lie ("you have no sessions"), and the honest
 * answer is a refusal that says which wall they are on: {@code 403 PORTAL_PAUSED} or {@code 403 PORTAL_REMOVED}, which the web turns
 * into the wall. The id comes from the lens, never from the request: nothing in the portal is addressed by a client id.
 */
@Component
@RequiredArgsConstructor
public class PortalAccess {

    private final ClientSignInLookup lookup;

    /** The one live client row of the signed-in number. */
    public UUID clientId(String phone) {
        var ids = TenantContext.current().clientIds();
        if (!ids.isEmpty()) return ids.getFirst();
        var state = lookup.stateOf(phone);
        if (state != null && "paused".equals(state.access())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "PORTAL_PAUSED", "Your training is on hold. Talk to your trainer to pick it up again.");
        }
        throw new ApiException(HttpStatus.FORBIDDEN, "PORTAL_REMOVED", "This arrangement has ended.");
    }
}
