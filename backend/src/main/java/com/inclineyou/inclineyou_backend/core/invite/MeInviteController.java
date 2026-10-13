package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.auth.ClientSignInLookup;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCard;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.SessionTokenIssuer;
import com.inclineyou.inclineyou_backend.core.invite.dto.AcceptedClient;
import com.inclineyou.inclineyou_backend.core.invite.dto.MeAcceptRequest;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The invites waiting for a number that has ALREADY proved itself (api-contract 1.2, inv-a6) — the login page found one or more
 * for it (D-16), so there is no token and no second code. Two callers qualify: a {@code pending} session (a number with no account)
 * and a {@code client} session whose access is {@code removed} (somebody who left one trainer and has been invited by another).
 * {@code SecurityConfig} keeps every other role out; a live client is refused here, where their access can be read.
 *
 * <p>Both answers come from functions that answer only for the number in {@code app.phone}, which the session supplies — so a
 * caller can see their own number's invites and nobody else's, whatever id they ask for.
 */
@RestController
@RequestMapping("/v1/me/invites")
@RequiredArgsConstructor
public class MeInviteController {

    private final ClientSignInLookup lookup;
    private final InviteCardService cards;
    private final InviteAcceptService accepts;
    private final InviteCardJdbcRepository repo;
    private final AuthTokenService tokens;

    @GetMapping
    public ResponseEntity<Items<com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse.PendingInvite>> list() {
        String phone = eligiblePhone();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Items.of(lookup.invitesFor(phone)));
    }

    @GetMapping("/{inviteId}")
    public ResponseEntity<InviteCard> card(@PathVariable String inviteId) {
        String phone = eligiblePhone();
        // Belt and braces: the database function also answers `expired` for an id that is not for this number, but that guard is
        // keyed on the request role, so the answer here does not lean on it alone — an id is shown only if it is one of the
        // invites the number's own list holds, which is filtered by number in SQL for every role.
        boolean mine = lookup.invitesFor(phone).stream().anyMatch(i -> i.inviteId().equalsIgnoreCase(inviteId));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mine ? cards.byId(inviteId) : InviteCard.expired());
    }

    /**
     * "Let me in", from a session that already proved its number (inv-a7). From a {@code pending} session or from a removed client
     * joining somebody new; a client who is with a trainer already is a 409. The answer is a client session, and the credential this
     * call came in on is retired in the same breath when it was a revocable one (a pending JWT simply lapses in minutes).
     */
    @PostMapping("/{inviteId}/accept")
    public ResponseEntity<AcceptedClient> accept(@PathVariable String inviteId, @Valid @RequestBody MeAcceptRequest body,
                                                 @RequestHeader(value = AuthTokenService.CLIENT_HEADER, required = false) String client,
                                                 HttpServletRequest http) {
        if (!AuthTokenService.WEB.equalsIgnoreCase(client)) {
            throw ApiException.validation(AuthTokenService.CLIENT_HEADER + ": web is required to accept an invite");
        }
        String phone = signedInNumber();
        if (isClient() && !lookupAllowsInvites(phone)) {
            throw ApiException.conflict("ALREADY_WITH_A_TRAINER", "You’re already with a trainer. Leave them first, then accept this invite.");
        }
        var mine = lookup.invitesFor(phone).stream().filter(i -> i.inviteId().equalsIgnoreCase(inviteId)).findFirst().orElse(null);
        if (mine == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "INVITE_UNAVAILABLE",
                    "This invite isn’t available any more. Ask your trainer to send it again.");
        }
        var done = accepts.acceptForSignedIn(phone, mine, body.dateOfBirth(), body.policyVersion());
        Object raw = http.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
        if (raw instanceof String s && SessionTokenIssuer.KIND.equals(tokens.kindOf(s))) tokens.revoke(s);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(done.body());
    }

    /** 204 always, like the link's: an id that is not this number's is quietly nothing. */
    @PostMapping("/{inviteId}/decline")
    public ResponseEntity<Void> decline(@PathVariable String inviteId, @RequestBody(required = false) EmptyBody body) {
        String phone = eligiblePhone();
        // Only an invite in this number's own list can be declined, checked here as well as by the database function: that
        // function's phone guard is keyed on the request role, so the answer must not lean on it alone (see `card`).
        boolean mine = lookup.invitesFor(phone).stream().anyMatch(i -> i.inviteId().equalsIgnoreCase(inviteId));
        if (mine) repo.declineById(java.util.UUID.fromString(inviteId));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private static String signedInNumber() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static boolean isClient() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().anyMatch(a -> "ROLE_CLIENT".equals(a.getAuthority()));
    }

    private boolean lookupAllowsInvites(String phone) {
        var state = lookup.stateOf(phone);
        return state == null || "removed".equals(state.access());
    }

    /** The signed-in number — only for a {@code pending} session or a {@code removed} client; anybody else is a 403. */
    private String eligiblePhone() {
        String phone = signedInNumber();
        if (isClient() && !lookupAllowsInvites(phone)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                    "You’re with a trainer already. Leave them first to accept another invite.");
        }
        return phone;
    }
}
