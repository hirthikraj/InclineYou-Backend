'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { AccountAside } from '@/components/settings/AccountAside';
import { DeleteAccount } from '@/components/settings/DeleteAccount';
import { SaveRow } from '@/components/settings/IdentityForm';
import { PhoneChange } from '@/components/settings/PhoneChange';
import type { Message } from '@/lib/auth/copy';
import {
  cancelPhoneChange,
  confirmPhoneChange,
  requestNewNumber,
  saveAccount,
  startPhoneChange,
  verifyCurrentNumber,
} from '@/lib/account/actions';
import type { Account } from '@/lib/account/api';
import { MAX_EMAIL, MAX_NAME, looksLikeEmail } from '@/lib/account/rules';
import { Card } from '@/web-components/ui/Card';
import { Sidecar } from '@/web-components/ui/Sidecar';
import { Tag } from '@/web-components/ui/Tag';
import { Field, TextField } from '@/web-components/ui/Field';

/**
 * THE ACCOUNT — Settings' first section, and the only screen in the product
 * that is about the trainer rather than about their work.
 *
 * Three cards, and they are three because they are three different kinds of act:
 *
 *   1. **You** — a name and an email. Editable, reversible, one Save.
 *   2. **Signing in** — the number, and the four-step flow that moves it.
 *   3. **Leaving** — the way out.
 *
 * ## Why the name is here as well as on the profile
 *
 * It is the same column, and this is not a duplicate. `trainer.name` answers two
 * different questions: *what does a client see on an invite*, which is the
 * profile's, and *whose account is this*, which is Settings'. A trainer on a
 * shared gym desktop looking to check which account they are signed in to should
 * not have to open a client-facing profile to find out — and the number
 * underneath it, which is the actual answer, has never appeared anywhere in this
 * product until now.
 *
 * Both screens PATCH two keys and never a whole profile, so the two can be open
 * at once without either clobbering the other. `lib/profile/actions.ts` carries
 * that argument at length for the seven tabs; this is the same rule reaching one
 * level up, and it is what makes the duplication safe rather than merely
 * tolerable.
 *
 * ## And the email is not a login
 *
 * There is no email anywhere else in this product: sign-in is a phone number and
 * a six-digit code, and this backend has no mail transport, no verification
 * token and nothing that could send one. So the field is a contact detail,
 * stored and shown back and branched on by nothing — the position V33's bio is
 * in. The hint under it says so, because a field that looks like a login and is
 * not is a field somebody will one day try to sign in with.
 */
