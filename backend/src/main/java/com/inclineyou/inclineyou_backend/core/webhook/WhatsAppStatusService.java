package com.inclineyou.inclineyou_backend.core.webhook;

import com.inclineyou.inclineyou_backend.core.auth.OtpRequestLedger;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Set;

/**
 * What the provider reported about messages we sent: one {@code statuses[]} entry per message and state, keyed by the message id.
 *
 * <p>A sign-in code is found in {@code otp_request.provider_message_id}, a session reminder in
 * {@code client_notification.whatsapp_message_id}; an id is in at most one of them, so each status is offered to both and the
 * table that knows it moves. Both writes are monotonic (a status never goes backwards), which is the whole of the idempotency:
 * Meta retries and reorders, and a replayed or late event changes nothing.
 *
 * <p>Never logs the body, a number or an id — only counts. {@code recipient_id} is a phone number and is not read at all.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppStatusService {

    private static final Set<String> STATES = Set.of("sent", "delivered", "read", "failed");

    private final JsonMapper mapper;
    private final OtpRequestLedger otpRequests;
    private final WhatsAppStatusJdbcRepository reminders;

    /** A body that is not the shape Meta documents is ignored (a signed non-status event, e.g. an inbound message), not an error. */
    public void apply(byte[] body) {
        JsonNode root;
        try {
            root = mapper.readTree(body);
        } catch (JacksonException e) {
            log.warn("whatsapp webhook: a signed body that is not JSON was ignored");
            return;
        }
        int seen = 0, moved = 0;
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode status : change.path("value").path("statuses")) {
                    String id = status.path("id").asText("");
                    String state = status.path("status").asText("");
                    if (id.isBlank() || id.length() > 100 || !STATES.contains(state)) continue;
                    seen++;
                    moved += record(id, state, errorOf(status));
                }
            }
        }
        if (seen > 0) log.info("whatsapp webhook: {} status(es) received, {} changed something", seen, moved);
    }

    private int record(String id, String state, String error) {
        int moved = otpRequests.delivery(id, state, error);
        // The reminder's row is under row-level security and this request has no session: the SYSTEM actor, for this call only.
        var before = TenantContext.current();
        TenantContext.set(TenantContext.SYSTEM);
        try {
            moved += reminders.recordReminder(id, state, error);
        } finally {
            TenantContext.set(before);
        }
        return moved;
    }

    /** {@code "<code> <title>"} of the first error, or null: the provider's reason, never the number it concerned. */
    private static String errorOf(JsonNode status) {
        JsonNode first = status.path("errors").path(0);
        if (first.isMissingNode()) return null;
        String code = first.path("code").asText("");
        String title = first.path("title").asText("");
        String joined = (code + " " + title).trim();
        return joined.isEmpty() ? null : joined;
    }
}
