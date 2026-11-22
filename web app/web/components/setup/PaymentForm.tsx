'use client';

import { useRef, useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconRupee, IconWarn } from '@/components/auth/Icons';
import { finishWithUpi, skipStep } from '@/lib/setup/actions';
import { UPI_HANDLES } from '@/lib/setup/options';
import { isUpiFormat, selfTestLink, upiSuggestions } from '@/lib/setup/upi';
import type { SetupState } from '@/lib/setup/steps';
import { AddChip, Chip, ChipRow } from './Chips';
import { StepHead } from './SetupShell';
import { StepFoot, skipHomeAction } from './StepFoot';
import { useStepAction } from './useStepAction';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { Card } from '@/web-components/ui/Card';
import { QrCode } from '@/web-components/ui/QrCode';

/**
 * Frame 5e · `/setup/payment` — step 8, where it stops being a form.
 *
 * We check that a UPI ID **looks like** a UPI ID. We are not calling a payment
 * provider, so we cannot confirm the account exists or that it belongs to this
 * trainer, and **one wrong letter passes this check and sends the money to a
 * stranger**. That is a real risk to somebody's income, and the honest response
 * to it is a read-back and a ₹1 self-transfer, not a green tick.
 *
 * **The day a provider is wired in, the read-back is replaced by a name lookup**
 * — not softened into the word "verified", which is exactly what this screen
 * would become by accident.
 *
 * **Five chips and a way out, instead of a text field and a hope.** §16's
 * decision, and the one thing this half does that the phone cannot: the common
 * shape in India is `<phone>@<psp>`, and the phone number is the one string this
 * product has just proved correct by sending a code to it — so the typo surface
 * for the majority case is a handle, not eleven characters.
 *
 * **Finish is live even when there is nothing to finish with**, for the reason
 * `NameForm` records: a greyed-out primary explains nothing, and this screen has
 * two distinct ways of being incomplete that want two different sentences —
 * nothing picked at all, which points at the chips, and something typed that is
 * not a UPI ID, which points at the field and moves focus into it. Skip stays
 * beside it the whole time, so nobody is trapped either way.
 */
