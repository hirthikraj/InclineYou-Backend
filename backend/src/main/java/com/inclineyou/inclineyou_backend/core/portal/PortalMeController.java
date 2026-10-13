package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalConsentRequest;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMe;
import com.inclineyou.inclineyou_backend.core.portal.dto.UpdatePortalMeRequest;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The client portal's session read (api-contract 1.2, p-a1). {@code SecurityConfig} admits a client session to {@code /v1/portal/**}
 * and nobody else; this route then answers for ANY access, because it is what draws the paused and removed walls.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalMeController {

    private final PortalMeService me;
    private final PortalProfileService profile;

    @GetMapping("/me")
    public ResponseEntity<PortalMe> me() {
        String phone = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(me.me(phone));
    }

    /** p-a4 — absent = leave, null = clear. {@code If-Match} is honoured when sent (412). Answers the new {@code myDetails}. */
    @PatchMapping("/me")
    public ResponseEntity<PortalMe.MyDetails> update(@Valid @RequestBody UpdatePortalMeRequest req,
                                                     @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        var out = profile.update(phone(), req, ifMatch);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag("\"" + out.version() + "\"").body(out);
    }

    /** p-a4 — the removed wall was seen. Open to a removed client, which is the point; later calls are 200 no-ops. */
    @PostMapping("/ack")
    public ResponseEntity<java.util.Map<String, Object>> ack(@RequestBody(required = false) EmptyBody body) {
        profile.acknowledge(phone());
        return ResponseEntity.ok(java.util.Map.of());
    }

    /** p-a5 — accept the privacy notice in force. */
    @PostMapping("/consent")
    public ResponseEntity<Void> consent(@RequestBody(required = false) PortalConsentRequest req) {
        profile.consent(phone(), req == null ? null : req.policyVersion());
        return ResponseEntity.noContent().build();
    }

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
