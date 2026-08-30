package com.xrep.xrep_backend.trainer;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The two social profiles, reduced to one shape each — V35.
 *
 * This is {@link YouTubeLink}'s sibling and deliberately not
 * {@code TrainerService.mapLink}'s. The seam between the three is worth stating
 * once, because "be consistent with the field next to it" points in both
 * directions here and only one of them is right:
 *
 * <ul>
 *   <li>a <b>video</b> reduces to an 11-character id — the whole fact;</li>
 *   <li>a <b>profile</b> reduces to a handle — also the whole fact, which is
 *       why these two are canonicalised;</li>
 *   <li>a <b>place</b> does not reduce to anything. A maps URL carries a place
 *       id, coordinates and sometimes a plus code, in shapes that differ per
 *       provider, so V34 stores it verbatim.</li>
 * </ul>
 *
 * <p><b>What canonicalising buys.</b> A trainer pastes what their phone's share
 * sheet produced, and for Instagram that is
 * {@code instagram.com/ravi.trains?igsh=MXY3…} — a share TOKEN, on a profile a
 * client reads, in a column that will outlive it. Typing {@code @ravi.trains}
 * bare is just as likely and is not a URL at all. Three spellings of one
 * account become one string here, once, rather than in every consumer that ever
 * renders it.
 *
 * <p><b>What it must not do: rewrite the identifying part.</b> A YouTube
 * channel is addressable four ways — {@code /@handle}, {@code /channel/UC…},
 * {@code /c/name}, {@code /user/name} — and they are NOT interchangeable:
 * mapping one to another needs a lookup against YouTube. So the path is kept
 * exactly as given and only the host, the scheme and the query are normalised.
 * The same discipline as {@code YouTubeLink}: validate the shape, never reach
 * the network. A dead link is a support conversation; a profile that will not
 * save is a lost trainer.
 */
final class SocialLink {

    private SocialLink() {}

    /**
     * An Instagram handle: 1-30 of letters, digits, dot, underscore.
     *
     * The real service also forbids a leading or trailing dot and two dots in a
     * row. Not enforced here — we are validating a paste, not registering an
     * account, and a rule copied from somebody else's signup form is a rule that
     * silently goes stale and starts refusing valid handles.
     */
    private static final String IG_HANDLE = "[A-Za-z0-9._]{1,30}";

    /** {@code @handle} or a bare {@code handle} — what a trainer types from memory. */
    private static final Pattern IG_BARE = Pattern.compile("^@?(" + IG_HANDLE + ")$");

    /** Any {@code instagram.com/<handle>} URL, with or without scheme, www, trailing slash, query. */
    private static final Pattern IG_URL = Pattern.compile(
            "^(?:https?://)?(?:www\\.|m\\.)?instagram\\.com/(" + IG_HANDLE + ")/?(?:[?#].*)?$",
            Pattern.CASE_INSENSITIVE);

    /**
     * Paths on instagram.com that are NOT somebody's profile.
     *
     * A trainer who pastes a link to their best reel is making the single most
     * likely mistake this field has, and without this it would be stored as a
     * profile URL that opens one video and never their account. Refusing it
     * produces a sentence they can act on.
     */
    private static final java.util.Set<String> IG_RESERVED = java.util.Set.of(
            "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct");

    /** A YouTube handle URL — {@code /@name}. The current shape, and the one a share sheet emits. */
    private static final Pattern YT_HANDLE = Pattern.compile(
            "^(?:https?://)?(?:www\\.|m\\.)?youtube\\.com/(@[A-Za-z0-9._-]{3,30})/?(?:[?#].*)?$",
            Pattern.CASE_INSENSITIVE);

    /** The three older addressing shapes — {@code /channel/UC…}, {@code /c/name}, {@code /user/name}. */
    private static final Pattern YT_PATH = Pattern.compile(
            "^(?:https?://)?(?:www\\.|m\\.)?youtube\\.com/((?:channel|c|user)/[A-Za-z0-9._-]{1,60})/?(?:[?#].*)?$",
            Pattern.CASE_INSENSITIVE);

    /** A bare {@code @handle}, typed from memory the way the Instagram one is. */
    private static final Pattern YT_BARE = Pattern.compile("^(@[A-Za-z0-9._-]{3,30})$");

    /**
     * @return canonical {@code https://www.instagram.com/<handle>}
     * @throws IllegalArgumentException if this is not a profile we can read
     */
    static String instagram(String raw) {
        String value = raw.trim();

        Matcher url = IG_URL.matcher(value);
        if (url.matches()) {
            String handle = url.group(1);
            if (IG_RESERVED.contains(handle.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("not a profile");
            }
            return "https://www.instagram.com/" + handle;
        }

        Matcher bare = IG_BARE.matcher(value);
        // A bare word is only read as a handle when it cannot be anything else.
        // "instagram.com" itself matches IG_HANDLE's alphabet, and a URL for
        // some other site would too, so anything holding a slash or a scheme has
        // already had its chance above.
        if (bare.matches() && !value.contains("/") && !value.contains(":") && !value.contains(".com")) {
            return "https://www.instagram.com/" + bare.group(1);
        }

        throw new IllegalArgumentException("not an Instagram profile");
    }

    /**
     * @return canonical {@code https://www.youtube.com/<path>}, the path kept as given
     * @throws IllegalArgumentException if this is not a channel we can read
     */
    static String youtube(String raw) {
        String value = raw.trim();

        Matcher handle = YT_HANDLE.matcher(value);
        if (handle.matches()) return "https://www.youtube.com/" + handle.group(1);

        Matcher path = YT_PATH.matcher(value);
        if (path.matches()) return "https://www.youtube.com/" + path.group(1);

        Matcher bare = YT_BARE.matcher(value);
        if (bare.matches()) return "https://www.youtube.com/" + bare.group(1);

        throw new IllegalArgumentException("not a YouTube channel");
    }

    /**
     * Is this a link to one VIDEO rather than a channel?
     *
     * Asked only so the refusal can name the mistake. A trainer pasting a watch
     * URL here has pasted it one field too far down — {@code introVideoUrl} is
     * the field that wants it — and "that is a video, not a channel" is a
     * sentence they can act on where "not a YouTube channel" is not.
     */
    static boolean isVideo(String raw) {
        try {
            YouTubeLink.canonicalise(raw);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * The handle out of a canonical URL, for a caller that wants to render
     * {@code @ravi.trains} rather than a URL.
     *
     * On the wire for the same reason {@code introVideoId} is: so neither half
     * re-implements a parse this class already did. Null-safe and total —
     * anything this class did not write returns null, and a {@code /channel/UC…}
     * URL has no handle to show, which is an honest null rather than a made-up
     * one.
     */
    static String handleOf(String canonical) {
        if (canonical == null) return null;
        Matcher ig = IG_URL.matcher(canonical);
        if (ig.matches()) return "@" + ig.group(1);
        Matcher yt = YT_HANDLE.matcher(canonical);
        if (yt.matches()) return yt.group(1);
        return null;
    }
}
