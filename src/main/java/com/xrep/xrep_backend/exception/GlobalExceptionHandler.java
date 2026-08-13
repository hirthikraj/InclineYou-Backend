package com.xrep.xrep_backend.exception;

import com.xrep.xrep_backend.auth.InvalidOtpException;
import com.xrep.xrep_backend.auth.OtpExpiredException;
import com.xrep.xrep_backend.auth.OtpLockedException;
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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
