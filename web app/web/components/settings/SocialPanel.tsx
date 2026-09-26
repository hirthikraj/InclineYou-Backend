'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { SaveRow } from '@/components/settings/IdentityForm';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveSocialLinks } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';
import {
  MAX_SOCIAL_LINK,
  looksLikeInstagram,
  looksLikeVideo,
  looksLikeYouTubeChannel,
} from '@/lib/profile/social';

/**
 * SOCIAL LINKS — the profile's seventh and last tab, V35.
 *
 * ## Why this section exists at all
 *
 * The six tabs before it are the trainer's own account of themselves: what they
 * coach, where, for how long, in which languages. Every one of them is a claim
 * this product cannot check. A client deciding whether to reply to an invite
 * wants one thing none of those can give them — **evidence** — and they are
 * going to go looking for it on Instagram whether or not we link it.
 *
 * So we link it. A trainer's feed is years of gym-floor video shot by somebody
 * who was not trying to sell that particular client anything, and it settles the
 * question the bio can only assert. **Clients following their trainer is a good
 * outcome for everybody**: the audience is the trainer's, this product has no
 * business sitting between them, and a profile that omitted the one link every
 * client looks for anyway would only be teaching them to go and search.
 *
 * ## Three decisions in the fields
 *
 * **Two named platforms, not a list of links.** Instagram and YouTube are what
 * an Indian personal trainer actually posts to. A generic *add a link* row would
 * need a platform catalogue to draw an icon, would collect one trainer's "insta"
 * beside another's "Instagram", and could not check that a row was a real
 * profile URL. `V35__trainer_social_links.sql` carries the full argument. A
 * third platform is a migration, and that is the honest price of being able to
 * validate and render these exactly.
 *
 * **A handle is enough.** `@ravi.trains` is what a trainer knows by heart; the
 * URL is what their phone's share sheet produces, tracking token and all. Both
 * are accepted and the server reduces them to one string, which is why the field
 * shows what was actually stored after a save rather than leaving the paste
 * sitting there looking authoritative.
 *
 * **Nothing is fetched.** No follower count, no profile picture, no check that
 * the account exists — the same discipline `YouTubeLink` states for the intro
 * video. A settings form that made an outbound request to Instagram would fail
 * when somebody else's service was down, and a profile that will not save is a
 * far worse outcome than a link that has gone stale.
 *
 * ## And what it does NOT do
 *
 * There is no *share my profile* anywhere on this screen, because there is
 * nothing to share yet: the client-facing profile page is not built, and the
 * columns behind these tabs are read today by an invite and by nothing else.
 * This tab collects the answer for the moment that page exists — the same
 * position V33's bio and V34's modes are in, and the reason none of the three
 * is allowed to make the product branch on them.
 */
