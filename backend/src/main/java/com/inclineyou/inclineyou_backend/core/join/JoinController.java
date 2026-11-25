package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.join.dto.ApproveJoinRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinApproved;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinLinkSettings;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinLinkUpdate;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinRequestItem;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinRequestList;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The trainer's join link and its requests (api-contract 1.2, jl-a1…jl-a5). Always the active workspace's: a trainer in two
 * workspaces has two links, because a request becomes a client in exactly one of them.
 */
@RestController
@RequiredArgsConstructor
public class JoinController {

    private final JoinLinkService links;
    private final JoinRequestService requests;

    @GetMapping("/v1/join-link")
    public JoinLinkSettings link() {
        return links.get(trainerId(), tenantId());
    }

    @PutMapping("/v1/join-link")
    public JoinLinkSettings save(@Valid @RequestBody JoinLinkUpdate body) {
        return links.save(trainerId(), tenantId(), body);
    }

    /** {@code state} is a comma list of pending, approved, declined (default pending). No-store: it is people's numbers. */
    @GetMapping("/v1/join-requests")
    public ResponseEntity<JoinRequestList> list(@RequestParam(required = false) String state) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(requests.list(trainerId(), tenantId(), state));
    }

    @PostMapping("/v1/join-requests/{id}/approve")
    public JoinApproved approve(@PathVariable UUID id, @Valid @RequestBody(required = false) ApproveJoinRequest body) {
        return requests.approve(trainerId(), tenantId(), id, body == null ? null : body.clientType());
    }

    @PostMapping("/v1/join-requests/{id}/decline")
    public JoinRequestItem decline(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        return requests.decline(trainerId(), tenantId(), id);
    }

    private static UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private static UUID tenantId() {
        return CurrentScope.require().activeTenantId();
    }
}
