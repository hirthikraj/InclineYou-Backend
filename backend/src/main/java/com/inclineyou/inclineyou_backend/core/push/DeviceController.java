package com.inclineyou.inclineyou_backend.core.push;

import com.inclineyou.inclineyou_backend.core.push.dto.RegisterTokenBody;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Device push-token registration. The app posts its native FCM token here after every sign-in and on every token
 * refresh.
 */
@RestController
@RequestMapping("/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService devices;

    @PostMapping("/token")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void register(@Valid @RequestBody RegisterTokenBody body) {
        devices.register(currentTrainerId(), body);
    }

    @DeleteMapping("/token")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unregister() {
        devices.unregister(currentTrainerId());
    }

    private UUID currentTrainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
