package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.BulkInviteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.BulkInviteResult;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteCreated;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteItem;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteList;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The trainer's side of inviting a client to the portal (api-contract 1.2, tr-a1…tr-a4). Every route is a trainer's: the
 * caller is the session's trainer and a client that is not theirs is a 404.
 */
@RestController
@RequiredArgsConstructor
public class ClientInviteController {

    private final ClientInviteService invites;
    private final ClientInviteReadService reads;

    /**
     * Invite — or resend — one client. 201 with the one-time link; {@code no-store}, because the response is the only
     * place the raw token ever appears.
     */
    @PostMapping("/v1/clients/{id}/invites")
    public ResponseEntity<InviteCreated> invite(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(invites.invite(trainerId(), id));
    }

    /**
     * Invite several at once, one to fifty. 200 whatever the mix, one result per id in the order sent; {@code no-store}
     * for the same reason as the single form: every created item carries a raw link.
     */
    @PostMapping("/v1/client-invites")
    public ResponseEntity<BulkInviteResult> inviteMany(@RequestBody(required = false) BulkInviteRequest body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(invites.inviteMany(trainerId(), body));
    }

    /**
     * The Invitations view. {@code state} is a comma list (default {@code pending,expired}); {@code include=counts} adds the
     * five headings. Keyset-paged on {@code (created_at DESC, id DESC)}. Nothing here is a secret: no token, no hash.
     */
    @GetMapping("/v1/client-invites")
    public InviteList list(@RequestParam(required = false) String state,
                           @RequestParam(required = false) String clientId,
                           @RequestParam(required = false) String include,
                           @RequestParam(required = false) Integer limit,
                           @RequestParam(required = false) String cursor) {
        return reads.list(trainerId(), state, clientId, include, limit, cursor);
    }

    /** Withdraw an invitation. 200 with the item, also when it was already revoked or declined; 409 {@code INVITE_ACCEPTED} once it was accepted. */
    @PostMapping("/v1/client-invites/{id}/revoke")
    public InviteItem revoke(@PathVariable UUID id, @RequestBody(required = false) EmptyBody body) {
        return invites.revoke(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
