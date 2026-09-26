package com.inclineyou.inclineyou_backend.portal;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A portal rule said no. The {@code PackageRuleException} shape: the web reads
 * {@code {code, detail}} off the body and prints {@code detail} to the client.
 */
@Getter
public class PortalRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public PortalRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /** Signed in, but this number is on nobody's roster (any more). */
    public static PortalRuleException notAClient() {
        return new PortalRuleException(HttpStatus.FORBIDDEN, "NOT_A_CLIENT",
                "This number isn't on a trainer's roster.");
    }

    /** A `clientId` that is not one of this number's rows. Same answer whether it exists or not. */
    public static PortalRuleException notYours() {
        return new PortalRuleException(HttpStatus.FORBIDDEN, "NOT_YOURS",
                "That isn't your record.");
    }

    /** Not-yours on an {@code {id}} route is a 404, so it cannot confirm somebody else's row exists. */
    public static PortalRuleException notFound(String message) {
        return new PortalRuleException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public static PortalRuleException validation(String message) {
        return new PortalRuleException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
    }
}
