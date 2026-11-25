package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpThrottledException;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinCard;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinCodeRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinSubmitRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinSubmitted;
import com.inclineyou.inclineyou_backend.infrastructure.config.ClientAddress;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * The public join page's three calls (api-contract 1.2, jn-a1…jn-a3). No session; counted as sign-in attempts (AUTH tier).
 * The card may be cached for a minute — it is the same for everybody and the page is shared to be opened by many.
 */
@RestController
@RequestMapping("/v1/join")
@RequiredArgsConstructor
public class PublicJoinController {

    private final PublicJoinService join;
    private final OtpAbuseGuard abuse;
    private final ClientAddress clientAddress;

    @GetMapping("/{slug}")
    public ResponseEntity<JoinCard> card(@PathVariable String slug) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(join.card(slug));
    }

    @PostMapping("/{slug}/code")
    public OtpRequested code(@PathVariable String slug, @Valid @RequestBody JoinCodeRequest body, HttpServletRequest http) {
        String ip = clientAddress.of(http);
        try {
            return join.sendCode(slug, body, ip);
        } catch (OtpThrottledException e) {
            abuse.strike(ip);
            throw e;
        }
    }

    @PostMapping("/{slug}/requests")
    public ResponseEntity<JoinSubmitted> submit(@PathVariable String slug, @Valid @RequestBody JoinSubmitRequest body) {
        var done = join.submit(slug, body);
        return ResponseEntity.status("received".equals(done.result()) ? HttpStatus.CREATED : HttpStatus.OK)
                .cacheControl(CacheControl.noStore()).body(done);
    }
}
