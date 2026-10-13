package com.inclineyou.inclineyou_backend.core.client.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

import java.util.List;

/**
 * The client's place on the portal (api-contract 1.2, tr-a5), carried on every client item.
 *
 * <p>{@code state} is {@code membership_status} plus ONE derived value: {@code expired}, an invitation that is still
 * pending in the table but past its date. It is never stored, because nothing would sweep it and a stored copy would
 * be wrong from the moment the date passed. {@code invitedAt} and {@code acceptedAt} are the client's own columns, but a
 * client who is {@code not_invited} has neither: they are back at the start (a withdrawn invite, a changed number, an
 * unarchive), and a date from an earlier arrangement would read as one they are in now.
 *
 * <p>{@code extras} is flattened into this object and is present on the single read only; the roster leaves it null, so
 * its rows stay the size they were. {@link JsonUnwrapped} on a null drops every key rather than writing nulls.
 *
 * @param lastSeenAt    {@code client.last_portal_seen_at}, the lead measure: when they last opened the portal
 * @param lastSelfRunAt the end of their latest finished self-run workout, or null if they have never run one alone
 */
public record Portal(
        String state,
        Long invitedAt,
        Long acceptedAt,
        Long lastSeenAt,
        Long lastSelfRunAt,
        @JsonUnwrapped Extras extras
) {
    public Portal withExtras(Extras more) {
        return new Portal(state, invitedAt, acceptedAt, lastSeenAt, lastSelfRunAt, more);
    }

    /**
     * What the file's Access panel needs and the roster does not.
     *
     * @param inviteId           the pending invitation, if there is one (including a lapsed one)
     * @param removedBy          {@code trainer} or {@code client} once membership is removed
     * @param showMoney          the EFFECTIVE answer: the override when there is one, else the trainer's setting
     * @param showMoneyOverride  {@code null} follows the trainer's {@code clients_see_money}; {@code true} / {@code false} is theirs
     * @param recentReminders    the last three session reminders, newest first
     */
    public record Extras(
            String inviteId,
            Long inviteExpiresAt,
            String removedBy,
            boolean remindersExcluded,
            boolean showMoney,
            Boolean showMoneyOverride,
            List<Reminder> recentReminders
    ) {}

    /** One delivery-log row of the session reminder: what became of the WhatsApp message for that session. */
    public record Reminder(String sessionId, String status, String skipReason, String error, Long sentAt) {}
}
