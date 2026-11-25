package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateLeadContactRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Lead;
import com.inclineyou.inclineyou_backend.core.client.dto.LeadContact;
import com.inclineyou.inclineyou_backend.core.client.dto.LeadContactSaved;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * V48 — the lead's contact log: each time the trainer reached them, what came of it, and the next follow-up.
 *
 * <p><b>A contact moves the client's follow-up date, in the same transaction.</b> The date the request sends replaces
 * {@code client.next_follow_up_on}; none clears it, because a contact that sets no next date has done the follow-up, and a
 * closing outcome refuses one. The contact keeps the date it replaced, so its Undo can put it back.
 *
 * <p><b>Nothing here sends anything, and nothing here is a nudge.</b> The screen's Call and WhatsApp open {@code tel:} and a
 * plain {@code wa.me} chat from the trainer's own phone; this only records what happened. It is not {@code nudge_log}, so
 * it never starts the client's 7-day quiet period, and a logged WhatsApp chat does not stop a payment reminder.
 *
 * <p><b>Before consent, allowed</b> — see {@link LeadRules}. Any client the trainer coaches may have contacts, though the
 * screen offers it on a prospect's file.
 */
@Service
@RequiredArgsConstructor
public class LeadContactService {

    private final LeadContactJdbcRepository repo;
    private final ClientJdbcRepository clients;
    private final ClientFileService files;
    private final LeadRules rules;

    public List<LeadContact> list(UUID tid, UUID cid) {
        files.requireOwned(tid, cid);
        return repo.list(tid, cid);
    }

    @Transactional
    public LeadContactSaved create(UUID tid, UUID cid, CreateLeadContactRequest req) {
        // The client row is locked first: two contacts logged at once must not both read the same "previous" date.
        clients.lockForPatch(tid, cid).orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if (req.id() != null) {
            var replay = replay(tid, cid, req.id());
            if (replay != null) return replay;
        }
        if (Lead.CLOSING.contains(req.outcome()) && req.nextFollowUpOn() != null) {
            throw ApiException.validation("nextFollowUpOn: " + req.outcome() + " ends the follow-ups, so it takes no date");
        }
        rules.requireFollowUp("nextFollowUpOn", req.nextFollowUpOn());
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        LocalDate previous = clients.nextFollowUpOn(cid);
        if (!repo.insert(id, tid, cid, req.channel(), req.outcome(), req.note(), req.nextFollowUpOn(), previous)) {
            // Taken between the lookup and the INSERT — a double tap whose first request has just committed.
            var replay = replay(tid, cid, id);
            if (replay != null) return replay;
            throw ApiException.idConflict();
        }
        if (!Objects.equals(previous, req.nextFollowUpOn())) clients.setNextFollowUpOn(cid, req.nextFollowUpOn());
        return new LeadContactSaved(repo.one(id), iso(req.nextFollowUpOn()), true);
    }

    /**
     * The toast's Undo, soft and idempotent. The follow-up date goes back to what this contact replaced, but only when this
     * is still the newest contact and the date is still the one it set: a later contact, or a date changed by hand since,
     * is the trainer's newer word and is left alone.
     */
    @Transactional
    public void delete(UUID tid, UUID cid, UUID contactId) {
        clients.lockForPatch(tid, cid).orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        var c = repo.lock(tid, cid, contactId).orElseThrow(() -> ApiException.notFound("That contact is not on this client."));
        if (c.deleted()) return;
        repo.softDelete(contactId);
        if (c.newest() && Objects.equals(clients.nextFollowUpOn(cid), c.followUpOn())
                && !Objects.equals(c.followUpOn(), c.previousFollowUpOn())) {
            clients.setNextFollowUpOn(cid, c.previousFollowUpOn());
        }
    }

    /** A replayed id answers the contact it made (200); another trainer's or another client's id is a clash. */
    private LeadContactSaved replay(UUID tid, UUID cid, UUID id) {
        var mine = repo.isMine(id, tid, cid);
        if (mine.isEmpty()) return null;
        if (!mine.get()) throw ApiException.idConflict();
        return new LeadContactSaved(repo.one(id), iso(clients.nextFollowUpOn(cid)), false);
    }

    private static String iso(LocalDate d) {
        return d == null ? null : d.toString();
    }
}
