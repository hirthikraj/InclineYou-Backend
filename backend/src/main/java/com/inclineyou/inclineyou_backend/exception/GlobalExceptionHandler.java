package com.inclineyou.inclineyou_backend.exception;

import com.inclineyou.inclineyou_backend.auth.InvalidOtpException;
import com.inclineyou.inclineyou_backend.auth.OtpExpiredException;
import com.inclineyou.inclineyou_backend.auth.OtpLockedException;
import com.inclineyou.inclineyou_backend.auth.OtpThrottledException;
import com.inclineyou.inclineyou_backend.client.ClientRuleException;
import com.inclineyou.inclineyou_backend.portal.PortalRuleException;
import com.inclineyou.inclineyou_backend.program.ProgramRuleException;
import com.inclineyou.inclineyou_backend.workout.WorkoutRuleException;
import com.inclineyou.inclineyou_backend.client.PhoneUnavailableException;
import com.inclineyou.inclineyou_backend.nudge.NudgeRuleException;
import com.inclineyou.inclineyou_backend.assessment.AssessmentRuleException;
import com.inclineyou.inclineyou_backend.payment.PackRuleException;
import com.inclineyou.inclineyou_backend.trainer.AccountRuleException;
import com.inclineyou.inclineyou_backend.payment.PackageRuleException;
import com.inclineyou.inclineyou_backend.team.TeamRuleException;
import com.inclineyou.inclineyou_backend.tenant.TenantRuleException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(InvalidOtpException.class)
    ProblemDetail handleInvalidOtp(InvalidOtpException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_CONTENT, ex.getMessage());
        pd.setProperty("code", "OTP_WRONG");
        pd.setProperty("attemptsLeft", ex.getAttemptsLeft());
        return pd;
    }

    /**
     * 410 rather than 422: the code was valid and is now gone. The client reads
     * `code` first, so the status only has to be something it can't confuse with
     * a wrong code — which is the whole point, since the two look identical to a
     * trainer and have opposite recoveries.
     */
    @ExceptionHandler(OtpExpiredException.class)
    ProblemDetail handleOtpExpired(OtpExpiredException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.GONE, ex.getMessage());
        pd.setProperty("code", "OTP_EXPIRED");
        return pd;
    }

    @ExceptionHandler(OtpLockedException.class)
    ResponseEntity<ProblemDetail> handleOtpLocked(OtpLockedException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
        pd.setProperty("code", "OTP_LOCKED");
        pd.setProperty("retryAfterSeconds", ex.getRetryAfterSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(pd);
    }

    /**
     * Also 429, and deliberately a different `code` from the lock above.
     *
     * The two are opposite recoveries wearing the same status: a lock means this
     * number typed three wrong codes and the app owes it a countdown screen; a
     * throttle means the codes are going out faster than anyone reads them, and
     * the answer is to wait on the screen you are already on. `retryAfterSeconds`
     * carries the real wait — 30 seconds on the second code of a minute, hours
     * once the day's ceiling is hit — so the app can say which it is.
     */
    @ExceptionHandler(OtpThrottledException.class)
    ResponseEntity<ProblemDetail> handleOtpThrottled(OtpThrottledException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
        pd.setProperty("code", "OTP_THROTTLED");
        pd.setProperty("retryAfterSeconds", ex.getRetryAfterSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(pd);
    }

    /**
     * 409, because the number is real and the request is well-formed — it is
     * already spoken for. The app reads `code` to choose the recovery it offers:
     * a trainer's number needs a different number, another trainer's client
     * needs to leave that roster first.
     */
    @ExceptionHandler(PhoneUnavailableException.class)
    ProblemDetail handlePhoneUnavailable(PhoneUnavailableException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return pd;
    }

    /**
     * Team rules, all fifteen of them, through one handler.
     *
     * The exception carries its own status because these failures genuinely
     * differ: 403 when the caller is in the team but not high enough, 404 when
     * the thing is outside their team (the standing cross-trainer convention,
     * unchanged), 409 when the state says no, 410 for a lapsed invitation, and
     * 422 for a request that is well-formed and asks for something that cannot
     * exist. `code` is what the app branches on in every case.
     */
    @ExceptionHandler(TeamRuleException.class)
    ResponseEntity<ProblemDetail> handleTeamRule(TeamRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        if (ex.getSeatLimit() != null) pd.setProperty("seatLimit", ex.getSeatLimit());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * A workspace rule said no.
     *
     * <p>Same shape as the team handler above, and the statuses mean the same
     * things: 403 when the caller's role in this workspace is not enough, 404
     * when the workspace is not one of theirs — the ownership-is-a-query-filter
     * convention, so a wrong id is indistinguishable from somebody else's — 409
     * for a roster collision, and 422 for a well-formed request asking for
     * something that cannot exist.
     */
    @ExceptionHandler(TenantRuleException.class)
    ResponseEntity<ProblemDetail> handleTenantRule(TenantRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(
                org.springframework.http.HttpStatus.valueOf(ex.getStatus()), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * V5 · measuring rules. Same shape as the two above: the status varies (400
     * for a request that cannot be carried out, 404 for a reading this trainer
     * cannot see) and `code` is what the screen branches on.
     */
    @ExceptionHandler(AssessmentRuleException.class)
    ResponseEntity<ProblemDetail> handleAssessmentRule(AssessmentRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * A price-list rule said no. Same shape as the team handler above and for the
     * same reason: the `code` is what a screen branches on, and `detail` is a
     * sentence written for the trainer rather than for the log.
     */
    @ExceptionHandler(PackRuleException.class)
    ResponseEntity<ProblemDetail> handlePackRule(PackRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * An account rule said no — the number is taken, the proof timed out, the
     * typed confirmation does not match.
     *
     * <p>Its own handler for the reason the two below it have their own: Spring
     * dispatches on the exception type. The shape is identical on purpose —
     * `code` to branch on, `detail` written for the trainer to read — and on
     * this screen the `detail` matters more than anywhere else in the product,
     * because every refusal here names something the trainer must act on and
     * cannot guess. See {@code AccountRuleException}.
     */
    /** A client-portal rule said no. See {@code PortalRuleException}. */
    @ExceptionHandler(PortalRuleException.class)
    ResponseEntity<ProblemDetail> handlePortalRule(PortalRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /** A saved workout was refused. See {@code WorkoutRuleException}. */
    @ExceptionHandler(WorkoutRuleException.class)
    ResponseEntity<ProblemDetail> handleWorkoutRule(WorkoutRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /** Applying or editing a plan said no. See {@code ProgramRuleException}. */
    @ExceptionHandler(ProgramRuleException.class)
    ResponseEntity<ProblemDetail> handleProgramRule(ProgramRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /** A rule about a client's file said no. See {@code ClientRuleException}. */
    @ExceptionHandler(ClientRuleException.class)
    ResponseEntity<ProblemDetail> handleClientRule(ClientRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    @ExceptionHandler(AccountRuleException.class)
    ResponseEntity<ProblemDetail> handleAccountRule(AccountRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * A rule about a SOLD package said no — pausing one that is already paused,
     * extending one that closed in March.
     *
     * <p>Its own handler rather than a second `@ExceptionHandler` value on the
     * one above, because the two exceptions are different types and Spring
     * dispatches on the type. The shape is identical on purpose: `code` is what
     * the screen branches on, `detail` is a sentence written for the trainer.
     *
     * <p>Unlike the price list's, most of these are 409 — see
     * {@link PackageRuleException} for why a state conflict and a malformed body
     * must not arrive as the same status.
     */
    @ExceptionHandler(PackageRuleException.class)
    ResponseEntity<ProblemDetail> handlePackageRule(PackageRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    /**
     * A nudge rule said no — an unknown template, an empty body, a client with
     * no number on file.
     *
     * <p>Same shape as the two above. The one worth knowing about is
     * {@code NUDGE_NO_PHONE}: it is a 422 rather than a 400 because the request
     * is perfectly well-formed and asks for something that cannot exist, and the
     * screen turns it into "Meera has no number on file" beside a link to her
     * file rather than into "that did not go through".
     */
    @ExceptionHandler(NudgeRuleException.class)
    ResponseEntity<ProblemDetail> handleNudgeRule(NudgeRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        pd.setProperty("code", ex.getCode());
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
