package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.TrainerResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.UpdateTrainerRequest;
import jakarta.validation.Valid;
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
    public TrainerResponse me() {
        return service.get(trainerId());
    }

    @PatchMapping("/me")
    public TrainerResponse update(@Valid @RequestBody UpdateTrainerRequest req) {
        return service.update(trainerId(), req);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
