'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { abandonPending, claimTrainer, signOut } from '@/lib/auth/actions';
import { SETUP_STEPS } from '@/lib/setup/steps';
import {
  IconChevronRight,
  IconDumbbell,
  IconUsers,
  IconWarn,
} from './Icons';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';

/**
 * Frame 3a · we don't know this number yet.
 *
 * ── THE LIKELIEST FIRST LAUNCH IN THE WHOLE PRODUCT ──────────────────────────
 *
 * Trainers create clients, so the most probable first experience anyone has is a
 * client opening the app, typing their number, and the system having never seen
 * it — because their trainer has not added them yet, or added a different number.
 * Without this screen they are at a spinner, and the mobile spec calls that "the
 * single most common way a coaching app loses a client on day one".
 *
 * ── TWO EXITS, AND NEITHER IS A DEAD END ─────────────────────────────────────
 *
 * One creates a trainer account. The other says, truthfully, that the fix is not
 * on this screen — their trainer adds them, and nothing here can. A screen with
 * one exit would be a screen that guesses, and guessing wrong in the trainer
 * direction hands a coaching workspace to somebody who wanted to be a client.
 *
 * ── AND IT APPEARS AFTER THE CODE, NEVER BEFORE ──────────────────────────────
 *
 * Answering "is this number known?" before somebody has proved they own it hands
 * anybody the customer list, one number at a time. So the screen costs a
 * verification to reach, and the note at the bottom says so rather than leaving
 * it to be inferred.
 *
 * ── THIS IS WHERE A TRAINER ACCOUNT IS CREATED — NOT AT SIGN-IN ──────────────
 *
 * Verifying used to mint one for any number that passed, which quietly handed a
 * workspace to every client who tried the app before their trainer got round to
 * it. `claimTrainer` is called from exactly here, which is why the third element
 * on the screen — *typed it wrong?* — matters: one wrong digit produces this
 * screen and looks exactly like being a new user.
 */
export function UnknownNumber({
  phone,
  policyVersion,
}: {
  phone: string | null;
  /** The privacy notice in force, which pressing "I’m a trainer" accepts. */
  policyVersion: string;
}) {
  const router = useRouter();
  const [howOpen, setHowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function beTrainer() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await claimTrainer();
      if (result.ok) {
        router.push(result.next);
        return;
      }
      setError(result.message);
    });
  }

  function differentNumber() {
    if (pending) return;
    startTransition(async () => {
      await abandonPending();
      router.push('/sign-in');
    });
  }

  return (
    <>
      {/*
        No inline `fontSize: 26`. The design file sets one on every `.stp__hd`
        and app.css replaced the base with `clamp(21px,5vw,26px)` for exactly
        that reason — an inline value outranks the clamp, so the headline stayed
        26px at 320px, where this one is the longest of the auth set. The clamp
        is 26px at any width the desk ever sees, so nothing moves above 520px.
      */}
      <h2 className="stp__hd">We don’t know this number yet</h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        {phone ? <>{phone} isn’t on InclineYou.</> : <>That number isn’t on InclineYou.</>} Which
        are you?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 24 }}>
        {/*
          The trainer option carries the accent border and wash. Not because it is
          recommended — the product has no opinion about which of the two anybody
          is — but because it is the one that DOES something here, and the other
          only explains. One of two identical cards being the irreversible one is
          the arrangement to avoid.
        */}
        <Exit
          icon={<IconDumbbell size={20} />}
          title="I’m a trainer"
          /* Derived from SETUP_STEPS rather than typed, so the promise cannot
             drift from the flow. The design says "8 questions" and the array is
             the reason it is eight. */
          body={`Set up your roster — about a minute, ${SETUP_STEPS.length} questions`}
          accent
          onClick={beTrainer}
          disabled={pending}
          busy={pending}
        />
        <Exit
          icon={<IconUsers size={20} />}
          title="I train with somebody"
          body="Your trainer adds you — we’ll show you how"
          onClick={() => setHowOpen(true)}
          disabled={pending}
        />
      </div>

      {/* Pressing the first button IS the acceptance (`POST /v1/trainers` carries the
          version), so the screen says so where it can be read before it is pressed. */}
      <p className="small" style={{ marginTop: 12, color: 'var(--tx-ink-3)' }}>
        Opening an account means you accept our privacy notice (version {policyVersion}).
      </p>

      {/*
        `aria-live` on the container rather than on a conditional element, for the
        same reason `MessageSlot` is always present: a region that appears with
        its message is announced as an insertion, and a screen reader may miss it.
        Unlike that slot this one does NOT hold its height — there is nothing
        below it whose position matters, and 44px of permanent blank above the
        "typed it wrong?" note would read as a rendering fault.
      */}
      <div aria-live="polite">
        {error ? (
          <div className="msg msg--err" style={{ marginTop: 16 }}>
            <IconWarn size={15} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      {/*
        THE THIRD THING ON THE SCREEN, and it is not an afterthought. One wrong
        digit lands somebody here and it is indistinguishable from being new — so
        the likeliest cause is named before either exit is taken, because a client
        who picks "I'm a trainer" to get past a typo has created an account they
        cannot undo.
      */}
      <div className="msg msg--warn" style={{ marginTop: 16 }}>
        <IconWarn size={15} />
        <span>
          <b>Typed it wrong?</b> One wrong digit is the usual cause, and it looks exactly like
          this.
        </span>
      </div>

      <Button
        variant="secondary"
        /* The design's 4px reads as 22px in the frame because `.msg`'s 38px
           min-height is mostly empty under one line of text. This message is two
           lines at every width the screen is used at, so the slack is gone and
           4px puts "like this." on top of the button. 12px is the gap the frame
           actually shows. */
        style={{ marginTop: 12 }}
        onClick={differentNumber}
        disabled={pending}
      >
        Use a different number
      </Button>

      <TrustLine>
        This question comes <b>after</b> the code, never before. Telling you which numbers exist
        before you have proved you own one would hand anybody the customer list.
      </TrustLine>

      {/* A way out that is not a choice between the two exits: the token here is a
          15-minute pending one, so signing out only clears the sitting. A form
          posting the server action, so it works before hydration too. */}
      <form action={signOut} style={{ marginTop: 8, textAlign: 'center' }}>
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          Sign out
        </Button>
      </form>

      {howOpen && <HowSheet phone={phone} onClose={() => setHowOpen(false)} />}
    </>
  );
}

