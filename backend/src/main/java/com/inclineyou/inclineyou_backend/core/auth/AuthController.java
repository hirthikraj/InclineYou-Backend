package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpDelivery;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
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

    @PostMapping("/request")
    public OtpRequested requestOtp(@RequestBody SendOtpRequest body, HttpServletRequest http) {
        // Same address the rate-limit filter keys on: behind a proxy that is FORWARD_HEADERS=framework's job.
        String ip = http.getRemoteAddr() == null ? "unknown" : http.getRemoteAddr();
        String phone = body == null ? null : body.phone();
        boolean wellFormed = phone != null && phone.matches(SendOtpRequest.PHONE_PATTERN);
        // A malformed number sends nothing, so it is the service's 400 and no business of the guard's.
        if (wellFormed) abuse.beforeSend(ip, phone);
        try {
            return authService.requestOtp(body);
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
