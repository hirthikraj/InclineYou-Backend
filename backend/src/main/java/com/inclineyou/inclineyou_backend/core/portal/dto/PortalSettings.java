package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * The client's settings and privacy wire (api-contract 1.2, ps-l1 … ps-a4). One row of {@code client_prefs} per client; no row means every switch
 * is on. The trainer's half never reads any of it.
 */
public final class PortalSettings {

    private PortalSettings() {}

    public record Notify(boolean programUpdated, boolean sessionReminder, boolean trainerNote, boolean personalBest, boolean packChanged, boolean assessment) {}

    public record Channels(boolean whatsapp, boolean push) {}

    /** {@code reminderOffered}: the trainer has session reminders on for this client, so the opt-in is worth asking. */
    public record Whatsapp(boolean reminderOffered, boolean optedIn) {}

    public record Nominee(String name, String phone) {}

    /** {@code notify} on the wire; the component is {@code notifications} because a record may not be called {@code notify}. */
    public record Prefs(boolean hideWeight, boolean autoRestTimer, @com.fasterxml.jackson.annotation.JsonProperty("notify") Notify notifications, Channels channels, Whatsapp whatsapp, Nominee nominee, String version) {}

    // ── PATCH ────────────────────────────────────────────────────────────────────────────────────

    /** Absent = leave. A boolean cannot be "cleared", so a null one is the same as absent. */
    public record NotifyPatch(Boolean programUpdated, Boolean sessionReminder, Boolean trainerNote, Boolean personalBest, Boolean packChanged, Boolean assessment) {}

    public record ChannelsPatch(Boolean whatsapp, Boolean push) {}

    public record NomineeInput(@NotBlank(message = "required") @Size(max = 80, message = "at most 80 characters") String name,
                               @NotBlank(message = "required") @Pattern(regexp = "^\\+[1-9][0-9]{6,14}$", message = "a number with its country code, like +919841000001") String phone) {}

    public record PrefsPatch(Boolean hideWeight, Boolean autoRestTimer, @com.fasterxml.jackson.annotation.JsonProperty("notify") @Valid NotifyPatch notifications, @Valid ChannelsPatch channels, @Valid Patch<@Valid NomineeInput> nominee) {
        public boolean isEmpty() {
            return hideWeight == null && autoRestTimer == null && notifications == null && channels == null && nominee == null;
        }
    }

    // ── privacy ──────────────────────────────────────────────────────────────────────────────────

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Sees(String key, String label, List<String> healthItems, Boolean clientCanSee) {}

    public record Privacy(String trainerName, String policyVersion, Long acceptedAt, List<Sees> sees, List<String> doesNotSee, int sharedNotes, boolean privateNotesKept) {}

    // ── leaving, deleting, push ──────────────────────────────────────────────────────────────────

    public record Leave(@NotNull(message = "required") Boolean confirm) {}

    public record Left(String access, Long removedAt, String removedBy) {}

    public record DeleteBody(String ticket) {}

    public record Keys(@NotBlank(message = "required") @Size(max = 100, message = "at most 100 characters") String p256dh,
                       @NotBlank(message = "required") @Size(max = 50, message = "at most 50 characters") String auth) {}

    public record Subscribe(@NotBlank(message = "required") String id,
                            @NotBlank(message = "required") @Size(max = 2000, message = "at most 2,000 characters") @Pattern(regexp = "^https://.+", message = "an https address") String endpoint,
                            @NotNull(message = "required") @Valid Keys keys,
                            @Size(max = 300, message = "at most 300 characters") String userAgent) {}

    public record Subscribed(String id) {}
}
