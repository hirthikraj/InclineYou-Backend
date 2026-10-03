package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpDelivery;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** api-contract, Sign in: the code, its delivery status, and the code checked. */
@RestController
@RequestMapping("/v1/auth/otp")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/request")
    public OtpRequested requestOtp(@RequestBody SendOtpRequest body) {
        return authService.requestOtp(body);
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
