'use client';

import { useRef, useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconUser } from '@/components/auth/Icons';
import { saveName } from '@/lib/setup/actions';
import { avatarTint, initialsOf } from '@/lib/setup/options';
import type { SetupState } from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

/** Long enough for a full South Indian name, short enough to fit an invite line. */
const MAX_NAME = 60;

/**
 * `TrainerService.MAX_HEADLINE`. One line beside an avatar at every width the
 * two halves draw — the example, "Strength & fat-loss coach · Indiranagar", is
 * 39 of it.
 */
const MAX_HEADLINE = 80;

/**
 * When the counter appears. A character count sitting under an empty field is
 * a word limit presented as a warning, and it teaches a trainer to write to the
 * number instead of to the reader. It shows up once the ceiling is close enough
 * to be real information.
 */
const COUNTER_FROM = 60;

/**
 * Frame 5a · `/setup/name` — the only answer that cannot be skipped.
 *
 * **Two fields now — the name, and V33's headline under it.** The headline is
 * *optional inside the one mandatory step*, which is the whole reason it is here
 * rather than in a ninth step: the flow promises about a minute over eight steps
 * and its pre-flight screen exists because the most-named onboarding complaint
 * in the teardown was SURPRISE, not length. A second field on a step already
 * being paid for costs nothing; a ninth row on the rail is a broken promise. The
 * other two identity fields — a 200-word bio and an intro video — would be that
 * broken promise, so they are Settings' (`/settings/profile`).
 *
 * **The preview earns its place, and now it previews something.** Profile photos
 * are not built yet — there is no image store in the backend at all — so the
 * initials still do an avatar's work, derived live and shown back. With the
 * headline beside them the card stops being a spelling check and becomes the
 * thing itself: this is the trainer card a client sees on an invite, drawn from
 * what is in the two fields right now. It shows what the answers are *for*
 * rather than just collecting them.
 *
 * **And the validation names the reason, not the rule.** When it is empty the
 * message is *"your name is the one thing we can't skip"* — because a client
 * receiving an invite has to see who it is from. Not "required", not an
 * asterisk, and **no red outline before the field has been left**: NN/g's second
 * and first hostile patterns respectively.
 *
 * **Continue is not disabled while the field is empty, and that is the fix to a
 * dead end.** It was — which meant a trainer who landed here and pressed the one
 * primary button on the screen got nothing at all: no movement, no message, no
 * reason, because the message was only wired to blur. A greyed-out primary with
 * nothing beside it explaining itself is the "broken button" `app.css` already
 * names twice, and it was standing on the one step with no Skip. So the click
 * fires, the sentence appears, and **focus goes to the field** — because on a
 * phone the dock is at the bottom of the screen and the message it just produced
 * is above the fold behind it.
 */
