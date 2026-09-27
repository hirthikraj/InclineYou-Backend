package com.inclineyou.inclineyou_backend.attention;

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

    /** Mirrors {@code attention_dismissal_band}: a band only exists inside its own kind. */
    public static AttentionRuleException bandKindMismatch(String kind, String band) {
        return new AttentionRuleException(HttpStatus.BAD_REQUEST, "BAND_KIND_MISMATCH",
                "\"%s\" is not a band of \"%s\".".formatted(band, kind));
    }
}
