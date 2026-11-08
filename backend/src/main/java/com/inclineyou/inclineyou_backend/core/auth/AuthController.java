package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.otp.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpThrottledException;
import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpDelivery;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
import com.inclineyou.inclineyou_backend.infrastructure.config.ClientAddress;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** api-contract, Sign in: the code, its delivery status, and the code checked. */
@RestController
@RequestMapping("/v1/auth/otp")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final OtpAbuseGuard abuse;
    private final ClientAddress clientAddress;

    @PostMapping("/request")
    public OtpRequested requestOtp(@RequestBody SendOtpRequest body, HttpServletRequest http) {
        // The browser's address, not the Next server's — the same one the rate-limit filter keys on.
        String ip = clientAddress.of(http);
        String phone = body == null ? null : body.phone();
        boolean wellFormed = phone != null && phone.matches(SendOtpRequest.PHONE_PATTERN);
        // A malformed number sends nothing, so it is the service's 400 and no business of the guard's.
        OtpAbuseGuard.SignInAdmission admission = wellFormed ? abuse.beforeSignIn(ip, phone) : null;
        try {
            return authService.requestOtp(body, admission);
        } catch (OtpThrottledException e) {
            abuse.strike(ip);
            throw e;
        }
    }

    @GetMapping("/requests/{requestId}")
    public OtpDelivery delivery(@PathVariable String requestId) {
        return authService.deliveryOf(requestId);
    }

    @PostMapping("/verify")
    public AuthResponse verifyOtp(@Valid @RequestBody VerifyOtpRequest body) {
        return authService.verifyOtp(body);
    }
}