export function AccountPanel({
  initial,
  clientCount,
}: {
  initial: Account;
  /** For the delete confirmation, which names what is going. Null if unknown. */
  clientCount: number | null;
}) {
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  // Only checked once the field has been left, so a half-typed address is never
  // called wrong while it is still being typed. The same `onBlur` gate the map
  // link and the two social fields use.
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();

  const trimmed = email.trim();
  const emailBroken = touched && trimmed.length > 0 && !looksLikeEmail(trimmed);
  const dirty = name !== saved.name || email !== saved.email;

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await saveAccount({ name, email });
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      setSaved(result.account);
      setName(result.account.name);
      setEmail(result.account.email);
      setTouched(false);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        // What the press DID, not what the field was for — the field said that
        // already, twice, and a confirmation that repeats the hint is a
        // confirmation that has not confirmed anything.
        rest: 'Your profile and every new invite use it from now on.',
      });
    });
  }

  return (
    /*
      ── WHY THIS IS A SIDECAR AND NOT A 620px COLUMN ────────────────────────

      It WAS the column, and it was the profile's own defect one level up.
      MEASURED at 1536×695 before this: 620px of cards in a 1472px content area
      — 852px, 58% of the page, empty — while the same screen overflowed its
      window by 355px, so *Delete your account* was entirely below the fold.
      Width nobody could use, and not enough height.

      `settings/profile/layout.tsx` had already made this move for the same
      measurement; see `ui/Sidecar.tsx` for the tracks and why the rung is a
      container query rather than a breakpoint. The aside is the read-back of
      the account the form is editing, which is what the pattern is for.

      The class goes on `mainClassName`, not on the wrapper: `.sdc__main` is the
      form column, and `col gap4` is how these three cards have always stacked.
    */
    <Sidecar
      asideLabel="This account"
      mainClassName="col gap4"
      aside={
        <AccountAside name={name} email={email} phone={saved.phone} clientCount={clientCount} />
      }
    >
      {/* ── 1 · you ───────────────────────────────────────────────────────── */}
      <Card title="You">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/*
            ── ONE STATEMENT OF THIS FACT, NOT THREE ──────────────────────────

            This hint, `SaveRow`'s resting note and the save confirmation all
            used to say *your name is what a client sees on an invite* — three
            sentences in one 370px card, all carrying the same fact, none
            carrying the one the trainer beside it needs. The hint keeps it,
            because it is the one attached to the field it is about; the other
            two now say something that is true and is said nowhere else.
          */}
          <TextField
            label="Your name"
            hint="What a client sees when you invite them, and what every screen here greets you by."
            id="ac-name"
            value={name}
            maxLength={MAX_NAME}
            autoComplete="name"
            autoCapitalize="words"
            disabled={pending}
            onChange={(e) => {
              setName(e.target.value);
              if (message) setMessage(null);
            }}
          />

          {/*
            `Field`, not a hand-written `.fld` — this was the one piece of
            design-system markup left in this file, and `check-components` had
            it recorded as such. It is also the component that already draws the
            error in `.fld__e` and the hint in `.fld__h` under one `id`, which
            is what the copy below was doing by hand.
          */}
          <Field
            id="ac-email"
            className="mt3"
            label={<>Email <Optional /></>}
            error={emailBroken ? 'That doesn’t look like an email address.' : undefined}
            hint={
              /*
                Said plainly, because the field looks exactly like a login and
                is not one. A trainer who assumes otherwise finds out on the day
                they lose their SIM, which is the worst possible moment to learn
                it. Two sentences where there were three — the third said the
                app sends nothing to it today, which is the same promise as
                "never with this" from the other side.
              */
              'You sign in with your number, never with this. We keep it so there is a way to reach you that is not a WhatsApp message.'
            }
          >
            {(props) => (
              <input
                {...props}
                className="ctl"
                type="email"
                value={email}
                maxLength={MAX_EMAIL}
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="you@example.com"
                disabled={pending}
                onBlur={() => setTouched(true)}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (message) setMessage(null);
                }}
              />
            )}
          </Field>

          {/*
            ── THE SLOT IS RESERVED WHERE A MESSAGE IS POSSIBLE, NOT ALWAYS ────

            `MessageSlot` keeps its height whether or not it holds anything, so
            nothing below it moves when a write is refused — the right call on
            the OTP screens it was written for, where a message lands between a
            field and the button that produced it. On a resting settings form it
            was 38px of empty card sitting between the email hint and the note
            under it, MEASURED, every time this tab is opened.

            The invariant it exists for is kept exactly. A message here can only
            follow a Save, and Save is only drawn while `dirty || pending` — so
            the slot is mounted before the button it belongs to, stays mounted
            through the write, and stays for the confirmation afterwards
            (`message` is non-null on success, which is why it is in the test).
            Nothing on screen moves that was not already moving.
          */}
          {dirty || pending || message ? <MessageSlot message={message} /> : null}

          {/*
            The resting note says the thing that separates the two fields above
            it, which is the question a trainer actually has in front of this
            card — one of them leaves the building and the other never does.
            It used to restate the name hint verbatim; see the note on the
            field above.
          */}
          <SaveRow
            pending={pending}
            dirty={dirty}
            note="Only your name leaves this screen. Your email is never shown to a client."
          />
        </form>
      </Card>

      {/* ── 2 · signing in ──────────────────────────────────────────────────

          The wire is passed rather than imported by the component, because the
          client portal mounts the same four steps against `/v1/me/phone/*` and
          a component importing both sets of actions would register each half's
          writes in the other half's bundle. `PhoneChange`'s own docstring
          carries the rest of that argument. */}
      <Card title="Signing in">
        <PhoneChange
          phone={saved.phone}
          // The aside states it, above the fold and sticky. See `showNumber`.
          showNumber={false}
          wire={{
            start: startPhoneChange,
            verifyCurrent: verifyCurrentNumber,
            requestNew: requestNewNumber,
            confirmNew: confirmPhoneChange,
            cancel: cancelPhoneChange,
          }}
          intact="your clients, your money book and your history are all where they were"
        />
      </Card>

      {/* ── 3 · leaving ───────────────────────────────────────────────────── */}
      <Card
        title="Delete your account"
        aside={<><Tag tone="danger">Permanent</Tag></>}
      >
        <DeleteAccount phone={saved.phone} clientCount={clientCount} />
      </Card>
    </Sidecar>
  );
}

/** The same inline marker every profile tab uses. */
function Optional() {
  return <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>;
}
