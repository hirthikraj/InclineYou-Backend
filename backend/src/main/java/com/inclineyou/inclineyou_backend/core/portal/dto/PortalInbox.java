package com.inclineyou.inclineyou_backend.core.portal.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * The client's inbox wire (api-contract 1.2, pi-l1 … pi-a2): what the trainer wrote to them, what the trainer chose to share, and the bell.
 * Three different things, kept apart on purpose, and none of them a chat — there is no reply; WhatsApp is the way back.
 */
public final class PortalInbox {

    private PortalInbox() {}

    public record Message(String id, String kind, String body, long at, Long readAt, String sessionId, String trainerName) {}

    public record MessagePage(List<Message> items, String nextCursor) {}

    public record Note(String id, String text, long sharedAt, long createdAt, String authorName) {}

    public record NotePage(List<Note> items, String nextCursor) {}

    /** {@code amount} is a price and rides only when the trainer lets this client see money. */
    public record Notice(String id, String kind, String text, long at, Long readAt, String sessionId, Long subjectAt, BigDecimal amount) {}

    public record NoticePage(List<Notice> items, int unreadCount, String nextCursor) {}

    /** {@code {ids: […]}} or {@code {all: true}}. Anything not the caller's and unread is ignored, so a stale list cannot fail. */
    public record Read(@Size(max = 100, message = "at most 100 ids") List<String> ids, Boolean all) {}
}