/** One exit. A real `<button>`, because both of them do something. */
function Exit({
  icon,
  title,
  body,
  accent,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent?: boolean;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      /* `card--pick` / `card--pick-accent` rather than the design's inline
         border and background — an inline `border` outranks `button.card:hover`
         and would leave both of these hover-dead. See the note in app.css. */
      className={`card ${accent ? 'card--pick-accent' : 'card--pick'}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      /* The whole card is the label, so the accessible name is both lines — a
         button announced as "I'm a trainer" alone loses the minute and the eight
         questions, which is the part somebody decides on. */
      aria-label={`${title}. ${body}`}
    >
      <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        {icon}
        <span style={{ flex: 1 }}>
          <b style={{ display: 'block', fontSize: 14.5, color: 'var(--tx-ink)' }}>{title}</b>
          <span
            style={{
              display: 'block',
              fontSize: 12.5,
              color: 'var(--tx-ink-3)',
              marginTop: 3,
            }}
          >
            {busy ? 'Setting that up…' : body}
          </span>
        </span>
        <IconChevronRight size={16} />
      </div>
    </button>
  );
}

/**
 * The second exit's answer.
 *
 * The phone opens a bottom sheet; the web's equivalent of a sheet is not a sheet.
 * §24: a modal is the one overlay that "must be read and answered, not looked
 * past", which is exactly this — it is a short instruction with one thing to do,
 * and the screen behind it is not what the reader needs.
 *
 * **The true thing to say is that the fix is not here.** Their trainer adds them;
 * nothing on this screen can. So it says that, gives them the number to send, and
 * — the line that stops a second visit being a surprise — says that nothing was
 * created just now and signing in again costs one more code.
 */
function HowSheet({ phone, onClose }: { phone: string | null; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the one action, so a keyboard reader lands inside the dialog rather
    // than behind it — and so Escape and Enter both do something obvious.
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* A button, not a div with an onClick: clicking away is a real way out and
          has to be one for a keyboard too. */}
      <button className="scrim" type="button" aria-label="Close" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="how-t">
        <div className="modal__hd">
          <h3 className="modal__t" id="how-t">
            Your trainer adds you
          </h3>
        </div>
        <div className="modal__body">
          <p>
            InclineYou works from your trainer’s roster, so they add you with the number you just
            typed — there is nothing for you to set up.
          </p>
          <p style={{ marginTop: 12 }}>
            Send them this number
            {phone ? (
              <>
                , <b style={{ color: 'var(--tx-ink)' }}>{phone}</b>,
              </>
            ) : null}{' '}
            and sign in again once they say they’ve added you. Your plan, your sessions and
            anything you owe will be here.
          </p>
          <p className="small" style={{ marginTop: 12 }}>
            Nothing was created just now. Signing in again costs one more code.
          </p>
        </div>
        <div className="modal__foot">
          <Button variant="primary" ref={close} onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </>
  );
}
