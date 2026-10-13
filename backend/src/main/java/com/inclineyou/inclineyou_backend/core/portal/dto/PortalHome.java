package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.List;

/**
 * {@code GET /v1/portal/home} (api-contract 1.2, p-a2): the screen a client opens most, in one read.
 *
 * <p>One hero and exactly one — a booked session, a self-run day, a rest day, or a warm first-run state — and every state has a
 * sentence; none is blank or alarming. Anything the client does not have is ABSENT rather than null: no message, no package, no recap.
 * Nothing here is ever a price (R99) and nothing here is an unshared note.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PortalHome(
        String access,
        Trainer trainer,
        long now,
        String timezone,
        Hero hero,
        Message message,
        @JsonProperty("package") Pack pack,
        LastRecap lastRecap,
        Milestone recentMilestone,
        Assessments assessments,
        int unreadNotices,
        boolean installEligible
) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Trainer(String name) {}

    /** {@code kind}: {@code session} · {@code selfRun} · {@code rest} · {@code empty} — exactly one. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Hero(String kind, SessionCard session, Workout workout, Resume resume, SessionCard nextSession) {}

    /**
     * A trainer-led session. {@code rescheduleUrl} is a WhatsApp draft naming the session: there is no endpoint, because a trainer's
     * diary is the trainer's to move (UC-CP-19).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SessionCard(String id, long scheduledAt, int durationMinutes, String mode, String place, String workoutName,
                              String rescheduleUrl) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Workout(String id, String name, Integer week, Integer day, int exerciseCount, int estimatedMinutes) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Resume(String sessionId) {}

    /** The newest general line from the trainer ({@code note} or {@code weekly}); a recap belongs to its session. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Message(String id, String kind, String body, long at, Long readAt, String trainerName) {}

    /** The balance, never a price, and it does not depend on the trainer's money switch. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Pack(int sessionsLeft, int sessionsTotal, String expiresOn, boolean paused) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LastRecap(String sessionId, long at, int setsDone, BigDecimal volumeKg, List<NewBest> newBests, RecapMessage message) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NewBest(String exerciseId, String name, BigDecimal loadValue, BigDecimal effortValue) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecapMessage(String id, String body, Long readAt) {}

    /** Only for 72 hours: a milestone is a moment, not a trophy shelf. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Milestone(String kind, String label, long at) {}

    /** A quiet card under the hero, never the hero (UC-CP-14). Absent when nothing is open. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Assessments(int open, int late, Next next) {
        public record Next(String id, String name, String dueOn) {}
    }
}
