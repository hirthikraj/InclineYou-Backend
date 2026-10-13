package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalWorkout;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalWorkoutRequests;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.AddSetRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * The client's workout (api-contract 1.2, pw-* and pp-l6). {@code SecurityConfig} admits a client session to {@code /v1/portal/**};
 * {@link PortalAccess} then refuses a paused or removed client with the wall's own code. STANDARD tier: a set tap is a small request.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalWorkoutController {

    private final PortalWorkoutService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/workouts/{workoutId}")
    public ResponseEntity<PortalWorkout.Preview> preview(@PathVariable UUID workoutId) {
        return noStore(service.preview(phone(), workoutId));
    }

    @PostMapping("/sessions")
    public ResponseEntity<PortalWorkout.Log> start(@Valid @RequestBody PortalWorkoutRequests.Start req) {
        var s = service.start(phone(), req);
        return ResponseEntity.status(s.created() ? HttpStatus.CREATED : HttpStatus.OK).cacheControl(CacheControl.noStore()).body(s.log());
    }

    @GetMapping("/sessions")
    public ResponseEntity<PortalWorkout.ListPage> list(@RequestParam(required = false) String state, @RequestParam(defaultValue = "20") int limit,
                                                       @RequestParam(required = false) String cursor) {
        return noStore(service.list(phone(), state, limit, cursor));
    }

    @GetMapping("/sessions/{id}/log")
    public ResponseEntity<PortalWorkout.Log> log(@PathVariable UUID id) {
        return noStore(service.log(phone(), id));
    }

    /** A body {@code Map}, like the trainer's: a key's presence is the contract, and the service validates it. */
    @PatchMapping("/sessions/{id}/sets/{setId}")
    public ResponseEntity<PortalWorkout.SetAnswer> patchSet(@PathVariable UUID id, @PathVariable UUID setId,
                                                            @RequestBody(required = false) Map<String, Object> body) {
        return noStore(service.patchSet(phone(), id, setId, body));
    }

    @PostMapping("/sessions/{id}/exercises/{sxId}/sets")
    public ResponseEntity<PortalWorkout.SetAdded> addSet(@PathVariable UUID id, @PathVariable UUID sxId, @RequestBody(required = false) AddSetRequest req) {
        var a = service.addSet(phone(), id, sxId, req);
        return ResponseEntity.status(a.created() ? HttpStatus.CREATED : HttpStatus.OK).cacheControl(CacheControl.noStore()).body(a.body());
    }

    @PatchMapping("/sessions/{id}")
    public ResponseEntity<PortalWorkout.SessionHead> pause(@PathVariable UUID id, @Valid @RequestBody PortalWorkoutRequests.Pause req) {
        return noStore(service.pause(phone(), id, req));
    }

    @PostMapping("/sessions/{id}/exercises/{sxId}/swap")
    public ResponseEntity<PortalWorkout.Swapped> swap(@PathVariable UUID id, @PathVariable UUID sxId, @Valid @RequestBody PortalWorkoutRequests.Swap req) {
        return noStore(service.swap(phone(), id, sxId, req));
    }

    @GetMapping("/exercises/{exerciseId}/alternatives")
    public ResponseEntity<Items<PortalWorkout.LibraryAlt>> alternatives(@PathVariable UUID exerciseId, @RequestParam(defaultValue = "8") int limit,
                                                                 @RequestParam(required = false) UUID sessionId) {
        return noStore(Items.of(service.alternatives(phone(), exerciseId, sessionId, limit)));
    }

    @PostMapping("/sessions/{id}/finish")
    public ResponseEntity<PortalWorkout.Finished> finish(@PathVariable UUID id, @Valid @RequestBody(required = false) PortalWorkoutRequests.Finish req) {
        return noStore(service.finish(phone(), id, req));
    }

    @PutMapping("/sessions/{id}/feedback")
    public ResponseEntity<PortalWorkout.Feedback> feedback(@PathVariable UUID id, @Valid @RequestBody PortalWorkoutRequests.Feedback req) {
        return noStore(service.feedback(phone(), id, req));
    }
}
