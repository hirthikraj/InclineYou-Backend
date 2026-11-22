package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.NoteCreated;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateNoteRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Note;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateNoteRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * api-contract 1.1 Client file — the trainer's notes: list, add, edit or pin,
 * delete, restore.
 *
 * <p>Free text and a pin, and that is the whole shape. There is no injury,
 * condition or PAR-Q field, and there must never be one: a field that tells a
 * medical note apart from any other makes this a health record under the DPDP
 * Act, whatever it is called.
 *
 * <p><b>Private unless the trainer says otherwise.</b> {@code sharedWithClient} (api-contract 1.2, tr-a9) shows one note to the
 * client in the portal, always with who wrote it and when. Only a client who is on the portal has anywhere to read it, so
 * sharing with anybody else is {@code 409 CLIENT_NOT_ON_PORTAL}; unsharing is always allowed, because pulling a note back must
 * never depend on the client's state. Sharing mints one {@code note} notice; unsharing does not take it back, and editing a
 * shared note mints nothing.
 *
 * <p>A deleted note comes back through {@code …/restore}, never by re-POSTing its
 * id: a create that silently undeletes is a surprise.
 */
@Service
@RequiredArgsConstructor
public class ClientNoteService {

    private final ClientNoteJdbcRepository repo;
    private final ClientFileService files;
    private final ClientNoticeJdbcRepository notices;
    private final ConsentGate consent;

    public List<Note> list(UUID tid, UUID cid) {
        files.requireOwned(tid, cid);
        return repo.list(tid, cid);
    }

    @Transactional
    public NoteCreated create(UUID tid, UUID cid, CreateNoteRequest req) {
        files.requireOwned(tid, cid);
        // Notes hold health details in practice, so they wait for the client's consent (22 Nov 2026). Reading, deleting
        // and an Undo stay open: none of them records anything new.
        consent.require(cid, "notes");
        if (req.id() != null) {
            var mine = repo.isMine(req.id(), tid, cid);
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                return new NoteCreated(repo.one(req.id()), false);
            }
        }
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        if (req.sharedWithClient()) requireOnPortal(tid, cid);
        if (!repo.insert(id, tid, cid, req.body(), req.pinned(), req.sharedWithClient())) {
            // The id was taken between the lookup above and the INSERT (19 Nov 2026): a double tap whose first request
            // committed while this one was in flight. ON CONFLICT waited for it, so this read sees it. This trainer's
            // note on this client is that same note, a replay; anything else is someone else's id.
            var mine = repo.isMine(id, tid, cid);
            if (mine.isPresent() && mine.get()) return new NoteCreated(repo.one(id), false);
            throw ApiException.idConflict();
        }
        if (req.sharedWithClient()) notices.mint(cid, "note", NoticeText.opening(req.body()), null, repo.sharedAt(id));
        return new NoteCreated(repo.one(id), true);
    }

    /** Send only what changed — {@code body}, {@code pinned}, {@code sharedWithClient}, or any of them. If-Match honoured when sent. */
    @Transactional
    public Note patch(UUID tid, UUID cid, UUID noteId, String ifMatch, UpdateNoteRequest req) {
        if (req.isEmpty()) throw ApiException.validation("body: send body, pinned or sharedWithClient");
        var current = lock(tid, cid, noteId);
        // Writing or sharing waits for consent; unsharing and unpinning take data away and never do (22 Nov 2026).
        if (req.body() != null || (req.sharedWithClient() != null && Boolean.TRUE.equals(req.sharedWithClient().value()))) {
            consent.require(cid, "notes");
        }
        if (current.deleted()) throw ApiException.notFound("That note was deleted.");
        if (ClientWriteService.stale(ifMatch, current.version())) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This note changed since you opened it.");
        }
        // Showing a private note is the one change that needs the client to be there, and the one that tells them.
        boolean showing = req.sharedWithClient() != null && Boolean.TRUE.equals(req.sharedWithClient().value()) && !current.shared();
        boolean hiding = req.sharedWithClient() != null && !Boolean.TRUE.equals(req.sharedWithClient().value()) && current.shared();
        if (showing) requireOnPortal(tid, cid);
        // Made private again: its notice goes with it, before shared_at is cleared (19 Nov 2026).
        String oldBody = repo.one(noteId).body();
        if (hiding) notices.retractNote(cid, noteId, NoticeText.opening(oldBody));
        repo.update(noteId, req);
        var note = repo.one(noteId);
        if (showing) notices.mint(cid, "note", NoticeText.opening(note.body()), null, repo.sharedAt(noteId));
        // Reworded and still shared (21 Nov 2026): the bell quoted the old opening, and kept quoting it.
        if (current.shared() && !hiding && !note.body().equals(oldBody)) {
            notices.retextNote(cid, noteId, NoticeText.opening(oldBody), NoticeText.opening(note.body()));
        }
        return note;
    }

    /** Soft, and idempotent: a deleted note answers 204 again. */
    @Transactional
    public void delete(UUID tid, UUID cid, UUID noteId) {
        var current = lock(tid, cid, noteId);
        // A shared note's bell notice quotes it; deleting the note takes that back too (19 Nov 2026). Restoring the note
        // does not bring the notice back: it was news once.
        if (current.shared() && !current.deleted()) notices.retractNote(cid, noteId, NoticeText.opening(repo.one(noteId).body()));
        repo.softDelete(noteId);
    }

    /** The delete toast's Undo. A note that isn't deleted answers as it is. */
    @Transactional
    public Note restore(UUID tid, UUID cid, UUID noteId) {
        lock(tid, cid, noteId);
        repo.restore(noteId);
        return repo.one(noteId);
    }

    /** A paused client is still on the portal (they cannot open it, and are not told); anyone who has not joined, or has left, is not. */
    private void requireOnPortal(UUID tid, UUID cid) {
        var membership = repo.membership(tid, cid).orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if (!"accepted".equals(membership) && !"paused".equals(membership)) {
            throw ApiException.conflict("CLIENT_NOT_ON_PORTAL", "They haven’t joined the portal yet, so there is nowhere for a shared note to go.");
        }
    }

    private ClientNoteJdbcRepository.LockedNote lock(UUID tid, UUID cid, UUID noteId) {
        return repo.lock(tid, cid, noteId).orElseThrow(() -> ApiException.notFound("That note is not on this client."));
    }
}
