package com.xrep.xrep_backend.exception;

import com.xrep.xrep_backend.auth.InvalidOtpException;
import com.xrep.xrep_backend.auth.OtpExpiredException;
import com.xrep.xrep_backend.auth.OtpLockedException;
import com.xrep.xrep_backend.auth.OtpThrottledException;
import com.xrep.xrep_backend.client.PhoneUnavailableException;
import com.xrep.xrep_backend.team.TeamRuleException;
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
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
