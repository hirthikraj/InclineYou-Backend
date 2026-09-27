package com.inclineyou.inclineyou_backend.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A refusal whose {@code code} belongs to the wire rather than to one module —
 * api-contract 1.1 *Conventions* and the Error codes appendix.
 *
 * <p>The module exceptions ({@code PackageRuleException}, {@code NudgeRuleException}
 * …) stay for the codes only one module can raise. These are the ones every
 * module raises the same way: a malformed field, a window past its documented
 * maximum, a client-minted id that is already somebody else's. Before 1.1 they
 * went out as a bare {@code ResponseStatusException}, which carries no
 * {@code code} at all — and the UI branches on {@code code}, never on the prose.
 */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** 400 — the request itself is wrong: a field rule, a bad id, an empty batch. */
    public static ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
    }

    /**
     * 400 — past a documented maximum (a date window, a page size). Nothing is
     * ever cut off silently in 1.1: either the answer fits, or this says why not.
     */
    public static ApiException rangeTooLarge(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "RANGE_TOO_LARGE", message);
    }

    /** 404 — not found, or not yours. A plain 404 carries no {@code code} (Error codes appendix). */
    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, null, message);
    }

    /** 409 — well-formed, and the resource's current state says no; the same request could work later. */
    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    /**
     * 409 — a client-minted id that clashes with a row under another parent,
     * trainer or workspace. No detail on purpose: saying what the id belongs to
     * would make every create a probe for other people's rows.
     */
    public static ApiException idConflict() {
        return new ApiException(HttpStatus.CONFLICT, "ID_CONFLICT", "That id is already in use.");
    }
}
