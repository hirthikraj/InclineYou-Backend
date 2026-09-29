package com.inclineyou.inclineyou_backend.core.program;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A rule about applying or editing a plan said no.
 *
 * <p>The {@code PackageRuleException} shape, for its reason: a
 * {@code ResponseStatusException} serialises through the servlet error page and
 * its sentence never reaches the trainer. That mattered most on apply, whose
 * schedule refusal had always been a well-written sentence — "This program
 * trains 3 days a week — schedule exactly 3 weekdays for it" — that no screen
 * ever showed, so the add-a-client flow answered a plain "couldn't assign".
 */
@Getter
public class ProgramRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public ProgramRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /**
     * The schedule does not name the template's days one-for-one — sent that
     * way, or derived from a standing week with a different number of days.
     */
    public static ProgramRuleException scheduleMismatch(String message) {
        return new ProgramRuleException(HttpStatus.BAD_REQUEST, "SCHEDULE_MISMATCH", message);
    }

    /** V11 · PUT / DELETE aimed at a certified program. Its copy is the one to edit. */
    public static ProgramRuleException certifiedReadOnly() {
        return new ProgramRuleException(HttpStatus.FORBIDDEN, "CERTIFIED_READ_ONLY",
                "Certified programs can't be edited. Copy it to your programs and edit your copy.");
    }

    /** V11 · apply aimed at a certified program. A client is put on a copy, never the original. */
    public static ProgramRuleException certifiedCopyFirst() {
        return new ProgramRuleException(HttpStatus.CONFLICT, "CERTIFIED_COPY_FIRST",
                "Copy this to your programs first, then assign your copy — a client is never put on the certified original.");
    }

    /** V11 · no such certified program, or it has been retired. */
    public static ProgramRuleException certifiedNotFound() {
        return new ProgramRuleException(HttpStatus.NOT_FOUND, "CERTIFIED_NOT_FOUND",
                "That certified program is not available.");
    }

    /** A slot on no weekday, two slots on one weekday, or a time that is not HH:mm. */
    public static ProgramRuleException scheduleInvalid(String message) {
        return new ProgramRuleException(HttpStatus.BAD_REQUEST, "SCHEDULE_INVALID", message);
    }
}
