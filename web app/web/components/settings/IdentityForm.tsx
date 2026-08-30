'use client';

import { useRef, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import type { Message } from '@/lib/auth/copy';
import {
  CERTIFICATIONS,
  EXPERIENCE_BANDS,
  LANGUAGES,
  NOT_CERTIFIED,
  SPECIALITIES,
  avatarTint,
  initialsOf,
  labelFor,
  labelList,
} from '@/lib/setup/options';
import { saveIdentity } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';
import { modeLabel } from '@/lib/profile/work';
import {
  BIO_CHARS_WARN_FROM,
  BIO_WORDS_MAX,
  BIO_WORDS_MIN,
  HEADLINE_COUNTER_FROM,
  MAX_BIO,
  MAX_HEADLINE,
  MAX_NAME,
  canonicalVideoId,
  wordCount,
} from '@/lib/profile/identity';

/**
 * IDENTITY — the profile's first tab, and the four fields a CLIENT reads.
 *
 * Setup collects two of them (the name, and the headline beside it) because
 * that flow promises about a minute over eight steps and a 200-word bio inside
 * it is the SURPRISE its pre-flight screen exists to prevent. The other two are
 * only ever asked for here. But this tab edits **all four**, because
 * `AGENTS.md` states the rule and this screen was the first to implement it: *a
 * finished profile is Settings' to edit* — which is exactly why `/setup`
 * redirects a `setupComplete` trainer to `/today`. A Settings screen that could
 * edit half the identity and sent the trainer back into a redirecting flow for
 * the rest would be a dead end wearing a link.
 *
 * ## Three decisions in the fields
 *
 * **The bio's placeholder is a whole example bio, not a description of one.**
 * The brief for this field named the failure precisely — *trainers write nothing
 * or an essay* — and a `placeholder="Tell clients about yourself"` produces both:
 * it says what to type and nothing about how much, so the confident write 400
 * words and everybody else writes none. Seventy words of a real trainer's
 * introduction sets the length, the register and the subject matter in the one
 * place a blank field is actually being read.
 *
 * **The counter reports WORDS until the cap is near, then characters.** The ask
 * is 100-200 words; the enforcement is 1200 characters. A person writes to the
 * first and a column can only promise the second, so the counter says whichever
 * is the useful thing at that moment rather than showing two numbers at once. It
 * is never a warning — under 100 words it reads *"aim for 100-200"*, not
 * *"too short"*, because nothing here is refused for being brief.
 *
 * **The video is a link and stays a link.** No embedded player, no thumbnail
 * fetched from YouTube: this screen writes a profile, and a preview that needed
 * an outbound request would make a settings form depend on somebody else's
 * uptime. What it does show is that the server understood it — the canonical URL
 * comes back on save, and it is a different string from the paste.
 *
 * ## The preview belongs to this tab, and it shows more than this tab edits
 *
 * The card is live: it redraws as the name and the headline are typed, which is
 * the whole reason it sits inside the form rather than in the layout above the
 * tabs. It also draws **every other tab's answer** — the experience band, the
 * languages, the specialities and the certifications — all read-only here,
 * because the card answers *how clients see you* and a client sees all of it.
 * The alternative is a preview that quietly omits five-sixths of the profile,
 * which is a preview that cannot be trusted, and the one thing a preview has to
 * be.
 *
 * It is read-only rather than a set of shortcuts into the other tabs on
 * purpose. A chip that both previewed an answer and edited it would make this
 * tab able to write four columns it does not own, which is exactly the
 * cross-tab clobber `lib/profile/actions.ts` splits the save to prevent.
 *
 * ## And one about the save
 *
 * **One button, not autosave.** A bio that saved as it was typed would store a
 * half-written sentence a few times a minute. The button is disabled only while
 * a save is in flight — never for "nothing changed", which is a dead button the
 * trainer has to guess the reason for. The unsaved marker beside it earns its
 * place now that the tabs are routes: switching tab is a navigation, and a
 * navigation takes unsaved edits with it.
 */
export function IdentityForm({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [video, setVideo] = useState(initial.introVideoUrl);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const nameInput = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const initials = initialsOf(name);
  const words = wordCount(bio);
  const charsLeft = MAX_BIO - bio.length;
  // The live preview reads the canonical URL, which only exists after a save —
  // see `canonicalVideoId`. An unsaved paste honestly shows nothing rather than
  // this file guessing at the six shapes `YouTubeLink.java` already reduces.
  const videoId = canonicalVideoId(video) ?? (video === saved.introVideoUrl ? saved.introVideoId : null);
  const dirty =
    name !== saved.name ||
    headline !== saved.headline ||
    bio !== saved.bio ||
    video !== saved.introVideoUrl;

  // "Not certified yet" is a real answer and it belongs on the preview, but not
  // as a credential chip: a tag reading *Not certified yet* beside somebody's
  // name renders an honest answer as a badge of failure. Certificates get tags;
  // that one gets a quiet line.
  const badges = saved.certifications.filter((id) => id !== NOT_CERTIFIED);
  const declaredNone = saved.certifications.includes(NOT_CERTIFIED);

  // The other tabs' answers, as one line. Absent parts are dropped rather than
  // drawn as a placeholder: an unanswered field on a PREVIEW would be telling
  // the trainer a client sees something that is not there.
  const band = EXPERIENCE_BANDS.find((b) => b.id === saved.experienceBand)?.label ?? '';
  const meta = [band, saved.languages.length > 0 ? labelList(saved.languages, LANGUAGES, 4) : '']
    .filter(Boolean)
    .join(' · ');

  // The Work & hours tab's answers, as one more line. How you coach comes
  // before where, because a client who cannot get to a gym has already decided
  // by the time they read the neighbourhood.
  // The Social links tab's answers, as the card's last line. Handles rather
  // than URLs — `@ravi.trains` is what a client would recognise, and the server
  // derives it so this half never parses the URL. A `/channel/UC…` link has no
  // handle, so it falls back to the platform's name rather than printing 40
  // characters of channel id on a preview card.
  const socials: { label: string; url: string }[] = [
    saved.instagramUrl
      ? { label: saved.instagramHandle ?? 'Instagram', url: saved.instagramUrl }
      : null,
    saved.youtubeUrl ? { label: saved.youtubeHandle ?? 'YouTube', url: saved.youtubeUrl } : null,
  ].filter((s): s is { label: string; url: string } => s !== null);

  const how = saved.trainingModes.map(modeLabel).join(' · ');
  const where = [
    saved.gymName,
    // Three, then a count. A tag row of ten neighbourhoods is a paragraph
    // wearing chips, and the preview's job is to show the shape of the profile.
    saved.serviceAreas.length > 3
      ? `${saved.serviceAreas.slice(0, 3).join(', ')} +${saved.serviceAreas.length - 3}`
      : saved.serviceAreas.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');

  function submit() {
    if (trimmedName.length === 0) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Your name is the one thing we can’t skip.',
        rest: 'A client receiving an invite has to see who it is from.',
      });
      nameInput.current?.focus();
      return;
    }
    setMessage(null);
    start(async () => {
      const result = await saveIdentity({ name, headline, bio, introVideoUrl: video });
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      // The server canonicalises the video URL, so what was typed and what is
      // now stored are different strings. Showing the record back is the point
      // of returning it.
      setSaved(result.identity);
      setName(result.identity.name);
      setHeadline(result.identity.headline);
      setBio(result.identity.bio);
      setVideo(result.identity.introVideoUrl);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest: 'This is what a client sees when you invite them.',
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
      {/* The card is the preview, and it is the same object `NameForm` draws in
          setup — same `.av`, same tint function, so the trainer meets one idea
          of themselves in both places. */}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card__hd">
          <span className="card__t">How clients see you</span>
        </div>
        <div className="card__b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <span className="av av--lg" style={{ background: avatarTint(name || saved.phone) }}>
              {initials || '—'}
            </span>
            {/* `minWidth:0` so a long headline ellipses instead of pushing the
                avatar out — a flex item's min-width is `auto`. */}
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{trimmedName || 'Your name'}</b>
              <span
                className="small"
                style={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {headline.trim() || 'Your one line goes here.'}
              </span>
            </span>
          </div>

          {meta ? (
            <p className="small" style={{ marginTop: 10 }}>
              {meta}
            </p>
          ) : null}

          {/* Specialities lead, because they are the first thing a client reads
              after a name. Plain tags and no qualifier — unlike the row below,
              nobody is claiming these were checked by anyone. */}
          {saved.specialities.length > 0 ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {saved.specialities.map((id) => (
                <span className="tag" key={id}>
                  {labelFor(id, SPECIALITIES)}
                </span>
              ))}
            </div>
          ) : null}

          {/* The Certifications tab's callout promises we say *self-declared* on
              the profile too. This is the profile — so it says it, and the
              promise stops being a claim with nothing behind it. */}
          {badges.length > 0 ? (
            <div
              className="row"
              style={{ flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}
            >
              {badges.map((id) => (
                <span className="tag" key={id}>
                  {labelFor(id, CERTIFICATIONS)}
                </span>
              ))}
              <span className="small">Self-declared</span>
            </div>
          ) : declaredNone ? (
            <p className="small" style={{ marginTop: 10 }}>
              No certifications listed — which plenty of excellent trainers don’t have.
            </p>
          ) : null}

          {/* Read-only, like every other borrowed answer on this card — the
              Work & hours tab owns these and this one draws them. A tag here
              that opened another tab would be a shortcut out of a half-typed
              bio, which is what the unsaved marker exists to warn about. */}
          {how || where ? (
            <p className="small" style={{ marginTop: 10 }}>
              {[how, where].filter(Boolean).join(' — ')}
            </p>
          ) : null}

          {/* Real links, unlike every other borrowed answer on this card. A
              trainer checking their own preview is exactly the person who should
              find out that the handle they typed opens the wrong account, and
              the only way to find that out is to follow it. */}
          {socials.length > 0 ? (
            <p className="small" style={{ marginTop: 10 }}>
              {socials.map((s, i) => (
                <span key={s.url}>
                  {i > 0 ? ' · ' : ''}
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <p className="small" style={{ marginTop: 8, maxWidth: 560 }}>
        Your initials stand in until profile photos arrive.
      </p>

      {/* ── name ─────────────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 22, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-name">
          Name
        </label>
        <input
          className="ctl"
          id="pf-name"
          ref={nameInput}
          value={name}
          maxLength={MAX_NAME}
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Ravi Kannan"
          disabled={pending}
          onChange={(e) => {
            setName(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-name-h"
        />
        <span className="fld__h" id="pf-name-h">
          Personal or the name you trade under — whichever your clients already know. It is on
          every invite and receipt you send.
        </span>
      </div>

      {/* ── headline ─────────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 18, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-headline">
          Headline <Optional />
        </label>
        <input
          className="ctl"
          id="pf-headline"
          value={headline}
          maxLength={MAX_HEADLINE}
          autoComplete="off"
          autoCapitalize="sentences"
          placeholder="Strength & fat-loss coach · Indiranagar"
          disabled={pending}
          onChange={(e) => {
            setHeadline(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-headline-h"
        />
        <span className="fld__h" id="pf-headline-h">
          What you coach, and where. One line, under your name.
          {headline.length >= HEADLINE_COUNTER_FROM ? (
            <>
              {' '}
              <b className="mono">{MAX_HEADLINE - headline.length}</b> characters left.
            </>
          ) : null}
        </span>
      </div>

      {/* ── bio ──────────────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 18, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-bio">
          About you <Optional />
        </label>
        <textarea
          className="ctl"
          id="pf-bio"
          rows={8}
          value={bio}
          maxLength={MAX_BIO}
          disabled={pending}
          placeholder={BIO_PLACEHOLDER}
          onChange={(e) => {
            setBio(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-bio-h"
        />
        <span className="fld__h" id="pf-bio-h">
          {/* Never a warning below the guidance — nothing here is refused for
              being brief, and "too short" on an optional field is an accusation
              for answering it. */}
          {bio.length >= BIO_CHARS_WARN_FROM ? (
            <>
              <b className="mono">{charsLeft}</b> characters left.
            </>
          ) : words === 0 ? (
            <>
              How you coach, who you coach, and what a client can expect. Aim for{' '}
              {BIO_WORDS_MIN}–{BIO_WORDS_MAX} words.
            </>
          ) : (
            <>
              <b className="mono">{words}</b> {words === 1 ? 'word' : 'words'} — aim for{' '}
              {BIO_WORDS_MIN}–{BIO_WORDS_MAX}.
            </>
          )}
        </span>
      </div>

      {/* ── intro video ──────────────────────────────────────────────────── */}
      <div className="fld" style={{ marginTop: 18, maxWidth: 560 }}>
        <label className="fld__l" htmlFor="pf-video">
          Intro video <Optional />
        </label>
        <input
          className="ctl"
          id="pf-video"
          type="url"
          inputMode="url"
          value={video}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://youtu.be/…"
          disabled={pending}
          onChange={(e) => {
            setVideo(e.target.value);
            if (message) setMessage(null);
          }}
          aria-describedby="pf-video-h"
        />
        <span className="fld__h" id="pf-video-h">
          A YouTube link, if you have one. Paste it from the video’s Share button — we tidy it up.
          {videoId ? (
            <>
              {' '}
              Saved as{' '}
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                youtube.com/watch?v={videoId}
              </a>
              .
            </>
          ) : null}
        </span>
      </div>

      <MessageSlot message={message} />

      <SaveRow pending={pending} dirty={dirty} note="Clients see this before they accept an invite." />
    </form>
  );
}

/**
 * The save row every profile tab draws.
 *
 * ── THERE IS NO BUTTON UNTIL THERE IS SOMETHING TO SAVE ─────────────────────
 *
 * It used to be always live, and that left the primary with no good answer for
 * being pressed with no edits in hand. Every available answer was bad: write
 * the unchanged values back, which on the Work tab would have flattened a
 * working week nobody touched; answer "Saved." having saved nothing; or print a
 * *Nothing to save* notice, which is a screen explaining a button it drew
 * itself. **Nothing to do is better said by there being nothing to press.**
 *
 * This is NOT the greyed-out primary `NameForm` argues against, and the
 * difference is what the button would have said. In setup, Continue stays live
 * on an incomplete step because pressing it is how a trainer finds out *what is
 * missing* — the click has work to do. Here, with nothing edited, the click has
 * none, and a disabled button would sit there implying otherwise.
 *
 * ── AND THE UNSAVED MARKER IS NOT DECORATION ────────────────────────────────
 *
 * Before the tabs it would have been — the profile was one page with one button
 * and nowhere to go with edits in hand. Now every tab is a route, so
 * *Certifications* is a navigation away from a half-typed bio, and the only
 * honest thing is to say so before the click rather than after it.
 */
export function SaveRow({
  pending,
  dirty,
  note,
  unsaved,
}: {
  pending: boolean;
  dirty: boolean;
  /** What is at stake, when nothing is unsaved. */
  note: string;
  /**
   * Replaces the default *Unsaved changes* line. One caller passes it: the Work
   * & hours tab, whose single Save writes two different records, so the line
   * says which of them this press is about to touch.
   */
  unsaved?: React.ReactNode;
}) {
  // Kept while a write is in flight even though `dirty` has usually gone false
  // by then — the row must not vanish out from under the "Saving…" it is showing.
  if (!dirty && !pending) {
    return (
      <p className="small" style={{ marginTop: 4 }}>
        {note}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
      <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {!pending ? (
        <span className="small">
          {unsaved ?? (
            <>
              <b style={{ color: 'var(--tx-warn)' }}>Unsaved changes.</b> Switching tab loses them.
            </>
          )}
        </span>
      ) : null}
    </div>
  );
}

/** The same inline marker `PackSheet` and the setup name step use. */
function Optional() {
  return <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>;
}

/**
 * A whole bio, not a description of one — see the note at the top of this file.
 *
 * Seventy-odd words, first person, specific about the city and the schedule and
 * unshowy about the credential, because that is the register the field wants and
 * an abstract instruction cannot demonstrate it.
 */
const BIO_PLACEHOLDER = `Twelve years on the gym floor in Bengaluru, most of it with people who had never picked up a barbell before. I coach strength and fat loss — three sessions a week, progressive overload, nothing exotic. Mornings at a gym in Indiranagar, and online through the rest of the day. If you want a plan you can actually keep to in a working week, we will get on.`;
