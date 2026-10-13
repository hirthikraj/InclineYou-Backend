package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalPlan;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** The client's plan and progress (api-contract 1.2, pp-l1 … pp-l4). Reads only; {@link PortalAccess} refuses a paused or removed client. */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalPlanController {

    private final PortalPlanService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/plan")
    public ResponseEntity<PortalPlan.Plan> plan() {
        return noStore(service.plan(phone()));
    }

    @GetMapping("/plan/history")
    public ResponseEntity<PortalPlan.PastPage> history(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.past(phone(), limit, cursor));
    }

    @GetMapping("/programs/{programId}")
    public ResponseEntity<PortalPlan.ProgramTree> program(@PathVariable UUID programId) {
        return noStore(service.program(phone(), programId));
    }

    @GetMapping("/progress")
    public ResponseEntity<PortalPlan.Progress> progress(@RequestParam(defaultValue = "28") int windowDays) {
        return noStore(service.progress(phone(), windowDays));
    }

    @GetMapping("/progress/exercises")
    public ResponseEntity<PortalPlan.ExercisePage> exercises(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.exercises(phone(), limit, cursor));
    }

    @GetMapping("/progress/exercises/{exerciseId}")
    public ResponseEntity<PortalPlan.ExerciseSeries> exercise(@PathVariable UUID exerciseId, @RequestParam(required = false) String from) {
        return noStore(service.exercise(phone(), exerciseId, from));
    }
}
