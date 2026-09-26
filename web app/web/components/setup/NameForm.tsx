'use client';

import { useRef, useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconUser } from '@/components/auth/Icons';
import { finishFromName, saveName } from '@/lib/setup/actions';
import { GENDERS, initialsOf, labelFor, type Gender } from '@/lib/setup/options';
import { avatarToken } from '@/lib/today/time';
import type { SetupState } from '@/lib/setup/steps';
import { Chip, ChipRow } from './Chips';
import { GroupLabel, StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';
import { Card } from '@/web-components/ui/Card';

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
  const [gender, setGender] = useState<Gender | null>(state.gender);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const empty = trimmed.length === 0;
  // Never on the first keystroke — an error that appears while you are still
  // typing your own name is an accusation.
  const showError = touched && empty;
  /* The gender chips get NO equivalent of `showError`. Blur is what makes a
     text field's error honest — you left it, so you are done with it — and a
     chip row has no blur that means that: tabbing from the last chip to
     Continue would fire it on somebody on their way to answer. The row is
     checked on submit only, and the message says which half is missing. */
  const missingGender = gender === null;
  const complete = !empty && !missingGender;
  const initials = initialsOf(name);

  /** Both halves, in the order the eye meets them. */
  function check(): boolean {
    if (empty) {
      setTouched(true);
      // The message is at the top of a screen whose dock is at the bottom of it.
      // Moving focus takes the trainer to what the message is about rather than
      // leaving them looking at the button that appeared not to work.
      input.current?.focus();
      return false;
    }
    if (missingGender) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Pick one under “How clients see you”.',
        rest: '“Prefer not to say” is a real answer — it is stored as one, so we stop asking and nobody has to guess.',
      });
      return false;
    }
    return true;
  }

  function submit() {
    if (!check()) return;
    run(() => saveName(trimmed, headline, gender));
  }

  /* The name step's own *Skip to home*, and the reason it is a different action
     from every other step's: here the answer is on the SCREEN and not on the
     account yet. `finishFromName` writes it and stamps the flow in one call —
     see the action for why that is not two calls from here. */
  function skipHome() {
    if (!check()) return;
    run(() => finishFromName(trimmed, headline, gender));
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

        {/*
          THE SECOND MANDATORY ANSWER, AND THE ONLY OTHER ONE IN THE FLOW.

          A chip row rather than a `Select`, matching the four other pick-one
          answers in this flow — and a select would be worse here than
          elsewhere: four options behind a closed control makes *Prefer not to
          say* something a trainer has to open a menu to discover, which is the
          opposite of what an opt-out is for.

          `radiogroup` and not a list of toggle buttons. `Chip` emits
          `aria-pressed`, which is right for the many-select rows (specialities,
          languages) and wrong here — pressed/not-pressed on four independent
          buttons says nothing about the four being ONE answer, so a reader gets
          no "1 of 4" and arrowing does not move between them. The role goes on
          the container, where it costs nothing and says the true thing.
        */}
        <GroupLabel top={22}>HOW CLIENTS SEE YOU</GroupLabel>
        <p className="small" style={{ maxWidth: '62ch', marginTop: -2 }}>
          Clients filter on this — a great many are looking for a woman trainer specifically, and
          no other app lets them ask.
        </p>
        <div role="radiogroup" aria-label="Gender">
          <ChipRow top={10}>
            {GENDERS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={gender === option.id}
                disabled={pending}
                onClick={() => {
                  setGender(option.id as Gender);
                  if (message) setMessage(null);
                }}
              />
            ))}
          </ChipRow>
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
                <b className="tnum">{MAX_HEADLINE - headline.length}</b> left.
              </>
            ) : null}
          </span>
        </div>

        {/* `.card`, not six inline declarations that add up to one. The radius,
            the ground, the hairline and the shadow are §04's card — and using it
            makes this the same object as the packs panel, the skip note and the
            completion meter, which are the only other boxes in the flow. */}
        {initials ? (
          <Card style={{ marginTop: 22, maxWidth: 420 }}>
            <Card.Body style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span className="av av--lg" style={{ background: avatarToken(name) }}>
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
                {/* The gender is on the card only once it has been answered,
                    and `undisclosed` is deliberately NOT drawn: printing
                    "Prefer not to say" on a trainer's own client-facing card
                    publishes the decline as if it were the disclosure. It is
                    stored, the filter honours it, and the card stays quiet. */}
                {gender && gender !== 'undisclosed' ? (
                  <span className="small ink3" style={{ display: 'block', marginTop: 2 }}>
                    {labelFor(gender, GENDERS)}
                  </span>
                ) : null}
              </span>
            </Card.Body>
          </Card>
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
                <b>Your name is the one thing we can’t skip.</b> Everything after this step is
                optional. This isn’t, because a client receiving an invite has to see who it is from.
              </span>
            </div>
          ) : (
            <MessageSlot message={message} />
          )}
        </div>

        <p className="small" style={{ maxWidth: '62ch' }}>
          This is the only step we keep. All seven after it can be skipped, and{' '}
          <b>Skip to home</b> takes you straight into the app once these two are answered — the rest
          moves to your profile, where you can finish it whenever you like.
        </p>

        <StepFoot
          step="name"
          pending={pending}
          onContinue={submit}
          /* No `onSkip`: this is the step that cannot be passed on, and a Skip
             here would be the one control the whole flow is built to refuse.
             `onSkipHome` appears the moment BOTH answers are on the screen —
             which is what "once name is filled" means on the screen that is
             filling it. Before that it would be a button whose only possible
             outcome is the error message already sitting above it. */
          onSkipHome={complete ? skipHome : undefined}
        />
      </form>
    </>
  );
}
