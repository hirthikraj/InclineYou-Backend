package com.inclineyou.inclineyou_backend.shared.exception;

import com.inclineyou.inclineyou_backend.core.auth.InvalidOtpException;
import com.inclineyou.inclineyou_backend.core.auth.OtpExpiredException;
import com.inclineyou.inclineyou_backend.core.auth.OtpLockedException;
import com.inclineyou.inclineyou_backend.core.auth.OtpThrottledException;
import com.inclineyou.inclineyou_backend.core.client.ClientRuleException;
import com.inclineyou.inclineyou_backend.core.client.PhoneUnavailableException;
import com.inclineyou.inclineyou_backend.core.nudge.NudgeRuleException;
import com.inclineyou.inclineyou_backend.core.assessment.AssessmentRuleException;
import com.inclineyou.inclineyou_backend.core.attention.AttentionRuleException;
import com.inclineyou.inclineyou_backend.core.payment.PackRuleException;
import com.inclineyou.inclineyou_backend.core.trainer.AccountRuleException;
import com.inclineyou.inclineyou_backend.core.payment.PackageRuleException;
import com.inclineyou.inclineyou_backend.core.tenant.TenantRuleException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.UnrecognizedPropertyException;

import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    /** The wire-wide codes — `VALIDATION`, `RANGE_TOO_LARGE`, `ID_CONFLICT`. See {@link ApiException}. */
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        if (ex.getCode() != null) pd.setProperty("code", ex.getCode());
        if ("VALIDATION".equals(ex.getCode())) {
            // Every refusal in this codebase is written "field: sentence"; the wire's errors[] is that, split.
            var m = FIELD_SENTENCE.matcher(ex.getMessage() == null ? "" : ex.getMessage());
            if (m.matches()) pd.setProperty("errors", List.of(error(m.group(1), "invalid", m.group(2))));
        }
        return ResponseEntity.status(ex.getStatus()).body(pd);
    }

    private static final java.util.regex.Pattern FIELD_SENTENCE =
            java.util.regex.Pattern.compile("^([A-Za-z][A-Za-z0-9_.\\[\\]]*): (.+)$", java.util.regex.Pattern.DOTALL);

    /** One entry of a VALIDATION response's {@code errors[]} — a field, a machine code, a sentence. */
    private static Map<String, String> error(String field, String code, String message) {
        return Map.of("field", field, "code", code, "message", message);
    }

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

    /** A dismissal the queue cannot record — `BAND_KIND_MISMATCH`. */
    @ExceptionHandler(AttentionRuleException.class)
    ResponseEntity<ProblemDetail> handleAttentionRule(AttentionRuleException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
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
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        pd.setProperty("code", "VALIDATION");
        pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .map(e -> error(e.getField(), e.getCode() == null ? "invalid" : e.getCode(), String.valueOf(e.getDefaultMessage())))
                .toList());
        return pd;
    }

    /**
     * A body Jackson refused before any validation ran — see {@code JacksonConfig}.
     * 400 {@code VALIDATION} naming the field, in the same {@code field: sentence}
     * shape {@link #handleValidation} writes, so a screen reads one format.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail handleUnreadable(HttpMessageNotReadableException ex) {
        String detail;
        Map<String, String> entry = null;
        if (ex.getCause() instanceof JacksonException je && !je.getPath().isEmpty()) {
            boolean unknown = je instanceof UnrecognizedPropertyException;
            detail = path(je) + (unknown ? ": not a field this route takes" : ": not a valid value");
            entry = error(path(je), unknown ? "unknown_field" : "invalid",
                    unknown ? "not a field this route takes" : "not a valid value");
        } else if (ex.getCause() == null) {
            detail = "body: required";
        } else {
            detail = "body: not valid JSON";
        }
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        pd.setProperty("code", "VALIDATION");
        if (entry != null) pd.setProperty("errors", List.of(entry));
        return pd;
    }

    /** {@code schedule.deliveryMode}, {@code slots[0].weekday} — the Bean Validation spelling. */
    private static String path(JacksonException e) {
        var out = new StringBuilder();
        for (var ref : e.getPath()) {
            if (ref.getIndex() >= 0) out.append('[').append(ref.getIndex()).append(']');
            else out.append(out.isEmpty() ? "" : ".").append(ref.getPropertyName());
        }
        return out.toString();
    }

    /**
     * A path or query value that isn't the type the route takes — most often a
     * malformed id in {@code /v1/packages/{packageId}/renew}. 400 {@code VALIDATION}
     * like every other malformed input (1.1), rather than Spring's uncoded 400.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                ex.getName() + ": not a valid value");
        pd.setProperty("code", "VALIDATION");
        return pd;
    }
}
