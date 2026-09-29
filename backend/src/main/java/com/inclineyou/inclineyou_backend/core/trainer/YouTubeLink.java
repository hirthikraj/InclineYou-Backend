package com.inclineyou.inclineyou_backend.core.trainer;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The intro video, reduced to one shape.
 *
 * A trainer pastes whatever their phone's share sheet produced, and that is six
 * different strings for the same video: {@code youtu.be/ID?t=42},
 * {@code m.youtube.com/watch?v=ID&feature=share},
 * {@code youtube.com/shorts/ID}, {@code /embed/ID}, {@code /live/ID}, and the
 * desktop watch URL with a playlist hanging off it. Storing the paste means
 * every consumer — the client's trainer card, an admin console, whatever reads
 * this next — re-implements this parse, and they will not all agree.
 *
 * So the server canonicalises once, on write:
 * {@code https://www.youtube.com/watch?v=<id>}.
 *
 * <p><b>Three things it deliberately drops.</b> A {@code t=} start offset, a
 * {@code list=} playlist, and every tracking parameter. An intro video starts at
 * the beginning and is one video — carrying an offset would make the trainer
 * card open thirty seconds into somebody's introduction, and a playlist would
 * let a link that looks like one video play a queue of forty.
 *
 * <p><b>And one thing it does not do: reach the network.</b> This validates the
 * SHAPE, never that the video exists, is public, or is the trainer's. A
 * write path that made an outbound HTTP call to YouTube would turn saving a
 * profile into a request that fails when someone else's service is down, and
 * would need a key and a quota to do properly. A dead link is a support
 * conversation; a profile that will not save is a lost trainer.
 */
public final class YouTubeLink {

    private YouTubeLink() {}

    /**
     * A video id is exactly 11 characters of URL-safe base64. Anchored, because
     * an unanchored match would happily accept the first 11 characters of a
     * 40-character tracking blob and store a link to nothing.
     */
    private static final String ID = "[A-Za-z0-9_-]{11}";

    /** {@code youtu.be/<id>} — the share-sheet default on both phones. */
    private static final Pattern SHORT = Pattern.compile(
            "^(?:https?://)?(?:www\\.)?youtu\\.be/(" + ID + ")(?:[?&#/].*)?$");

    /** {@code youtube.com/watch?v=<id>}, with the id anywhere in the query. */
    private static final Pattern WATCH = Pattern.compile(
            "^(?:https?://)?(?:www\\.|m\\.|music\\.)?youtube\\.com/watch\\?(?:.*&)?v=(" + ID + ")(?:[&#].*)?$");

    /** {@code /shorts/<id>}, {@code /embed/<id>}, {@code /live/<id>}, {@code /v/<id>}. */
    private static final Pattern PATH = Pattern.compile(
            "^(?:https?://)?(?:www\\.|m\\.|music\\.)?youtube\\.com/(?:shorts|embed|live|v)/(" + ID + ")(?:[?&#/].*)?$");

    private static final Pattern[] SHAPES = { SHORT, WATCH, PATH };

    /**
     * @return the canonical watch URL
     * @throws IllegalArgumentException if this is not a YouTube link we can read
     */
    public static String canonicalise(String raw) {
        String value = raw.trim();
        for (Pattern shape : SHAPES) {
            Matcher m = shape.matcher(value);
            if (m.matches()) return "https://www.youtube.com/watch?v=" + m.group(1);
        }
        throw new IllegalArgumentException("not a YouTube link");
    }

    /**
     * The id out of a canonical URL, for a caller that wants to embed.
     * Null-safe and total: anything this class did not write returns null.
     */
    public static String idOf(String canonical) {
        if (canonical == null) return null;
        Matcher m = WATCH.matcher(canonical);
        return m.matches() ? m.group(1) : null;
    }
}
