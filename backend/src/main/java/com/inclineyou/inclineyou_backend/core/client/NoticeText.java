package com.inclineyou.inclineyou_backend.core.client;

/**
 * The words of a notice that points at something the trainer wrote — a message, a shared note.
 *
 * <p>{@code client_notification.text} is 160 characters, and a notice is a pointer into the portal rather than a second copy
 * of a long note, so it carries the opening, on one line, with an ellipsis where it was cut.
 */
final class NoticeText {

    static final int MAX = 160;

    private NoticeText() {}

    static String opening(String body) {
        String line = body.replaceAll("\\s+", " ").strip();
        return line.length() <= MAX ? line : line.substring(0, MAX - 1).stripTrailing() + "…";
    }
}