export function SocialPanel({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState(initial);
  const [instagram, setInstagram] = useState(initial.instagramUrl);
  const [youtube, setYoutube] = useState(initial.youtubeUrl);
  // Which fields have been left, so a half-typed handle is never called wrong
  // while it is still being typed. The same `onBlur` gate the map link uses.
  const [touched, setTouched] = useState<{ ig: boolean; yt: boolean }>({ ig: false, yt: false });
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const publish = usePublishDraft();

  /* THE HANDLES ARE PUBLISHED AS NULL, AND THAT IS THE HONEST VALUE.
     `instagramHandle` is derived SERVER-SIDE on write — this half has never
     parsed a social URL and `lib/profile/social.ts` says why — so while a link
     is being typed there is no handle to show. `ProfileCard` falls back to the
     platform's name for exactly this case, so the card reads *Instagram* until
     the save comes back with `@ravi.trains`. Guessing the handle here would put
     a second, looser parser in front of the one the server actually uses. */
  useEffect(() => {
    publish({
      instagramUrl: instagram,
      youtubeUrl: youtube,
      instagramHandle: instagram === saved.instagramUrl ? saved.instagramHandle : null,
      youtubeHandle: youtube === saved.youtubeUrl ? saved.youtubeHandle : null,
    });
  }, [publish, instagram, youtube, saved]);

  const ig = instagram.trim();
  const yt = youtube.trim();
  const igBroken = touched.ig && ig.length > 0 && !looksLikeInstagram(ig);
  const ytBroken = touched.yt && yt.length > 0 && !looksLikeYouTubeChannel(yt);
  const dirty = instagram !== saved.instagramUrl || youtube !== saved.youtubeUrl;

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await saveSocialLinks({ instagramUrl: instagram, youtubeUrl: youtube });
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      // The stored value is not the pasted one — the server strips the share
      // token and reduces a bare handle to a URL. Showing the record back is
      // the whole reason the action returns it.
      setSaved(result.identity);
      setInstagram(result.identity.instagramUrl);
      setYoutube(result.identity.youtubeUrl);
      setTouched({ ig: false, yt: false });
      const count = [result.identity.instagramUrl, result.identity.youtubeUrl].filter(Boolean).length;
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest:
          count === 0
            ? 'Your profile no longer links anywhere.'
            : 'Clients can see what you post before they reply to an invite.',
      });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="card__t">Where a client can look you up</h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 560 }}>
        Everything else on this profile is what you say about yourself. This is where a client goes
        to check — and most of them will, invite or no invite. Both are optional, and both are
        yours: we do not repost, count followers, or come between you and anyone who follows you.
      </p>

      {/* ── instagram ────────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 22, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-instagram">
          Instagram <Optional />
        </label>
        <input
          className="ctl"
          id="pf-instagram"
          value={instagram}
          maxLength={MAX_SOCIAL_LINK}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@yourname"
          disabled={pending}
          onBlur={() => setTouched((t) => ({ ...t, ig: true }))}
          onChange={(e) => {
            setInstagram(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-instagram-h"
        />
        {igBroken ? (
          <p className="fld__e" style={{ marginTop: 6 }} id="pf-instagram-h">
            {/* Named rather than generic: a link to one post is the mistake this
                field actually gets, and it looks completely right until a client
                taps it and lands on a single reel. */}
            {/reel|\/p\//i.test(ig)
              ? 'That is a link to one post. This field wants your account — @yourname.'
              : 'That doesn’t look like an Instagram profile. Your handle on its own works.'}
          </p>
        ) : (
          <span className="fld__h" id="pf-instagram-h">
            Your handle, or the link from your profile — either is fine, we tidy it up.{' '}
            <SavedAs url={saved.instagramUrl} handle={saved.instagramHandle} current={instagram} />
          </span>
        )}
      </div>

      {/* ── youtube ──────────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 18, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-youtube">
          YouTube <Optional />
        </label>
        <input
          className="ctl"
          id="pf-youtube"
          value={youtube}
          maxLength={MAX_SOCIAL_LINK}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@yourchannel"
          disabled={pending}
          onBlur={() => setTouched((t) => ({ ...t, yt: true }))}
          onChange={(e) => {
            setYoutube(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-youtube-h"
        />
        {ytBroken ? (
          <p className="fld__e" style={{ marginTop: 6 }} id="pf-youtube-h">
            {looksLikeVideo(yt)
              ? 'That is a link to one video. This field wants your channel — a single video goes on the Identity tab.'
              : 'That doesn’t look like a YouTube channel. Your handle on its own works.'}
          </p>
        ) : (
          <span className="fld__h" id="pf-youtube-h">
            Your channel, not a video — the Identity tab is where one intro video goes.{' '}
            <SavedAs url={saved.youtubeUrl} handle={saved.youtubeHandle} current={youtube} />
          </span>
        )}
      </div>

      <MessageSlot message={message} />

      <SaveRow
        pending={pending}
        dirty={dirty}
        note="Clients check these before they reply to an invite."
      />
    </form>
  );
}

/**
 * What the server actually stored, and a way to check it.
 *
 * Only while the field still holds the saved value — mid-edit it would be
 * pointing at an account the trainer is in the middle of replacing. The handle
 * is preferred over the URL where there is one, because `@ravi.trains` is how
 * the trainer thinks of the account; a `/channel/UC…` URL has no handle and
 * says so by showing the link instead.
 */
function SavedAs({
  url,
  handle,
  current,
}: {
  url: string;
  handle: string | null;
  current: string;
}) {
  if (!url || url !== current) return null;
  return (
    <>
      Saved as{' '}
      <a href={url} target="_blank" rel="noreferrer noopener">
        {handle ?? url.replace(/^https:\/\/(www\.)?/, '')}
      </a>
      .
    </>
  );
}

/** The same inline marker every other tab uses. */
function Optional() {
  return <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>;
}
