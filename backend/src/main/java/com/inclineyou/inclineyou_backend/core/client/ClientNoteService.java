package com.inclineyou.inclineyou_backend.core.client;

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
 * Act, whatever it is called. Notes shared with the client are out of v1, so
 * {@code sharedWithClient} is refused.
 *
 * <p>A deleted note comes back through {@code …/restore}, never by re-POSTing its
 * id: a create that silently undeletes is a surprise.
 */
@Service
@RequiredArgsConstructor
public class ClientNoteService {

    private final ClientNoteJdbcRepository repo;
    private final ClientFileService files;

    public record Created(Note note, boolean created) {}

    public List<Note> list(UUID tid, UUID cid) {
        files.requireOwned(tid, cid);
        return repo.list(tid, cid);
    }

    @Transactional
    public Created create(UUID tid, UUID cid, CreateNoteRequest req) {
        files.requireOwned(tid, cid);
        if (req.id() != null) {
            var mine = repo.isMine(req.id(), tid, cid);
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                return new Created(repo.one(req.id()), false);
            }
        }
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        if (!repo.insert(id, tid, cid, req.body(), req.pinned())) throw ApiException.idConflict();
        return new Created(repo.one(id), true);
    }

    /** Send only what changed — {@code body}, {@code pinned}, or both. If-Match honoured when sent. */
    @Transactional
    public Note patch(UUID tid, UUID cid, UUID noteId, String ifMatch, UpdateNoteRequest req) {
        if (req.isEmpty()) throw ApiException.validation("body: send body or pinned");
        var current = lock(tid, cid, noteId);
        if (current.deleted()) throw ApiException.notFound("That note was deleted.");
        if (ClientWriteService.stale(ifMatch, current.version())) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This note changed since you opened it.");
        }
        repo.update(noteId, req);
        return repo.one(noteId);
    }

    /** Soft, and idempotent: a deleted note answers 204 again. */
    @Transactional
    public void delete(UUID tid, UUID cid, UUID noteId) {
        lock(tid, cid, noteId);
        repo.softDelete(noteId);
    }

    /** The delete toast's Undo. A note that isn't deleted answers as it is. */
    @Transactional
    public Note restore(UUID tid, UUID cid, UUID noteId) {
        lock(tid, cid, noteId);
        repo.restore(noteId);
        return repo.one(noteId);
    }

    private ClientNoteJdbcRepository.LockedNote lock(UUID tid, UUID cid, UUID noteId) {
        return repo.lock(tid, cid, noteId).orElseThrow(() -> ApiException.notFound("That note is not on this client."));
    }
}
