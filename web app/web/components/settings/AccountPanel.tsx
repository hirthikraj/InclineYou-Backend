'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { DeleteAccount } from '@/components/settings/DeleteAccount';
import { SaveRow } from '@/components/settings/IdentityForm';
import { PhoneChange } from '@/components/settings/PhoneChange';
import type { Message } from '@/lib/auth/copy';
import { saveAccount } from '@/lib/account/actions';
import type { Account } from '@/lib/account/api';
import { MAX_EMAIL, MAX_NAME, looksLikeEmail } from '@/lib/account/rules';

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
        rest: 'Your name is what clients see on an invite.',
      });
    });
  }

  return (
    <div className="col gap4" style={{ maxWidth: 620 }}>
      {/* ── 1 · you ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card__hd">
          <h2 className="card__t">You</h2>
        </div>
        <div className="card__b">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="fld">
              <label className="fld__l" htmlFor="ac-name">
                Your name
              </label>
              <input
                className="ctl"
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
                aria-describedby="ac-name-h"
              />
              <span className="fld__h" id="ac-name-h">
                What a client sees when you invite them, and what every screen here greets you by.
              </span>
            </div>

            <div className="fld" style={{ marginTop: 18 }}>
              <label className="fld__l" htmlFor="ac-email">
                Email <Optional />
              </label>
              <input
                className="ctl"
                id="ac-email"
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
                aria-describedby="ac-email-h"
              />
              {emailBroken ? (
                <p className="fld__e" id="ac-email-h">
                  That doesn’t look like an email address.
                </p>
              ) : (
                <span className="fld__h" id="ac-email-h">
                  {/*
                    Said plainly, because the field looks exactly like a login
                    and is not one. A trainer who assumes otherwise finds out on
                    the day they lose their SIM, which is the worst possible
                    moment to learn it.
                  */}
                  You sign in with your number, never with this — we keep it so there is a way to
                  reach you that is not a WhatsApp message. We don’t send anything to it today.
                </span>
              )}
            </div>

            <MessageSlot message={message} />

            <SaveRow
              pending={pending}
              dirty={dirty}
              note="Your name is what a client sees on an invite."
            />
          </form>
        </div>
      </div>

      {/* ── 2 · signing in ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card__hd">
          <h2 className="card__t">Signing in</h2>
        </div>
        <div className="card__b">
          <PhoneChange phone={saved.phone} />
        </div>
      </div>

      {/* ── 3 · leaving ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card__hd">
          <h2 className="card__t">Delete your account</h2>
          <span className="tag tag--danger">Permanent</span>
        </div>
        <div className="card__b">
          <DeleteAccount phone={saved.phone} clientCount={clientCount} />
        </div>
      </div>
    </div>
  );
}

/** The same inline marker every profile tab uses. */
function Optional() {
  return <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>;
}
