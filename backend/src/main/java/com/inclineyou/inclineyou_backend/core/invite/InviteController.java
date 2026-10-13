package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.auth.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.OtpThrottledException;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCard;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCodeRequest;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.invite.dto.AcceptRequest;
import com.inclineyou.inclineyou_backend.core.invite.dto.AcceptedClient;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.RequestHeader;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public front door of the client portal (api-contract 1.2, Invite &amp; client sign-in). No session: the link is the secret.
 * Opening it reads only. {@code no-store}, because a card is somebody's trainer and the link's life is 14 days.
 */
@RestController
@RequestMapping("/v1/invites")
@RequiredArgsConstructor
public class InviteController {

    private final InviteCardService cards;
    private final InviteCodeService codes;
    private final InviteAcceptService accepts;
    private final OtpAbuseGuard abuse;

    /**
     * Send the code to the number on the invite. The abuse guard is the one sign-in's request route uses — same address, same
     * daily ceiling per number — so an invite is not a cheaper way to make us send a WhatsApp message.
     */
    @PostMapping("/{token}/code")
    public OtpRequested sendCode(@PathVariable String token, @Valid @RequestBody InviteCodeRequest body, HttpServletRequest http) {
        String ip = http.getRemoteAddr() == null ? "unknown" : http.getRemoteAddr();
        codes.phoneOf(token).ifPresent(phone -> abuse.beforeSend(ip, phone));
        try {
            return codes.sendCode(token, body);
        } catch (OtpThrottledException e) {
            abuse.strike(ip);
            throw e;
        }
    }

    /**
     * "Let me in". A client session is the web's revocable one, so the web header is required: a phone-shaped JWT for a client
     * does not exist, and silently minting the wrong kind of credential is worse than refusing.
     */
    @PostMapping("/{token}/accept")
    public ResponseEntity<AcceptedClient> accept(@PathVariable String token, @Valid @RequestBody AcceptRequest body,
                                                 @RequestHeader(value = AuthTokenService.CLIENT_HEADER, required = false) String client) {
        if (!AuthTokenService.WEB.equalsIgnoreCase(client)) {
            throw ApiException.validation(AuthTokenService.CLIENT_HEADER + ": web is required to accept an invite");
        }
        var done = accepts.accept(token, body);
        return ResponseEntity.status(done.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .cacheControl(CacheControl.noStore()).body(done.body());
    }

    /** 204 always: see {@link InviteCardService#decline}. */
    @PostMapping("/{token}/decline")
    public ResponseEntity<Void> decline(@PathVariable String token, @RequestBody(required = false) EmptyBody body) {
        cards.decline(token);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/{token}")
    public ResponseEntity<InviteCard> open(@PathVariable String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cards.open(token));
    }
}
