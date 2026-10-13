package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateMessageRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.EditMessageRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Message;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * A line from the trainer to one client (api-contract 1.2, tr-a7): write, read back, reword while it is unread, retract.
 *
 * <p>Nothing here is sent. The client sees a message in the portal, and gets a {@code note} notice if their own switch for it
 * is on. There is no reply: a client who wants to answer uses WhatsApp, which is the channel they already have with their
 * trainer. The recap is the one message with a shape of its own: a message about a session, one per session.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientMessageService {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 200;

    private final ClientMessageJdbcRepository messages;
    private final ClientNoticeJdbcRepository notices;

    /** The row and whether this call made it: 201 the first time, 200 for a replay of the same id. */
    public record Made(Message message, boolean created) {}

    @Transactional
    public Made create(UUID trainerId, UUID clientId, CreateMessageRequest req) {
        var client = messages.client(trainerId, clientId).orElseThrow(ClientMessageService::noClient);
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();

        // A replay of this trainer's own id answers the row it made, even after the client has since left the portal.
        if (req.id() != null) {
            var seen = messages.find(id);
            if (seen.isPresent()) {
                var s = seen.get();
                if (s.deleted() || !trainerId.equals(s.trainerId()) || !clientId.equals(s.clientId())) throw ApiException.idConflict();
                return new Made(s.message(), false);
            }
        }

        if (!onPortal(client.membershipStatus())) {
            throw ApiException.conflict("CLIENT_NOT_ON_PORTAL", "They haven’t joined the portal yet, so there is nowhere for a message to go.");
        }
        if (req.sessionId() != null && req.kind() != null) {
            throw ApiException.validation("kind: not with a sessionId — a message about a session is a recap");
        }
        if (req.sessionId() != null && !messages.sessionIsTheirs(clientId, req.sessionId())) {
            throw ApiException.validation("sessionId: not one of this client’s sessions");
        }
        if (req.sessionId() != null && messages.recapExists(req.sessionId())) {
            throw ApiException.conflict("RECAP_EXISTS", "There is already a note about that session. Edit it instead.");
        }
        String kind = req.sessionId() != null ? "recap" : req.kind() != null ? req.kind() : "note";

        Message row;
        try {   // two writers racing for one recap meet the unique index here
            row = messages.insert(id, trainerId, clientId, req.sessionId(), req.body(), kind);
        } catch (DuplicateKeyException e) {
            String msg = String.valueOf(e.getMostSpecificCause().getMessage());
            if (msg.contains("uq_client_message_recap")) {
                throw ApiException.conflict("RECAP_EXISTS", "There is already a note about that session. Edit it instead.");
            }
            throw ApiException.idConflict();
        }
        notices.mint(clientId, "note", NoticeText.opening(req.body()), req.sessionId());
        log.info("client message trainer={} client={} kind={}", trainerId, clientId, kind);
        return new Made(row, true);
    }

    @Transactional(readOnly = true)
    public Page<Message> list(UUID trainerId, UUID clientId, Integer limit, String cursor) {
        messages.client(trainerId, clientId).orElseThrow(ClientMessageService::noClient);
        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        var rows = messages.page(trainerId, clientId, Cursor.decode(cursor), n + 1);
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.message().id()));
        return new Page<>(page.items().stream().map(ClientMessageJdbcRepository.PageRow::message).toList(), page.nextCursor());
    }

    /** Only while the client has not opened it: after that the words are what they read, and changing them would rewrite it. */
    @Transactional
    public Message edit(UUID trainerId, UUID clientId, UUID messageId, EditMessageRequest req, String ifMatch) {
        messages.client(trainerId, clientId).orElseThrow(ClientMessageService::noClient);
        var stored = ownedLocked(trainerId, clientId, messageId);
        if (stored.deleted()) throw noMessage();
        if (IfMatch.stale(ifMatch, stored.message().version())) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED", "This message changed since you opened it.");
        }
        if (stored.message().readAt() != null) {
            throw ApiException.conflict("MESSAGE_ALREADY_READ", "They have already opened it, so it can’t be reworded. Write a new one.");
        }
        return messages.updateBody(messageId, req.body());
    }

    /** Allowed at any time. A repeat is a 204; 404 only when there never was such a message. */
    @Transactional
    public void delete(UUID trainerId, UUID clientId, UUID messageId) {
        messages.client(trainerId, clientId).orElseThrow(ClientMessageService::noClient);
        var stored = ownedLocked(trainerId, clientId, messageId);
        if (!stored.deleted()) messages.softDelete(messageId);
    }

    private ClientMessageJdbcRepository.Stored ownedLocked(UUID trainerId, UUID clientId, UUID messageId) {
        var stored = messages.lock(messageId).orElseThrow(ClientMessageService::noMessage);
        // Another trainer's message and one on another client look like one that never existed.
        if (!trainerId.equals(stored.trainerId()) || !clientId.equals(stored.clientId())) throw noMessage();
        return stored;
    }

    /** A paused client is still on the portal; they simply cannot open it until the trainer resumes them. */
    private static boolean onPortal(String membership) {
        return "accepted".equals(membership) || "paused".equals(membership);
    }

    private static ApiException noClient() {
        return ApiException.notFound("That client is not on your roster.");
    }

    private static ApiException noMessage() {
        return ApiException.notFound("That message is not there.");
    }
}
