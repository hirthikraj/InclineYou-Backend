package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.session.dto.SessionRow;
import com.inclineyou.inclineyou_backend.core.sessionlog.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Log session (api-contract 1.1) — the HTTP contract only. The log IS the scheduled session, so every route hangs off
 * {@code /v1/sessions/{id}}; there is no second id. STANDARD tier: a set tap is a small request and the console is one
 * read, so a trainer's whole session sits well inside the ceiling.
 */
@RestController
@RequestMapping("/v1/sessions")
@RequiredArgsConstructor
public class SessionLogController {

    private final SessionLogReadService reads;
    private final SessionStartService starts;
    private final SetLogService sets;
    private final LogExerciseService exercises;

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /** Who can be logged right now — open logs, today's booked sessions, every active client. */
    @GetMapping("/pick")
    public PickResponse pick() {
        return reads.pick(trainerId());
    }

    /** Everything the console draws, in one read. */
    @GetMapping("/{id}/log")
    public SessionLog log(@PathVariable UUID id) {
        return reads.log(trainerId(), id);
    }

    /** Open the log and lay the plan down. Idempotent. */
    @PostMapping("/{id}/start")
    public SessionLog start(@PathVariable UUID id, @RequestBody(required = false) StartRequest req) {
        return starts.start(trainerId(), id, req);
    }

    /** Log someone with no booking: book now and start, in one write. 201, or 200 on a replayed id. */
    @PostMapping("/walk-in")
    public ResponseEntity<SessionLog> walkIn(@RequestBody(required = false) WalkInRequest req) {
        return created(starts.walkIn(trainerId(), req));
    }

    /** Close the log. Idempotent; does not mark the session done or charge the pack. */
    @PostMapping("/{id}/end")
    public SessionRow end(@PathVariable UUID id, @RequestBody(required = false) EndRequest req) {
        return starts.end(trainerId(), id, req);
    }

    /** Log a set, correct one, or skip a planned one. A body {@code Map}: a key's presence is the contract. */
    @PatchMapping("/{id}/sets/{setId}")
    public SetWrite patchSet(@PathVariable UUID id, @PathVariable UUID setId,
                             @RequestBody(required = false) Map<String, Object> body) {
        return sets.patch(trainerId(), id, setId, body);
    }

    @PostMapping("/{id}/exercises/{sxId}/sets")
    public ResponseEntity<SetAdded> addSet(@PathVariable UUID id, @PathVariable UUID sxId,
                                           @RequestBody(required = false) AddSetRequest req) {
        return created(sets.add(trainerId(), id, sxId, req));
    }

    /** Only an extra set; a planned one is skipped with PATCH {done: false}. */
    @DeleteMapping("/{id}/sets/{setId}")
    public SetDeleted deleteSet(@PathVariable UUID id, @PathVariable UUID setId) {
        return sets.delete(trainerId(), id, setId);
    }

    @PostMapping("/{id}/exercises")
    public ResponseEntity<ExerciseEntry> addExercise(@PathVariable UUID id,
                                                     @RequestBody(required = false) AddExerciseRequest req) {
        return created(exercises.add(trainerId(), id, req));
    }

    /** Remove · undo · note · rest. A body {@code Map}, like a set's. */
    @PatchMapping("/{id}/exercises/{sxId}")
    public ExerciseEntry patchExercise(@PathVariable UUID id, @PathVariable UUID sxId,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return exercises.patch(trainerId(), id, sxId, body);
    }

    @PostMapping("/{id}/exercises/{sxId}/swap")
    public ExerciseEntry swap(@PathVariable UUID id, @PathVariable UUID sxId,
                              @RequestBody(required = false) SwapRequest req) {
        return exercises.swap(trainerId(), id, sxId, req);
    }

    private static <T> ResponseEntity<T> created(Created<T> c) {
        return ResponseEntity.status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.body());
    }
}
