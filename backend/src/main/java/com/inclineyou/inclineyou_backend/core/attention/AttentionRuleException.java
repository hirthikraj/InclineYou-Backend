package com.inclineyou.inclineyou_backend.core.attention;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A dismissal the attention queue cannot record. `code` is what the screen
 * branches on; `detail` is written for the trainer.
 */
@Getter
public class AttentionRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AttentionRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** A kind the queue does not have — the same code as a mismatch, with a sentence about the kind. */
    public static AttentionRuleException unknownKind(String kind, java.util.List<String> kinds) {
        return new AttentionRuleException(HttpStatus.BAD_REQUEST, "BAND_KIND_MISMATCH",
                "\"%s\" is not a kind of row: one of %s.".formatted(kind, String.join(", ", kinds)));
    }

    /** Mirrors {@code attention_dismissal_band}: a band only exists inside its own kind. */
    public static AttentionRuleException bandKindMismatch(String kind, String band) {
        return new AttentionRuleException(HttpStatus.BAD_REQUEST, "BAND_KIND_MISMATCH",
                "\"%s\" is not a band of \"%s\".".formatted(band, kind));
    }
}
