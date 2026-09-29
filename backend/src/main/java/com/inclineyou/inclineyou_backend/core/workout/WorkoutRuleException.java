package com.inclineyou.inclineyou_backend.core.workout;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A rule about a saved workout said no — the {@code PackageRuleException}
 * shape, so the sentence reaches the builder instead of the servlet error page.
 */
@Getter
public class WorkoutRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public WorkoutRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static WorkoutRuleException validation(String message) {
        return new WorkoutRuleException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
    }

    public static WorkoutRuleException notFound() {
        return new WorkoutRuleException(HttpStatus.NOT_FOUND, "WORKOUT_NOT_FOUND",
                "That workout is not in your library.");
    }
}
