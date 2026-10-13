package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalSettings;
import com.inclineyou.inclineyou_backend.core.auth.SessionStore;
import com.inclineyou.inclineyou_backend.core.trainer.StepUpService;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * The client's settings, what their trainer can see, and the three ways out (api-contract 1.2, ps-l1 … ps-a4): sign a device out (the shared
 * session routes), leave a trainer, delete the account.
 *
 * <p><b>Leaving is not deleting.</b> Leaving ends one arrangement — the trainer is told, the money book does not move, the number is free to
 * accept a new trainer's invite — and the client keeps their account and can still take their data. Deleting erases the person, behind the same
 * step-up the trainer uses, and what is financial stays as amounts and dates.
 */
@Service
@RequiredArgsConstructor
public class PortalSettingsService {

    private final PortalSettingsJdbcRepository repo;
    private final PortalJdbcRepository portal;
    private final PortalAccess access;
    private final StepUpService stepUp;
    private final SessionStore sessions;

    // ── prefs ────────────────────────────────────────────────────────────────────────────────────

    public PortalSettings.Prefs prefs(String phone) {
        return repo.prefs(access.clientId(phone));
    }

    @Transactional
    public PortalSettings.Prefs patch(String phone, PortalSettings.PrefsPatch req, String ifMatch) {
        UUID client = access.clientId(phone);
        repo.ensureRow(client);
        String version = repo.lockVersion(client).orElseThrow();
        IfMatch.check(ifMatch, version, "Your settings changed on another device. Reload to see them, then edit again.");
        if (req.isEmpty()) return repo.prefs(client);

        var set = new LinkedHashMap<String, Object>();
        if (req.hideWeight() != null) set.put("hide_weight", req.hideWeight());
        if (req.autoRestTimer() != null) set.put("auto_rest_timer", req.autoRestTimer());
        var n = req.notifications();
        if (n != null) {
            if (n.programUpdated() != null) set.put("notify_program_updated", n.programUpdated());
            if (n.sessionReminder() != null) set.put("notify_session_reminder", n.sessionReminder());
            if (n.trainerNote() != null) set.put("notify_trainer_note", n.trainerNote());
            if (n.personalBest() != null) set.put("notify_personal_best", n.personalBest());
            if (n.packChanged() != null) set.put("notify_pack_changed", n.packChanged());
            if (n.assessment() != null) set.put("notify_checkin", n.assessment());   // stored as checkin, called assessment everywhere
        }
        boolean optIn = false;
        var ch = req.channels();
        if (ch != null) {
            if (ch.whatsapp() != null) {
                set.put("channel_whatsapp", ch.whatsapp());
                // Turning WhatsApp on records the opt-in; turning it off stops the platform at once but does not clear it, so on again is not a second consent.
                optIn = ch.whatsapp();
            }
            if (ch.push() != null) set.put("channel_push", ch.push());
        }
        if (req.nominee() != null) {
            var v = req.nominee().value();
            set.put("nominee_name", v == null ? null : v.name().strip());
            set.put("nominee_phone", v == null ? null : v.phone());
        }
        repo.update(client, set, optIn);
        return repo.prefs(client);
    }

    // ── privacy ──────────────────────────────────────────────────────────────────────────────────

    public PortalSettings.Privacy privacy(String phone) {
        UUID client = access.clientId(phone);
        JsonNode wall = portal.wall(phone).orElseThrow();
        String trainer = PortalHomeService.text(wall.path("trainer"), "name");
        var health = repo.healthItems(client, List.copyOf(AssessmentCatalogue.HEALTH_MEASUREMENTS), List.copyOf(AssessmentCatalogue.HEALTH_QUESTIONS));
        var sees = List.of(
                new PortalSettings.Sees("profile", "Your name, phone, goal, height and date of birth", null, null),
                new PortalSettings.Sees("sessions", "Every session and set you log, including the ones you do alone", null, null),
                new PortalSettings.Sees("assessments", "The assessments you submit, and any measurements in them", health.isEmpty() ? null : health, null),
                new PortalSettings.Sees("notes", "Their own private notes about you; you only see the ones they share", null, null),
                new PortalSettings.Sees("money", "What you owe and what you have paid" + (portal.moneyVisible(client) ? "; you see it too" : ""), null, portal.moneyVisible(client)));
        return new PortalSettings.Privacy(trainer, portal.acceptedPolicy(phone), portal.acceptedAt(phone), sees,
                List.of("Your other trainers", "Anything you enter for another trainer"), repo.sharedNotes(client), true);
    }

