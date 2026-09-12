'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import type { Message } from '@/lib/auth/copy';
import { formatPhone } from '@/lib/auth/policy';
import { closeAccount } from '@/lib/account/actions';

/**
 * DELETING THE ACCOUNT.
 *
 * `webapp-settings.html` puts export and delete side by side and states the
 * argument this component exists to honour: *"Everything is exportable, and
 * everything is deletable. Both are buttons, not an email request."* A product
 * that claims your data is yours and then makes you write to support to leave
 * has not made that claim.
 *
 * ## What it actually does, and the copy does not soften it
 *
 * A soft delete: `deleted_at` on `trainer` and on `app_user`. There is no hard
 * delete and there cannot be a cheap one — `client.trainer_id` is NOT NULL and
 * twenty tables hang off `client` in turn, so removing the row would take a year
 * of somebody's sessions, packages and payments with it. What the stamp does is
 * exactly what a trainer means by *delete*: the number stops resolving at
 * sign-in, every route stops loading, and nothing in the product can reach any
 * of it again.
 *
 * **And the number is not released.** Both phone columns are plain UNIQUE
 * indexes rather than partial on `deleted_at`, so a fresh sign-up on that number
 * is refused afterwards. That is the one consequence a trainer cannot discover
 * by trying it once, which is precisely why it is the sentence directly above
 * the field rather than a line in a help page.
 *
 * ## The confirmation is the number, typed
 *
 * Not a checkbox and not a second *Are you sure*. Both are pressed by the same
 * reflex that pressed the first button; typing ten digits is not. It is also the
 * only confirmation that names WHICH account is going — the one thing worth
 * being sure of on a shared gym desktop, where the account signed in is quite
 * often not the person's own.
 *
 * There is **no OTP**, and that asymmetry with the phone-change flow is
 * deliberate: changing a number is an attacker's goal, because it takes the
 * account over. Deleting is nobody's goal but the owner's — it destroys what an
 * attacker would want and hands them nothing. What it needs protection from is a
 * mis-tap, and that is what the field supplies.
 */
export function DeleteAccount({ phone, clientCount }: { phone: string; clientCount: number | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();

  const digits = typed.replace(/\D/g, '');
  const target = phone.replace(/\D/g, '').slice(-10);
  // Matched on the last ten digits, so `+91 98410 22119` — which is how this
  // very screen prints it back one card up — is an accepted answer. A
  // confirmation that refuses the number in the format the product itself
  // displays teaches the trainer the product is broken, not that they typed it
  // wrong. The server applies the identical rule; this is what stops the round
  // trip on the common miss.
  const matches = digits.length >= 10 && digits.endsWith(target);

  function submit() {
    if (!matches) return;
    setMessage(null);
    start(async () => {
      // On success this never returns — `closeAccount` signs out, and `signOut`
      // redirects. So there is no success branch to write, which is the right
      // ending: the screen that would have shown it belongs to an account that
      // no longer resolves.
      const res = await closeAccount(typed);
      setMessage({ tone: 'err', icon: 'warn', lead: res.message });
    });
  }

  if (!open) {
    return (
      <>
        <p className="small">
          Everything in InclineYou is yours, and leaving is a button rather than an email to somebody.
          Deleting closes this account for good: your roster, your programs, your session history
          and your money book all stop being reachable, and{' '}
          <b>the number you sign in with cannot be used to start again.</b>
        </p>
        <button
          className="btn btn--secondary"
          type="button"
          style={{ marginTop: 12, color: 'var(--tx-danger)' }}
          onClick={() => {
            setOpen(true);
            setMessage(null);
          }}
        >
          Delete my account
        </button>
      </>
    );
  }

  return (
    <div>
      <p className="small">
        This closes the account on <b className="mono">{formatPhone(phone)}</b> and signs you out.
      </p>

      {/*
        `listStyle: 'disc'` inline, which its two siblings in this codebase
        (`PackLife`, `PaymentsTab`) do not do — webapp.css §reset sets
        `ul,ol{list-style:none}` globally, so a `<ul>` there renders as indented
        prose. Right for those two, which are asides. Wrong here: these are four
        separate claims about something that cannot be undone, and without a
        marker they render as one grey paragraph that the eye takes in as a
        single sentence and skips. Inline rather than a rule, because it is this
        card's argument and not a change to how the app draws lists.
      */}
      <ul
        className="small"
        style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7, listStyle: 'disc' }}
      >
        <li>
          {/*
            Named rather than counted vaguely. A trainer with 22 clients should
            read the number, because the thing they are about to lose is not an
            abstraction — and it is the fact most likely to stop a mis-tap.

            ZERO takes the general sentence, not "your 0 clients", which is the
            defect a rendering pass found on an empty account. A count only
            works as a warning while it is a quantity of something; at zero it
            is arithmetic in a sentence that is trying to give somebody pause,
            and it also happens to be the one case where the count is the LEAST
            alarming thing on the card. The roster failing to load takes the
            same branch, which is correct — both mean *we cannot name it*.
          */}
          {clientCount && clientCount > 0
            ? `Your ${clientCount} ${clientCount === 1 ? 'client' : 'clients'}, and every package, payment and session against them, stop being reachable.`
            : 'Your clients, packages, payments and session history stop being reachable.'}
        </li>
        <li>
          <b>{formatPhone(phone)} cannot be used to sign up again.</b> The account keeps the number
          so that nobody else can be handed a sign-in next to your book.
        </li>
        <li>Nobody is messaged. Your clients are not told, and nothing is sent in your name.</li>
        <li>We cannot undo this from inside InclineYou.</li>
      </ul>

      <div className={`fld${message ? ' fld--err' : ''}`} style={{ marginTop: 16, maxWidth: 320 }}>
        <label className="fld__l" htmlFor="del-confirm">
          Type {formatPhone(phone)} to confirm
        </label>
        <input
          className="ctl mono"
          id="del-confirm"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          disabled={pending}
          autoFocus
          onChange={(e) => {
            setTyped(e.target.value);
            if (message) setMessage(null);
          }}
        />
      </div>

      <MessageSlot message={message} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/*
          Secondary, not primary — the accent fill is the product's *do this*
          and this is not a thing the product wants anybody to do. `btn--danger`
          is a solid red fill, which is louder still and would make the most
          destructive control on the screen the most eye-catching thing on it.
          It carries the danger ink and the verb, and Keep it is the primary.
        */}
        <button className="btn btn--primary" type="button" disabled={pending} onClick={() => setOpen(false)}>
          Keep my account
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          style={{ color: 'var(--tx-danger)' }}
          disabled={pending || !matches}
          onClick={submit}
        >
          {pending ? 'Deleting…' : 'Delete it'}
        </button>
      </div>
    </div>
  );
}
