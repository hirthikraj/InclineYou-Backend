package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.BulkInviteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.BulkInviteResult;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteCreated;
import com.inclineyou.inclineyou_backend.core.client.dto.InviteItem;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/invites} (api-contract 1.2 Trainer side, tr-a1): mint a personal link for one client.
 *
 * <p><b>Nothing is sent.</b> The link goes out from the trainer's own WhatsApp through a {@code wa.me} URL they review and
 * press, as nudges do — the client's first message is from someone they know, not from the platform. The default wording
 * is built in; editing it is the web's business.
 *
 * <p>A call is a <b>resend</b> as much as a first invite: any pending invite for the client is revoked ({@code replaced})
 * and a new one is made, in one transaction, so there is never more than one live link. That is also why the route takes
 * no client-minted id (R109): its response carries a secret that only the first answer can have.
 */
@Service
@RequiredArgsConstructor
public class ClientInviteService {

    private final ClientInviteJdbcRepository invites;
    private final AppProperties props;
    /** One transaction per client for {@link #inviteMany}, so one refusal cannot roll back the others. */
    private final TransactionTemplate tx;

    /** A whole roster is 16–24 clients; fifty is far past any real selection. */
    static final int MAX_BATCH = 50;

    @Transactional
    public InviteCreated invite(UUID trainerId, UUID clientId) {
        return inviteOne(trainerId, clientId, invites.trainerName(trainerId));
    }

    /**
     * {@code POST /v1/client-invites/{id}/revoke}: withdraw an invitation (UC-CLI-14). Idempotent by TARGET state: a
     * pending invite becomes {@code revoked} / {@code trainer} and its client goes back to {@code not_invited}; one that is
     * already revoked or declined answers 200 unchanged, so a double tap or a retry is harmless and a declined client is not
     * quietly rewritten as withdrawn. An accepted one is 409 {@code INVITE_ACCEPTED}: ending access after that is archive.
     * Withdrawing an invite whose date has passed is the same act: it is still stored as pending until someone says otherwise.
     * The client row is locked before the invite, the order every other writer here takes, so this cannot interleave with a
     * resend or an acceptance.
     */
    @Transactional
    public InviteItem revoke(UUID trainerId, UUID inviteId) {
        UUID clientId = invites.clientOf(trainerId, inviteId)
                .orElseThrow(() -> ApiException.notFound("That invitation is not on your list."));
        invites.lockClient(trainerId, clientId);
        InviteItem now = invites.lockInvite(trainerId, inviteId)
                .orElseThrow(() -> ApiException.notFound("That invitation is not on your list."));
        switch (now.state()) {
            case "accepted" -> throw ApiException.conflict("INVITE_ACCEPTED",
                    "They have already joined. To end their access, archive them.");
            case "pending" -> {
                InviteItem revoked = invites.revokeByTrainer(inviteId).orElse(now);
                invites.markNotInvited(clientId);
                return revoked;
            }
            default -> {
                return now;
            }
        }
    }

    /**
     * {@code POST /v1/client-invites}: invite several clients at once (UC-CLI-16). <b>Each client is its own transaction</b>
     * and its own link: twenty selected clients produce twenty distinct links and twenty drafts, a client with no number is
     * skipped and named, an accepted one is never invited again, a pending one is replaced. Answered in the order asked,
     * one result per id sent, so a caller can zip them. Nothing is sent in bulk by the platform: the trainer works down the
     * drafts and sends each from their own number.
     */
    public BulkInviteResult inviteMany(UUID trainerId, BulkInviteRequest req) {
        List<UUID> ids = ids(req);
        String trainerName = invites.trainerName(trainerId);
        var items = new ArrayList<BulkInviteResult.Item>(ids.size());
        int created = 0;
        for (UUID id : ids) {
            var item = tx.execute(status -> {
                try {
                    return BulkInviteResult.Item.created(inviteOne(trainerId, id, trainerName));
                } catch (ApiException e) {
                    status.setRollbackOnly();   // every refusal is raised before a write; this keeps it that way
                    return BulkInviteResult.Item.skipped(id.toString(), reason(e));
                }
            });
            if ("created".equals(item.outcome())) created++;
            items.add(item);
        }
        return new BulkInviteResult(items, new BulkInviteResult.Summary(created, items.size() - created));
    }

