package com.inclineyou.inclineyou_backend.core.client.dto;

import java.util.Set;

/**
 * V48 — what the roster and the client file know about a lead: where they came from, what they asked about, when to get back
 * to them, and the last time the trainer reached them. On every client, never null (a client added before V48, or one who
 * never was a lead, reads all nulls); the source and the interest stay after they become a client, for the funnel.
 *
 * @param interestedPackName the pack's name as it is now, null when none or when the pack was removed from the price list
 * @param nextFollowUpOn     ISO date in the workspace's calendar, or null
 * @param lastContactAt      epoch ms of the newest live {@code lead_contact}, or null
 * @param lastOutcome        that contact's outcome, or null
 */
public record Lead(String source, String sourceDetail, String interestedPackId, String interestedPackName,
                   String nextFollowUpOn, Long lastContactAt, String lastOutcome) {

    public static final String SOURCES = "walk_in|referral|instagram|whatsapp|phone_call|google|join_link|gym_desk|other";
    public static final String SOURCES_MESSAGE =
            "walk_in, referral, instagram, whatsapp, phone_call, google, join_link, gym_desk or other";

    public static final String CHANNELS = "call|whatsapp|in_person";
    public static final String OUTCOMES =
            "interested|wants_trial|sent_price|call_back|no_answer|too_expensive|went_elsewhere|timing_location|not_interested";
    public static final String OUTCOMES_MESSAGE = "interested, wants_trial, sent_price, call_back, no_answer, too_expensive, "
            + "went_elsewhere, timing_location or not_interested";

    /** The four outcomes that end the follow-ups, and double as the lost reason. {@code lead_contact_closing} in V48. */
    public static final Set<String> CLOSING = Set.of("too_expensive", "went_elsewhere", "timing_location", "not_interested");
}
