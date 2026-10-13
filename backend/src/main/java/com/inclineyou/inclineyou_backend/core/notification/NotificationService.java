package com.inclineyou.inclineyou_backend.core.notification;

import com.inclineyou.inclineyou_backend.core.notification.dto.Bell;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.UUID;

/**
 * {@code GET /v1/notifications} and {@code POST /v1/notifications/seen} (api-contract 1.2, tr-b1) — the trainer's bell.
 *
 * <p>Derived, never stored: there is no notification table for the trainer. That is what makes <i>Priya joined</i> appear once
 * (it is the one row that says she did) and <i>left</i> appear once, plainly and without blame. The read-mark is one column.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    static final int DEFAULT_LIMIT = 30;
    static final int MAX_LIMIT = 100;

    private final NotificationJdbcRepository repo;

    @Transactional(readOnly = true)
    public Bell bell(UUID trainerId, Integer limit) {
        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        Timestamp seen = repo.seenAt(trainerId);
        return new Bell(repo.events(trainerId, n), repo.unread(trainerId, seen), seen == null ? null : seen.getTime());
    }

    @Transactional
    public void markSeen(UUID trainerId) {
        repo.markSeen(trainerId);
    }
}
