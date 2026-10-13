package com.inclineyou.inclineyou_backend.core.notification.dto;

import java.util.List;

/**
 * The trainer's bell (api-contract 1.2, tr-b1): what the portal did, newest first.
 *
 * <p>Nothing here is stored. There is no trainer notification table (S-13, deliberate): every item is read from the row that
 * records the thing, so there is nothing to keep in step with it and nothing a retry could duplicate.
 *
 * @param unreadCount events after {@code seenAt} in the same window, however many {@code items} the page was cut to
 * @param seenAt      epoch ms the trainer last opened the bell ({@code trainer.bell_seen_at}), or null if they never have
 */
public record Bell(List<Item> items, int unreadCount, Long seenAt) {

    /**
     * @param key       stable and unique, built from the row that records the event (e.g. {@code joined:<client id>}), so a screen
     *                  can tell what it has already drawn
     * @param kind      {@code client_joined} · {@code client_declined} · {@code client_left} · {@code client_selfrun_done} ·
     *                  {@code assessment_submitted} · {@code feedback_hard}
     * @param at        epoch ms of the event itself
     * @param sessionId the session a self-run or a piece of feedback is about; null otherwise
     * @param detail    one more fact where the event has one and nothing else would say it: the reason an invitation was declined
     *                  ({@code not_for_me} or {@code age_requirement}) and the name of an assessment that came back. Never a date
     *                  of birth. Null for every other kind.
     */
    public record Item(String key, String kind, long at, Who client, String sessionId, String detail) {}

    public record Who(String id, String name) {}
}
