package com.trainx.trainx_backend.trainer;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/trainers")
@RequiredArgsConstructor
public class TrainerController {

    private final TrainerService service;

    @GetMapping("/me")
    public TrainerService.TrainerResponse me() {
        return service.get(trainerId());
    }

    @PatchMapping("/me")
    public TrainerService.TrainerResponse update(@RequestBody TrainerService.UpdateRequest req) {
        return service.update(trainerId(), req);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
