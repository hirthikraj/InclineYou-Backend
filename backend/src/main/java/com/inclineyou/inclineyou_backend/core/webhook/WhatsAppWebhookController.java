package com.inclineyou.inclineyou_backend.core.webhook;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * api-contract 1.2, sy-a1 — the provider tells us what happened to a message.
 *
 * <p>Public, no session: the HMAC over the raw body is the only authentication (a missing or wrong one is 401 and nothing is
 * read), and the route has its own {@code WEBHOOK} rate tier. The body is taken as bytes so the signature covers what was sent.
 */
@RestController
@RequestMapping("/v1/webhooks/whatsapp")
@RequiredArgsConstructor
public class WhatsAppWebhookController {

    private final AppProperties props;
    private final WhatsAppStatusService statuses;

    /** Registration handshake: Meta calls this once with the token typed into its console and expects the challenge back verbatim. */
    @GetMapping(produces = MediaType.TEXT_PLAIN_VALUE)
    public String verify(@RequestParam(name = "hub.mode", required = false) String mode,
                         @RequestParam(name = "hub.verify_token", required = false) String token,
                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if (!"subscribe".equals(mode) || challenge == null
                || !WhatsAppSignature.same(token, props.getOtp().getWhatsapp().getVerifyToken())
                || isBlank(props.getOtp().getWhatsapp().getVerifyToken())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "WEBHOOK_VERIFY_FAILED", "Verification failed.");
        }
        return challenge;
    }

    @PostMapping
    public Map<String, Object> receive(@RequestHeader(name = "X-Hub-Signature-256", required = false) String signature,
                                       @RequestBody byte[] body) {
        if (!WhatsAppSignature.valid(signature, body, props.getOtp().getWhatsapp().getAppSecret())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "WEBHOOK_SIGNATURE", "Signature missing or wrong.");
        }
        statuses.apply(body);
        return Map.of();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