    // ── leave ────────────────────────────────────────────────────────────────────────────────────

    /**
     * Idempotent by target state: a client who has already left gets the same body again, which is why this does not go through
     * {@link PortalAccess} (a removed client has no live arrangement and would be refused as {@code PORTAL_REMOVED}).
     */
    @Transactional
    public PortalSettings.Left leave(String phone, PortalSettings.Leave req) {
        JsonNode wall = portal.wall(phone).orElseThrow(() -> ApiException.notFound("There is nothing to leave."));
        if ("removed".equals(wall.path("access").asString())) return left(wall);
        if (!Boolean.TRUE.equals(req.confirm())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "LEAVE_NOT_CONFIRMED", "Confirm that you want to leave before this goes ahead.");
        }
        UUID client = access.clientId(phone);
        repo.clearNominee(client);   // a nominee is for as long as the arrangement is
        repo.leave(client);
        return left(portal.wall(phone).orElseThrow());
    }

    private static PortalSettings.Left left(JsonNode wall) {
        return new PortalSettings.Left("removed", wall.path("removed_at").isNumber() ? wall.path("removed_at").asLong() : null, wall.path("removed_by").asString(null));
    }

    // ── export ───────────────────────────────────────────────────────────────────────────────────

    /** The person's own data. Not behind {@link PortalAccess}: the removed wall must still be able to take it. */
    public String export(String phone) {
        return repo.export(phone);
    }

    // ── delete ───────────────────────────────────────────────────────────────────────────────────

    @Transactional
    public void deleteAccount(String phone, String ticket, String rawToken) {
        stepUp.requireForClient(ticket, StepUpService.ACCOUNT_DELETION, phone, rawToken);
        UUID user = repo.appUserId(phone).orElseThrow(() -> ApiException.notFound("There is no account to delete."));
        // Through the store, not only the table: sessions are cached in Redis, which a database function cannot reach, and a deleted person's
        // browser must stop working now — not when a cache entry lapses. The subject is the phone, which erasure is about to null.
        sessions.revokeAllForSubject(phone, java.time.Instant.now(), SessionStore.SIGN_OUT_ALL);
        repo.erase(user);
    }

    // ── push ─────────────────────────────────────────────────────────────────────────────────────

    /** 201 for a new browser, 200 for a replay or the same browser coming back. The subscription belongs to the person and a browser, not to a trainer. */
    @Transactional
    public Subscribed subscribe(String phone, PortalSettings.Subscribe req) {
        UUID user = repo.appUserId(phone).orElseThrow(() -> ApiException.notFound("There is no account."));
        UUID id = uuid(req.id(), "id");
        var existing = repo.subscriptionByEndpoint(req.endpoint());
        if (existing.isPresent()) {
            repo.takeOver(existing.get().id(), user, req.keys().p256dh(), req.keys().auth(), req.userAgent());
            return new Subscribed(existing.get().id(), false);
        }
        if (repo.idTaken(id)) throw ApiException.idConflict();
        repo.insertSubscription(id, user, req.endpoint(), req.keys().p256dh(), req.keys().auth(), req.userAgent());
        return new Subscribed(id, true);
    }

    public record Subscribed(UUID id, boolean created) {}

    @Transactional
    public void unsubscribe(String phone, UUID id) {
        UUID user = repo.appUserId(phone).orElseThrow(() -> ApiException.notFound("There is no account."));
        if (!repo.revoke(id, user)) throw ApiException.notFound("That subscription isn’t yours.");
    }

    private static UUID uuid(String raw, String field) {
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}