export function PaymentForm({ state }: { state: SetupState }) {
  const { run, pending, message, setMessage } = useStepAction();
  const suggestions = upiSuggestions(state.phone);

  const [upi, setUpi] = useState(state.upiId);
  /** Open when the trainer wants a local part that is not their own number. */
  const [typing, setTyping] = useState(state.upiId !== '' && !suggestions.includes(state.upiId));
  const [touched, setTouched] = useState(false);
  /**
   * The trainer's word that the ₹1 arrived in their own account. Required to
   * continue with an ID (22 Nov 2026): the shape check cannot tell a stranger's
   * ID from theirs, and the ₹1 can. Reset whenever the ID changes — a tick given
   * for one ID is not a tick for the next.
   *
   * Starts ticked for an ID already on the account: the trainer put it there
   * themselves, and asking again on a return visit is friction with no new
   * information. Picking that same ID back after changing it ticks it again.
   */
  const savedUpi = state.upiId.trim();
  const [confirmed, setConfirmed] = useState(savedUpi !== '' && isUpiFormat(savedUpi));
  const input = useRef<HTMLInputElement>(null);

  const trimmed = upi.trim();
  const valid = isUpiFormat(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  function submit() {
    if (valid && confirmed) {
      run(() => finishWithUpi(trimmed));
      return;
    }
    // An ID that looks right but nobody has proved: Continue is disabled until the tick (22 Nov 2026), so this is
    // unreachable from the button — kept so a keyboard submit can never save an unproved ID either.
    if (valid) return;
    setTouched(true);
    if (trimmed.length === 0 && !typing && suggestions.length > 0) {
      // Nothing chosen. The field is not even on screen, so there is nothing to
      // focus and the sentence has to point at the chips instead.
      setMessage({
        // Amber: payment has a Skip. See CertificationsForm for the rule.
        tone: 'warn',
        icon: 'warn',
        lead: 'Pick one of the five, or type your own.',
        rest: 'Or press Skip this step — we ask again the first time you collect from a client.',
      });
      return;
    }
    // Something typed that is not a UPI ID, or no chips to offer. Open the field
    // if it is closed and put the cursor in it — on a phone the dock is at the
    // bottom of the screen and the message it just produced is above the fold.
    setTyping(true);
    requestAnimationFrame(() => input.current?.focus());
  }

  function pick(value: string) {
    setUpi(value);
    setTyping(false);
    setTouched(false);
    setConfirmed(savedUpi !== '' && value === savedUpi);
    if (message) setMessage(null);
  }

  return (
    <>
      <StepHead
        title={valid ? 'Read this back to yourself' : 'How should clients pay you?'}
        sub={
          valid
            ? 'This is where your clients’ money will go. Check every character.'
            : 'Your UPI ID. Money goes straight to you — InclineYou never holds it.'
        }
      />

      {suggestions.length > 0 ? (
        <div style={{ marginTop: 16, maxWidth: 560 }}>
          <p className="micro">Built from your number, which we just verified</p>
          {/* `ChipRow` and `Chip`, not `.wk` and a hand-styled button.
              §16's frame draws the picked chip with `background:accent-soft;
              border-color:accent-line; color:accent-text` set INLINE — which is
              what a generator emits, and it made step 8 the only step in this
              flow where a chosen chip is a soft tint rather than the solid lime
              `.chip[aria-pressed="true"]` gives it on steps 2 through 6. One
              flow, one pressed state; and on the screen whose entire job is
              *read this back to yourself*, the unambiguous fill is also the
              better of the two. `.wk` went with it — it is the week-key row
              from the schedule sheet, and a chip row here should be the same
              chip row as everywhere else, gap included. */}
          <ChipRow top={8}>
            {suggestions.map((value) => (
              <Chip
                key={value}
                label={value}
                mono
                pressed={value === trimmed}
                onClick={() => pick(value)}
              />
            ))}
            <AddChip
              label="Type a different one"
              icon={false}
              pressed={typing}
              onClick={() => {
                setTyping(true);
                setUpi('');
              }}
            />
          </ChipRow>
        </div>
      ) : null}

      {/* Open when the trainer asked for it, and always when we have no number
          to build the chips from. A picker with nothing in front of the handle
          is worse than a plain field. */}
      {typing || suggestions.length === 0 ? (
        <div
          className={`fld${showError ? ' fld--err' : ''}`}
          style={{ marginTop: 18, maxWidth: 420 }}
        >
          <label className="fld__l" htmlFor="upi">
            UPI ID
          </label>
          <input
            className="ctl mono"
            id="upi"
            ref={input}
            style={{ height: 44, fontSize: 16 }}
            value={upi}
            autoFocus={typing}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="email"
            placeholder="name@okhdfcbank"
            aria-invalid={showError ? true : undefined}
            aria-describedby="upi-msg"
            onBlur={() => setTouched(true)}
            onChange={(e) => {
              setUpi(e.target.value.trim());
              setConfirmed(savedUpi !== '' && e.target.value.trim() === savedUpi);
              if (touched && isUpiFormat(e.target.value)) setTouched(false);
              if (message) setMessage(null);
            }}
          />
          <span className="fld__h">Open GPay, PhonePe or Paytm → your profile → UPI ID</span>
        </div>
      ) : null}

      <div id="upi-msg">
        {showError ? (
          /* Not "invalid format", which sends somebody back to the same typo.
             The message names the character and the handles a trainer in India
             is likeliest to hold. */
          <div className="msg msg--err" aria-live="polite">
            <IconWarn size={15} />
            <span>
              <b>A UPI ID has an @ in it.</b> Yours probably ends {UPI_HANDLES[0]} or{' '}
              {UPI_HANDLES[1]} — it looks like <b>yourname@handle</b>, and the handle depends on the
              app you use.
            </span>
          </div>
        ) : (
          <MessageSlot message={message} />
        )}
      </div>

      {valid ? (
        <>
          <Card
            tone="acc"
            style={{ maxWidth: 520 }}
          >
            <p className="micro" style={{ color: 'var(--tx-accent-text)' }}>
              YOUR UPI ID
            </p>
            {/* 21px so every character is checkable, and it WRAPS rather than
                truncating — an ellipsised UPI ID defeats the entire purpose
                of this screen. */}
            <p
              className="mono"
              style={{
                fontSize: 21,
                fontWeight: 600,
                color: 'var(--tx-ink)',
                marginTop: 9,
                letterSpacing: '.01em',
                overflowWrap: 'anywhere',
              }}
            >
              {trimmed}
            </p>
          </Card>

          {/* ── ONE WARNING, ITS ANSWER, ONE QUIET LINE (22 Nov 2026) ──────────────────────────────────────────
              It was two amber notes and a trust box — three alerts in a row about one ID, the second one wider than
              the column (it had no measure) and amber for what is a tip. Now: the warning, the button that answers
              it directly under it, and one neutral line that is the reassurance before the press and the fallback
              after it. All three share the ID card's width (`.stp__upichk`). */}
          <div className="stp__upichk">
            <div className="msg msg--warn">
              <IconWarn size={15} />
              <span>
                <b>We checked the shape, not the account.</b> One wrong letter passes this check and sends your money
                to a stranger — send yourself ₹1 to be sure it is yours.
              </span>
            </div>

            {/* ── THE ₹1, ON SIGHT (22 Nov 2026) ─────────────────────────────────────────────────────────────────
                No button any more: the QR is the proof, drawn as soon as the ID has the right shape. It carries the
                same `upi://pay` link (₹1, this ID, this name), so a laptop hands it to the phone's camera — and on
                a phone, where you cannot scan your own screen, the code itself is the link and a tap opens the UPI
                app. Keyed by the ID so picking another chip draws a fresh code. */}
            {/* 22 Nov 2026: drawn at 200px — the anchor around it was an inline flex item that collapsed, so a 152px
                code rendered at ~72 — and the words beside it are three numbered steps instead of a paragraph. */}
            {/* ── THE DEVICE DECIDES, NOT THE WIDTH (22 Nov 2026) ──────────────────────────────────────────────────
                A phone cannot scan its own screen, so on touch the 200px code was the largest thing on the page and the
                useful action — open the UPI app — hid behind "tap the code". Touch gets a full-width button carrying the
                same `upi://pay` link; a fine pointer that can hover (a desk) keeps the code for the phone's camera. The
                portal's pay card (`.phpay__phone` / `.phpay__desk`) draws the same line for the same reason. Both are
                in the markup and CSS picks one, so nothing flashes on hydration. */}
            <Button
              href={selfTestLink(trimmed, state.name)}
              variant="secondary"
              size="lg"
              className="stp__upipay"
            >
              <IconRupee size={15} />
              Pay ₹1 with a UPI app
            </Button>
            <div className="stp__upiqr">
              <a href={selfTestLink(trimmed, state.name)} aria-label={`Pay ₹1 to ${trimmed} with a UPI app`} className="stp__upicode">
                <QrCode key={trimmed} value={selfTestLink(trimmed, state.name)} label={`UPI payment code for ₹1 to ${trimmed}`} size={200} />
              </a>
              <ol className="stp__upisteps">
                <li>
                  <span className="stp__upidesk">
                    <b>Scan with GPay, PhonePe or Paytm.</b> ₹1 to <span className="mono">{trimmed}</span> is filled in.
                  </span>
                  <span className="stp__upitouch">
                    <b>Tap Pay ₹1 above.</b> Your UPI app opens with ₹1 to <span className="mono">{trimmed}</span> filled in.
                  </span>
                </li>
                <li>
                  <b>Check the name your app shows.</b> If it is not yours, this is the wrong ID — pick another above.
                </li>
                <li>
                  <b>Tick below once the ₹1 arrives.</b>
                </li>
              </ol>
            </div>

            <Checkbox
              align="start"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (message) setMessage(null);
              }}
              label={
                <>
                  <b className="ink">The ₹1 arrived in my account.</b> This UPI ID is mine.
                </>
              }
            />
            {/* Why Continue is disabled, said where the answer is. Skip is the way on without the ₹1. */}
            {!confirmed && (
              <p className="small ink3 stp__upinote">
                Continue unlocks when you tick this. Can’t do it now? <b>Skip this step</b> saves nothing — we ask again
                the first time you collect from a client.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="trust" style={{ marginTop: 18, maxWidth: '66ch' }}>
          <IconRupee size={15} />
          <span>
            <b>Skipping is fine.</b> We’ll ask again the first time you try to collect from a client —
            which is when it actually matters, and when the amount is on the screen beside it.
          </span>
        </div>
      )}

      <StepFoot
        step="payment"
        pending={pending}
        onContinue={submit}
        /* A valid ID needs the tick before it can be saved (22 Nov 2026). With nothing picked Continue stays live and
           says which way to go — the rule `NameForm` records for a primary that would otherwise explain nothing. */
        continueDisabled={valid && !confirmed}
        onSkip={() => run(() => skipStep('payment'))}
        onSkipHome={skipHomeAction(state, run)}
      />
    </>
  );
}
