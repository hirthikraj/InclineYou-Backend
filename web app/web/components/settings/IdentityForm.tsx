'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveIdentity } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';
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
import { Button } from '@/web-components/ui/Button';
import { Field, TextField } from '@/web-components/ui/Field';
import { FormGroup } from '@/web-components/ui/FormGroup';

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
 * ## THE PREVIEW IS NO LONGER THIS FILE'S, AND THAT IS THE POINT
 *
 * *How clients see you* was drawn here, inside this form, and it was in the
 * wrong place in both directions. It showed **every other tab's answer** — the
 * experience band, the languages, the specialities, the certificates, the work,
 * the links — while living inside the one tab that edits none of them, so the
 * six tabs whose answers it draws could not see it. And MEASURED at 1536×695 it
 * was the first thing to scroll off the screen: 1046px of content in a 510px
 * window, with the card gone by the time the bio it previews was being typed.
 *
 * It is `ProfileAside` now — in `layout.tsx`, sticky, on all seven tabs. This
 * form's part of the arrangement is one effect: it publishes the name and the
 * headline into `ProfileDraftProvider` as they are typed, which is what keeps
 * the card live. Nothing else on this tab is drawn on the card — the bio and the
 * video are not on it — so nothing else is published.
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
  const publish = usePublishDraft();

  /* The two fields the preview card draws. From an EFFECT and not from the
     change handlers: setting state in an ancestor from a keystroke handler
     re-renders this whole subtree synchronously with the keypress, and the
     field being typed in is inside it. */
  useEffect(() => {
    publish({ name, headline });
  }, [publish, name, headline]);

  const trimmedName = name.trim();
  const words = wordCount(bio);
  const charsLeft = MAX_BIO - bio.length;
  // The saved-as line reads the canonical URL, which only exists after a save —
  // see `canonicalVideoId`. An unsaved paste honestly shows nothing rather than
  // this file guessing at the six shapes `YouTubeLink.java` already reduces.
  const videoId = canonicalVideoId(video) ?? (video === saved.introVideoUrl ? saved.introVideoId : null);
  const dirty =
    name !== saved.name ||
    headline !== saved.headline ||
    bio !== saved.bio ||
    video !== saved.introVideoUrl;

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
      {/* ONE STACK AT ONE SPACING, rather than a `marginTop` on each field.
          The four carried 22, 18, 18 and 18 inline — the same decision made
          four times and made differently once — and an inline style is the one
          form no rung can release (trap 2).

          The column's WIDTH is the sidecar's now. `.sdc__main` caps the measure
          at 600, so `maxWidth:560` is gone from every field here, and the
          message slot and the save row below finally share that edge: MEASURED
          before, both of them ran to 1409px while every field above them
          stopped at 560, which drew a ragged step across the bottom of the
          form. */}
      <FormGroup gap={4}>
        <TextField
          label="Name"
          hint="Personal or the name you trade under — whichever your clients already know. It is on every invite and receipt you send."
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
        />

        <TextField
          label={<>Headline <Optional /></>}
          hint={<>What you coach, and where. One line, under your name.
            {headline.length >= HEADLINE_COUNTER_FROM ? (
              <>
                {' '}
                <b className="tnum">{MAX_HEADLINE - headline.length}</b> characters left.
              </>
            ) : null}</>}
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
        />

        <Field
          label={<>About you <Optional /></>}
          hint={<>{/* Never a warning below the guidance — nothing here is refused for
                being brief, and "too short" on an optional field is an accusation
                for answering it. */}
            {bio.length >= BIO_CHARS_WARN_FROM ? (
              <>
                <b className="tnum">{charsLeft}</b> characters left.
              </>
            ) : words === 0 ? (
              <>
                How you coach, who you coach, and what a client can expect. Aim for{' '}
                {BIO_WORDS_MIN}–{BIO_WORDS_MAX} words.
              </>
            ) : (
              <>
                <b className="tnum">{words}</b> {words === 1 ? 'word' : 'words'} — aim for{' '}
                {BIO_WORDS_MIN}–{BIO_WORDS_MAX}.
              </>
            )}</>}
          id="pf-bio"
        >
          {(a) => (
            <textarea className="ctl" {...a} rows={8} value={bio} maxLength={MAX_BIO} disabled={pending} placeholder={BIO_PLACEHOLDER} onChange={(e) => {
              setBio(e.target.value);
              if (message) setMessage(null);
            }} />
          )}
        </Field>

        <TextField
          label={<>Intro video <Optional /></>}
          hint={<>A YouTube link, if you have one. Paste it from the video’s Share button — we tidy it up.
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
            ) : null}</>}
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
        />
      </FormGroup>

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
 *
 * The preview card is the second reason it earns its place, and it is a NEW
 * one. The card beside the form redraws as the name is typed, which is exactly
 * the arrangement that could read as *already saved* — so the row saying it is
 * not sits under the fields, in the column doing the typing, rather than beside
 * the card that is telling the comfortable half of the story.
 *
 * ── THE 16px ABOVE IT IS THE STACK'S STEP ───────────────────────────────────
 *
 * It was 4. That was right while every field above carried its own 18px
 * `marginTop` and the row was a footnote to the last of them; with the fields
 * in one `FormGroup` at 16, a 4px gap made the save row look like part of the
 * video field. Both branches carry it, or the row jumps 12px the moment the
 * first character is typed.
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
      <p className="small" style={{ marginTop: 16 }}>
        {note}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
      <Button variant="primary" size="lg" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
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
