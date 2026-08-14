package com.xrep.xrep_backend.exception;

import com.xrep.xrep_backend.auth.InvalidOtpException;
import com.xrep.xrep_backend.auth.OtpExpiredException;
import com.xrep.xrep_backend.auth.OtpLockedException;
import com.xrep.xrep_backend.auth.OtpThrottledException;
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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
