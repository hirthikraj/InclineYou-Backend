package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalInbox;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * What the trainer wrote, what they chose to share, and the bell (api-contract 1.2, pi-l1 … pi-a2). No reply, no chat: a client who wants to answer
 * uses WhatsApp. Reading is a write only to {@code read_at}, once — and whether a message has been read goes back to the trainer.
 */
@Service
@RequiredArgsConstructor
public class PortalInboxService {

    private final PortalInboxJdbcRepository repo;
    private final PortalJdbcRepository portal;
    private final PortalAccess access;

    private String trainerName(String phone) {
        return PortalHomeService.text(portal.wall(phone).orElseThrow().path("trainer"), "name");
    }

    private static int bound(int limit) {
        return Math.max(1, Math.min(limit, 50));
    }

    private static <R> String next(boolean more, List<R> page, Function<R, java.sql.Timestamp> at, Function<R, String> id) {
        return more ? Cursor.encode(Cursor.key(at.apply(page.getLast())), id.apply(page.getLast())) : null;
    }

    public PortalInbox.MessagePage messages(String phone, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        int n = bound(limit);
        var c = Cursor.decode(rawCursor);
        var rows = repo.messages(client, c == null ? null : c.keyAsTimestamp(), c == null ? null : c.id(), n + 1, trainerName(phone));
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        return new PortalInbox.MessagePage(page.stream().map(PortalInboxJdbcRepository.MessageRow::item).toList(),
                next(more, page, PortalInboxJdbcRepository.MessageRow::at, r -> r.item().id()));
    }

    @Transactional
    public void readMessage(String phone, UUID id) {
        if (!repo.markMessageRead(access.clientId(phone), id)) throw ApiException.notFound("That message isn’t yours.");
    }

    public PortalInbox.NotePage notes(String phone, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        int n = bound(limit);
        var c = Cursor.decode(rawCursor);
        var rows = repo.notes(client, c == null ? null : c.keyAsTimestamp(), c == null ? null : c.id(), n + 1, trainerName(phone));
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        return new PortalInbox.NotePage(page.stream().map(PortalInboxJdbcRepository.NoteRow::item).toList(),
                next(more, page, PortalInboxJdbcRepository.NoteRow::key, r -> r.item().id()));
    }

    public PortalInbox.NoticePage notices(String phone, boolean unreadOnly, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        int n = bound(limit);
        var c = Cursor.decode(rawCursor);
        var rows = repo.notices(client, unreadOnly, c == null ? null : c.keyAsTimestamp(), c == null ? null : c.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        return new PortalInbox.NoticePage(page.stream().map(PortalInboxJdbcRepository.NoticeRow::item).toList(), repo.unreadCount(client),
                next(more, page, PortalInboxJdbcRepository.NoticeRow::at, r -> r.item().id()));
    }

    @Transactional
    public void readNotices(String phone, PortalInbox.Read req) {
        UUID client = access.clientId(phone);
        boolean all = Boolean.TRUE.equals(req.all());
        boolean ids = req.ids() != null && !req.ids().isEmpty();
        if (all == ids) throw ApiException.validation("send either ids or all: true");
        if (all) {
            repo.markAllNoticesRead(client);
            return;
        }
        var parsed = new java.util.ArrayList<UUID>();
        for (String s : req.ids()) {
            try {
                parsed.add(UUID.fromString(s.strip()));
            } catch (IllegalArgumentException | NullPointerException e) {
                throw ApiException.validation("ids: not an id");
            }
        }
        repo.markNoticesRead(client, parsed);
    }
}
