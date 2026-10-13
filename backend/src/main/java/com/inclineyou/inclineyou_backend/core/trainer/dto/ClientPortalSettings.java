package com.inclineyou.inclineyou_backend.core.trainer.dto;

/**
 * The trainer's two decisions about the client portal (api-contract 1.2, tr-a10), on {@code GET /v1/trainers/me}.
 *
 * <p>{@code sessionReminders} is <b>off until the trainer turns it on</b>, and {@code clientsSeeMoney} is <b>on</b> by default
 * (transparency is the point). {@code reminderText} is the one approved utility template and is read-only: nothing on this
 * wire changes it. {@code reminderReach} is the honest answer to <i>who will get this</i>, because switching reminders on
 * opts nobody in.
 */
public record ClientPortalSettings(
        boolean sessionReminders,
        String reminderTiming,
        boolean clientsSeeMoney,
        String reminderText,
        ReminderReach reminderReach
) {
    /** The approved WhatsApp utility template. Fixed wording; the platform fills the three slots. */
    public static final String REMINDER_TEXT = "Reminder: {session} with {trainer} {when}.";

    /**
     * @param onPortal  clients who have joined the portal
     * @param optedIn   of those, the ones who would actually be sent a reminder: the WhatsApp channel is on, they have opted in,
     *                  and the trainer has not excluded them
     * @param excluded  of those on the portal, the ones the trainer has excluded
     */
    public record ReminderReach(int onPortal, int optedIn, int excluded) {}
}
