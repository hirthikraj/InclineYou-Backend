package com.inclineyou.inclineyou_backend.progress;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ProgressController {

    private final SetHistoryService history;

    /** api-contract 1.1 Client file — every completed set, the input to Progress and the report. */
    @GetMapping("/v1/clients/{clientId}/set-history")
    public SetHistoryService.History setHistory(@PathVariable UUID clientId,
                                                @RequestParam(required = false) String from,
                                                @RequestParam(required = false) String exerciseId,
                                                @RequestParam(required = false) Integer limit,
                                                @RequestParam(required = false) String cursor) {
        return history.list(trainerId(), clientId, from, exerciseId, limit, cursor);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