export function NameForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [name, setName] = useState(state.name);
  const [headline, setHeadline] = useState(state.headline);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const empty = trimmed.length === 0;
  // Never on the first keystroke — an error that appears while you are still
  // typing your own name is an accusation.
  const showError = touched && empty;
  const initials = initialsOf(name);

  function submit() {
    if (empty) {
      setTouched(true);
      // The message is at the top of a screen whose dock is at the bottom of it.
      // Moving focus takes the trainer to what the message is about rather than
      // leaving them looking at the button that appeared not to work.
      input.current?.focus();
      return;
    }
    run(() => saveName(trimmed, headline));
  }

  return (
    <>
      <StepHead
        title="What should clients call you?"
        sub="This is the name on every invite and receipt you send."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={`fld${showError ? ' fld--err' : ''}`} style={{ marginTop: 24, maxWidth: 420 }}>
          <label className="fld__l" htmlFor="nm">
            Your name
          </label>
          <input
            className="ctl"
            id="nm"
            ref={input}
            style={{ height: 44, fontSize: 16 }}
            value={name}
            maxLength={MAX_NAME}
            autoFocus
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            placeholder="Ravi Kannan"
            disabled={pending}
            aria-invalid={showError ? true : undefined}
            aria-describedby="nm-msg"
            onBlur={() => setTouched(true)}
            onChange={(e) => {
              setName(e.target.value);
              if (touched && e.target.value.trim().length > 0) setTouched(false);
              if (message) setMessage(null);
            }}
          />
          <span className="fld__h">Use the name your clients already know you by.</span>
        </div>

        {/* The optional half of the step. No `Skip` beside it and none needed —
            leaving a field empty IS skipping it, and the step's own Continue
            already carries the name. */}
        <div className="fld" style={{ marginTop: 18, maxWidth: 420 }}>
          <label className="fld__l" htmlFor="hl">
            One line about you{' '}
            {/* Same inline marker `PackSheet` uses for a field-level optional.
                Not `.wiz__opt` — that one is the rail's, and it is sized and
                positioned for a step row. */}
            <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>
          </label>
          <input
            className="ctl"
            id="hl"
            style={{ height: 44, fontSize: 16 }}
            value={headline}
            maxLength={MAX_HEADLINE}
            autoComplete="off"
            /* A headline is a sentence fragment, not a name: sentence case is
               what a trainer would type and `words` would fight them on every
               word after the first. */
            autoCapitalize="sentences"
            placeholder="Strength & fat-loss coach · Indiranagar"
            disabled={pending}
            aria-describedby="hl-h"
            onChange={(e) => {
              setHeadline(e.target.value);
              if (message) setMessage(null);
            }}
          />
          <span className="fld__h" id="hl-h">
            What you coach, and where. It sits under your name wherever a client sees you.
            {headline.length >= COUNTER_FROM ? (
              <>
                {' '}
                <b className="mono">{MAX_HEADLINE - headline.length}</b> left.
              </>
            ) : null}
          </span>
        </div>

        {/* `.card`, not six inline declarations that add up to one. The radius,
            the ground, the hairline and the shadow are §04's card — and using it
            makes this the same object as the packs panel, the skip note and the
            completion meter, which are the only other boxes in the flow. */}
        {initials ? (
          <div className="card" style={{ marginTop: 22, maxWidth: 420 }}>
            <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span className="av av--lg" style={{ background: avatarTint(name) }}>
                {initials}
              </span>
              {/* `minWidth:0` so a long headline ellipses instead of pushing the
                  avatar out of the card — a flex item's min-width is `auto`,
                  which is the same trap `DayRibbon`'s scroller hit in the other
                  axis. */}
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}>{name.trim()}</b>
                {headline.trim() ? (
                  <span
                    className="small"
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {headline.trim()}
                  </span>
                ) : (
                  <span className="small" style={{ display: 'block' }}>
                    This is how a client sees you on an invite.
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : null}

        {/* The promise the card used to carry in its body, kept out of it now
            that the body is a preview. It is worth a line on its own: a trainer
            who reads their initials as the permanent answer has been told
            something false, and photos are a pass of their own — the backend has
            no image store yet. */}
        {initials ? (
          <p className="small" style={{ marginTop: 8, maxWidth: 420 }}>
            Your initials stand in until profile photos arrive.
          </p>
        ) : null}

        <div id="nm-msg">
          {showError ? (
            <div className="msg msg--err" aria-live="polite">
              <IconUser size={15} />
              <span>
                <b>Your name is the one thing we can’t skip.</b> Everything else in this setup is
                optional. This isn’t, because a client receiving an invite has to see who it is from.
              </span>
            </div>
          ) : (
            <MessageSlot message={message} />
          )}
        </div>

        <p className="small" style={{ maxWidth: '62ch' }}>
          Everything else can be skipped — four of the eight steps are marked optional before you
          reach them.
        </p>

        <StepFoot step="name" pending={pending} onContinue={submit} />
      </form>
    </>
  );
}
