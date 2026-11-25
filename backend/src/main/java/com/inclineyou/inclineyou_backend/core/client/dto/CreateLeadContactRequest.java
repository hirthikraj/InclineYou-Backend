package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/lead-contacts} (V48). How they were reached, what came of it, an optional line of what they
 * said, and the next follow-up date — which REPLACES the client's: absent or null clears it, because a contact that sets no
 * next date has done the follow-up. A closing outcome takes no date (400). {@code id} is optional and client-generated;
 * replaying one answers the contact already made.
 */
public record CreateLeadContactRequest(
        UUID id,
        @NotNull(message = "call, whatsapp or in_person")
        @Pattern(regexp = Lead.CHANNELS, message = "call, whatsapp or in_person") String channel,
        @NotNull(message = Lead.OUTCOMES_MESSAGE)
        @Pattern(regexp = Lead.OUTCOMES, message = Lead.OUTCOMES_MESSAGE) String outcome,
        @Size(max = 280, message = "at most 280 characters") String note,
        LocalDate nextFollowUpOn
) {
    public CreateLeadContactRequest {
        note = Text.orNull(note);
    }
}
