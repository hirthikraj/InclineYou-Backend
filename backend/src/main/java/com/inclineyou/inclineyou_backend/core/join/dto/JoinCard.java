package com.inclineyou.inclineyou_backend.core.join.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCard;

import java.util.List;

/**
 * {@code GET /v1/join/{slug}}: what the public join page draws. {@code closed} carries nothing else — an unknown slug, a link
 * that is off and a trainer who left are one answer.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JoinCard(
        String state,
        String welcomeLine,
        List<JoinQuestion> questions,
        List<Plan> plans,
        Boolean allowNoPlan,
        InviteCard.Trainer trainer,
        String policyVersion,
        List<String> privacySummary
) {
    public static JoinCard closed() {
        return new JoinCard("closed", null, null, null, null, null, null, null);
    }

    /** A pack as the page shows it. {@code amount} is a decimal string, as everywhere money is on this wire. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Plan(String id, String name, String service, String basis, Integer sessions, Integer validityDays,
                       String amount, String currency) {}
}
