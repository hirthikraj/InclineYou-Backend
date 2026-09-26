package com.inclineyou.inclineyou_backend.portal;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Module 11 · the client portal, {@code /v1/me/*}. {@code ROLE_CLIENT} only
 * (`SecurityConfig`). Every route takes the optional {@code ?clientId=} the web
 * appends from its roster cookie and resolves it through {@link PortalScope} —
 * reads and writes alike. Timestamps are epoch ms, except on the assessment
 * routes, which are ISO like the trainer's side.
 */
@RestController
@RequestMapping("/v1/me")
@RequiredArgsConstructor
public class PortalController {

    private final PortalScope scope;
    private final PortalReadService reads;
    private final PortalWorkoutService workouts;
    private final PortalClientWriteService writes;
    private final PortalPrefsService prefs;
    private final PortalAccountService account;

    @GetMapping
    public PortalReadService.MeResponse me(@RequestParam(required = false) String clientId) {
        return reads.me(caller(clientId));
    }

    @GetMapping("/sessions")
    public List<PortalReadService.Session> sessions(@RequestParam(required = false) String clientId,
                                                    @RequestParam(required = false) Long from,
                                                    @RequestParam(required = false) Long to) {
        return reads.sessions(caller(clientId), from, to);
    }

    /** The live plan, or a JSON {@code null} (200, not 404) when none is assigned. */
    @GetMapping("/program")
    public ResponseEntity<?> program(@RequestParam(required = false) String clientId) {
        var p = reads.program(caller(clientId));
        // A literal JSON null, not an empty body: the web parses the response, and "" is not JSON.
        return p == null
                ? ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body("null")
                : ResponseEntity.ok(p);
    }

    @GetMapping("/programs")
    public List<PortalReadService.ProgramSummary> programs(@RequestParam(required = false) String clientId) {
        return reads.programs(caller(clientId));
    }

    @GetMapping("/programs/{id}")
    public PortalReadService.Program programById(@PathVariable UUID id, @RequestParam(required = false) String clientId) {
        return reads.programById(caller(clientId), id);
    }

    @GetMapping("/workouts")
    public List<PortalReadService.WorkoutSummary> workouts(@RequestParam(required = false) String clientId,
                                                           @RequestParam(required = false) Integer limit) {
        return reads.workouts(caller(clientId), limit);
    }

    @GetMapping("/workouts/{id}")
    public PortalReadService.Workout workout(@PathVariable UUID id, @RequestParam(required = false) String clientId) {
        return reads.workout(caller(clientId), id);
    }

    @GetMapping("/sets")
    public List<PortalReadService.LoggedSet> sets(@RequestParam(required = false) String clientId) {
        return reads.sets(caller(clientId));
    }

    @GetMapping("/exercises")
    public List<PortalReadService.Exercise> exercises(@RequestParam(required = false) String clientId,
                                                      @RequestParam(required = false) String ids) {
        return reads.exercisesByIds(caller(clientId), ids);
    }

    @GetMapping("/metrics")
    public List<PortalReadService.Metric> metrics(@RequestParam(required = false) String clientId) {
        return reads.metrics(caller(clientId));
    }

    @GetMapping("/packages")
    public List<PortalReadService.Package> packages(@RequestParam(required = false) String clientId) {
        return reads.packages(caller(clientId));
    }

    @GetMapping("/payments")
    public List<PortalReadService.Payment> payments(@RequestParam(required = false) String clientId) {
        return reads.payments(caller(clientId));
    }

    @GetMapping("/messages")
    public List<PortalReadService.Message> messages(@RequestParam(required = false) String clientId) {
        return reads.messages(caller(clientId));
    }

    @GetMapping("/milestones")
    public List<PortalReadService.Milestone> milestones(@RequestParam(required = false) String clientId) {
        return reads.milestones(caller(clientId));
    }

    @GetMapping("/assessments")
    public List<PortalReadService.CheckIn> assessments(@RequestParam(required = false) String clientId) {
        return reads.assessments(caller(clientId));
    }

    @GetMapping("/assessments/{id}")
    public PortalReadService.CheckInDetail assessment(@PathVariable UUID id, @RequestParam(required = false) String clientId) {
        return reads.assessment(caller(clientId), id);
    }

    /* ── 11b · logging a workout ───────────────────────────────────────── */

    /** 201 with a new log, or 200 with the open one it resumed. */
    @PostMapping("/workouts")
    public ResponseEntity<PortalReadService.Workout> startWorkout(
            @RequestParam(required = false) String clientId,
            @RequestBody(required = false) PortalWorkoutService.StartRequest req) {
        var started = workouts.start(caller(clientId), req);
        return ResponseEntity.status(started.created() ? 201 : 200).body(started.workout());
    }

    /** 201 on a new set, 200 when the same set number was saved again. */
    @PostMapping("/workouts/{id}/sets")
    public ResponseEntity<PortalReadService.SetRow> saveSet(@PathVariable UUID id,
                                                            @RequestParam(required = false) String clientId,
                                                            @RequestBody PortalWorkoutService.SetRequest req) {
        var saved = workouts.saveSet(caller(clientId), id, req);
        return ResponseEntity.status(saved.created() ? 201 : 200).body(saved.set());
    }

    @PostMapping("/workouts/{id}/swap")
    public PortalReadService.Workout swap(@PathVariable UUID id, @RequestParam(required = false) String clientId,
                                          @RequestBody PortalWorkoutService.SwapRequest req) {
        return workouts.swap(caller(clientId), id, req);
    }

    @PostMapping("/workouts/{id}/finish")
    public PortalReadService.Workout finish(@PathVariable UUID id, @RequestParam(required = false) String clientId,
                                            @RequestBody(required = false) PortalWorkoutService.FinishRequest req) {
        return workouts.finish(caller(clientId), id, req);
    }

    /* ── 11c · what the client writes about themselves ─────────────────── */

    @PostMapping("/assessments/{id}/answers")
    public PortalReadService.CheckInDetail answer(@PathVariable UUID id, @RequestParam(required = false) String clientId,
                                                 @RequestBody(required = false) java.util.Map<String, Object> body) {
        return writes.answer(caller(clientId), id, body);
    }

    @PostMapping("/assessments/{id}/submit")
    public PortalReadService.CheckInDetail submit(@PathVariable UUID id, @RequestParam(required = false) String clientId) {
        return writes.submit(caller(clientId), id);
    }

    /* ── 11d · the client's bell and settings ──────────────────────────── */

    @GetMapping("/notifications")
    public List<PortalPrefsService.Notification> notifications(@RequestParam(required = false) String clientId) {
        return prefs.feed(caller(clientId));
    }

    @PostMapping("/notifications/read")
    public PortalPrefsService.AllRead readAll(@RequestParam(required = false) String clientId) {
        return prefs.markAllRead(caller(clientId));
    }

    @PostMapping("/notifications/{id}/read")
    public PortalPrefsService.ReadStamp read(@PathVariable UUID id, @RequestParam(required = false) String clientId) {
        return prefs.markRead(caller(clientId), id);
    }

    @PatchMapping("/prefs")
    public PortalReadService.Prefs patchPrefs(@RequestParam(required = false) String clientId,
                                              @RequestBody(required = false) java.util.Map<String, Object> body) {
        return prefs.patch(caller(clientId), body);
    }

    /* ── 11e · the client's account ─────────────────────────────────────── */

    /** Only `health` is accepted; a `phone` is refused (the ladder below moves numbers). */
    @PatchMapping
    public PortalAccountService.Details patchMe(@RequestParam(required = false) String clientId,
                                                @RequestBody(required = false) java.util.Map<String, Object> body) {
        return account.patchMe(caller(clientId), body);
    }

    /** A membership exit: 204, and the web clears its cookies. */
    @DeleteMapping
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void leave(@RequestParam(required = false) String clientId,
                      @RequestBody(required = false) PortalAccountService.LeaveBody body) {
        account.leave(caller(clientId), body);
    }

    @GetMapping("/export")
    public java.util.Map<String, Object> export(@RequestParam(required = false) String clientId) {
        return account.export(caller(clientId));
    }

    @PostMapping("/phone/challenge")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void phoneChallenge(@RequestParam(required = false) String clientId) {
        account.challenge(caller(clientId));
    }

    @PostMapping("/phone/verify")
    public PortalAccountService.Ticket phoneVerify(@RequestParam(required = false) String clientId,
                                                   @RequestBody(required = false) PortalAccountService.OtpBody body) {
        return account.verify(caller(clientId), body);
    }

    @PostMapping("/phone/request")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void phoneRequest(@RequestParam(required = false) String clientId,
                             @RequestBody(required = false) PortalAccountService.NewPhoneBody body) {
        account.request(caller(clientId), body);
    }

    @PostMapping("/phone/confirm")
    public PortalAccountService.PhoneChanged phoneConfirm(@RequestParam(required = false) String clientId,
                                                          @RequestBody(required = false) PortalAccountService.ConfirmBody body) {
        return account.confirm(caller(clientId), body);
    }

    private PortalScope.Me caller(String clientId) {
        String phone = SecurityContextHolder.getContext().getAuthentication().getName();
        return scope.resolve(phone, clientId);
    }
}
