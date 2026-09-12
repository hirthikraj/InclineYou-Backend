'use client';

import { useRef, useState } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconRefresh, IconRupee, IconWarn } from '@/components/auth/Icons';
import { finishWithUpi, skipStep } from '@/lib/setup/actions';
import { UPI_HANDLES } from '@/lib/setup/options';
import { isUpiFormat, selfTestLink, upiSuggestions } from '@/lib/setup/upi';
import type { SetupState } from '@/lib/setup/steps';
import { AddChip, Chip, ChipRow } from './Chips';
import { StepHead } from './SetupShell';
import { StepFoot } from './StepFoot';
import { useStepAction } from './useStepAction';

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
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const trimmed = upi.trim();
  const valid = isUpiFormat(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  function submit() {
    if (valid) {
      run(() => finishWithUpi(trimmed));
      return;
    }
    setTouched(true);
    if (trimmed.length === 0 && !typing && suggestions.length > 0) {
      // Nothing chosen. The field is not even on screen, so there is nothing to
      // focus and the sentence has to point at the chips instead.
      setMessage({
        // Amber: payment has a Skip. See CertificationsForm for the rule.
        tone: 'warn',
        icon: 'warn',
        lead: 'Pick one of the five, or type your own.',
        rest: 'Or press Skip for now — we ask again the first time you collect from a client.',
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
    setNotice(null);
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
          <div className="card card--acc" style={{ maxWidth: 520 }}>
            <div className="card__b">
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
            </div>
          </div>

          <div className="msg msg--warn" style={{ marginTop: 16, maxWidth: '66ch' }}>
            <IconWarn size={15} />
            <span>
              <b>We checked the shape, not the account.</b> We are not calling a payment provider, so
              we cannot confirm this account exists or that it is yours. One wrong letter passes this
              check and sends your money to a stranger.
            </span>
          </div>

          <p>
            {/* A plain link, not a fetch: `upi://` is the platform's job and a
                desktop browser will usually have nothing registered for it,
                which is why the sentence under it says what to do instead
                rather than assuming it worked. */}
            <a
              className="btn btn--secondary btn--lg"
              href={selfTestLink(trimmed, state.name)}
              style={{ marginTop: 8 }}
              onClick={() =>
                setNotice(
                  'If nothing opened, this browser has no UPI app registered. Open GPay, PhonePe or Paytm on your phone and send ₹1 to this ID there.',
                )
              }
            >
              <IconRupee size={15} />
              Send yourself ₹1 to prove it
            </a>
          </p>
          {notice ? (
            <div className="msg msg--warn">
              <IconWarn size={15} />
              <span>{notice}</span>
            </div>
          ) : null}

          <div className="trust" style={{ marginTop: 14, maxWidth: '66ch' }}>
            <IconRefresh size={15} />
            <span>
              A one-rupee self-transfer is the only proof we can offer today, so it is offered rather
              than implied. We check this with you <b>again at your first collection</b>, with the
              amount on the screen beside it — a wrong ID caught before a ₹9,600 collect is an edit;
              caught after it is somebody else’s money.
            </span>
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
        continueLabel="Finish"
        onContinue={submit}
        onSkip={() => run(() => skipStep('payment'))}
      />
    </>
  );
}