    private static List<UUID> ids(BulkInviteRequest req) {
        if (req == null || req.clientIds() == null) throw ApiException.validation("clientIds: required");
        List<UUID> ids = req.clientIds();
        if (ids.isEmpty()) throw ApiException.validation("clientIds: send at least one");
        if (ids.size() > MAX_BATCH) throw ApiException.validation("clientIds: at most " + MAX_BATCH + " at a time");
        if (ids.stream().anyMatch(java.util.Objects::isNull)) throw ApiException.validation("clientIds: an id is missing");
        if (new HashSet<>(ids).size() != ids.size()) throw ApiException.validation("clientIds: the same client twice");
        return ids;
    }

    /** What a refusal is called inside a batch: the contract's reasons, never prose. Anything else is a bug and propagates. */
    private static String reason(ApiException e) {
        if (e.getStatus() == org.springframework.http.HttpStatus.NOT_FOUND) return "NOT_FOUND";
        return switch (String.valueOf(e.getCode())) {
            case "CLIENT_NO_PHONE" -> "NO_PHONE";
            case "CLIENT_ALREADY_ACCEPTED" -> "ALREADY_ACCEPTED";
            case "CLIENT_ARCHIVED" -> "ARCHIVED";
            case "PHONE_IS_TRAINER" -> "PHONE_IS_TRAINER";
            default -> throw e;
        };
    }

    /** One client, inside the caller's transaction. Also what the single form is, so the two cannot disagree. */
    private InviteCreated inviteOne(UUID trainerId, UUID clientId, String trainerName) {
        var c = invites.lockClient(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));

        // An archived client, and one who has left, are the same thing here: removed already means "never bookable",
        // and a trainer who wants them back unarchives first (R98).
        if ("archived".equals(c.status()) || "removed".equals(c.membershipStatus())) {
            throw ApiException.conflict("CLIENT_ARCHIVED", c.name() + " is archived. Unarchive them to invite them.");
        }
        if ("accepted".equals(c.membershipStatus()) || "paused".equals(c.membershipStatus())) {
            throw ApiException.conflict("CLIENT_ALREADY_ACCEPTED", c.name() + " is already on the portal.");
        }
        if (c.phone() == null) {
            throw ApiException.conflict("CLIENT_NO_PHONE", c.name() + " has no phone number on file.");
        }
        // One number, one role. Says only that it cannot be invited: no name, nothing about whose account it is (R110).
        if (invites.phoneBelongsToTrainer(c.phone())) {
            throw ApiException.conflict("PHONE_IS_TRAINER", "That number can't be invited.");
        }

        invites.revokePending(clientId, "replaced");
        String token = InviteToken.mint();
        var invite = invites.insert(trainerId, clientId, c.phone(), InviteToken.hash(token));
        invites.markInvited(clientId);

        String link = props.getWeb().getBaseUrl().replaceAll("/+$", "") + "/invite/" + token;
        String draft = draft(c.name(), trainerName, link);
        return new InviteCreated(invite, new InviteCreated.ClientRef(c.id(), c.name(), "invited"), link, draft,
                waUrl(c.phone(), draft));
    }

    /** The built-in wording. A trainer who has not finished setup has no real name yet; the message still reads. */
    static String draft(String clientName, String trainerName, String link) {
        String who = hasName(trainerName) ? first(trainerName) + " here" : "Your trainer";
        return "Hi " + first(clientName) + ", " + who + ". I've set you up on InclineYou so you can see your plan and log "
                + "your workouts. Tap to join: " + link;
    }

    /** {@code wa.me} takes digits only, and %20 rather than + for a space. */
    static String waUrl(String phone, String text) {
        return "https://wa.me/" + phone.replaceAll("\\D", "") + "?text="
                + URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** Sign-up stores the phone number as the trainer's name until setup asks for a real one; a number is not a name. */
    private static boolean hasName(String name) {
        return name != null && !name.isBlank() && !name.strip().matches("[+\\d\\s()-]+");
    }

    private static String first(String name) {
        String n = name.strip();
        int sp = n.indexOf(' ');
        return sp < 0 ? n : n.substring(0, sp);
    }
}
