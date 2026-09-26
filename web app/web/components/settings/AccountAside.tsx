'use client';

import { formatPhone } from '@/lib/auth/policy';
import { Avatar } from '@/web-components/ui/Avatar';
import { Card } from '@/web-components/ui/Card';
import { Chip } from '@/web-components/ui/Chip';
import { FactList } from '@/web-components/ui/FactList';

/**
 * THE ACCOUNT'S STANDING REFERENCE — *whose account is this*, answered in full.
 *
 * ── THE SCREEN ALREADY CLAIMED TO ANSWER THIS, AND COULD NOT ───────────────
 *
 * `AccountPanel`'s own docstring says the question this section exists for is
 * *whose account is this* — "a trainer on a shared gym desktop looking to check
 * which account they are signed in to should not have to open a client-facing
 * profile to find out". MEASURED at 1536×695 before this was added: the answer
 * — the number — sat in the SECOND card, 554px down a 548px window. It was
 * below the fold on the screen built to show it, and the first thing a trainer
 * saw instead was an editable name field.
 *
 * It is a sticky aside rather than a fourth card for that reason. The answer
 * has to be true while the form beside it is being typed in, which is exactly
 * the case `Sidecar` exists for — see `ui/Sidecar.tsx`, and
 * `settings/profile/layout.tsx`, which made the same move one level down for
 * the same measurement.
 *
 * ── IT IS NOT THE SHELL'S PLATE AGAIN ──────────────────────────────────────
 *
 * The rail's account button carries an avatar and a name too, and this would be
 * dead weight if it stopped there. What it adds is the three facts that plate
 * does not hold and nothing else in the product does either: **the number you
 * sign in with**, the email, and what is hanging off the account. The avatar and
 * the name are here as the anchor that ties those to the plate — small, and
 * never the loudest thing in the column.
 *
 * ── AND IT HOLDS NO CONTROL ────────────────────────────────────────────────
 *
 * `Sidecar`'s contract: under 928px the aside is drawn ABOVE the form with
 * `order:-1` while the tab order still runs form-then-aside, which is only
 * honest while nothing in here has to be reached in sequence. One link out, and
 * it goes somewhere the trainer can always come back from.
 */
export function AccountAside({
  /** The DRAFT, not the saved row — the same call `ProfileAside` makes, so the
   *  plate is the name being typed rather than the one being replaced. */
  name,
  email,
  phone,
  /** Null when the roster would not load. The row is dropped rather than
   *  guessed at — see `countClients`, which swallows its own failure. */
  clientCount,
}: {
  name: string;
  email: string;
  phone: string;
  clientCount: number | null;
}) {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  return (
    <Card title="This account">
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        {/* Tinted off the NUMBER, not the name, so the colour is stable while
            the name beside it is being retyped. `avatarToken` is a hash, and a
            plate that changes hue on every keystroke reads as a glitch. */}
        <Avatar name={trimmedName || '?'} id={phone} size="lg" />
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <p className="h5" style={{ margin: 0 }}>
            {trimmedName || <span style={{ color: 'var(--tx-ink-3)' }}>No name yet</span>}
          </p>
          <p className="small" style={{ margin: 0, wordBreak: 'break-word' }}>
            {trimmedEmail || <span style={{ color: 'var(--tx-ink-3)' }}>No email</span>}
          </p>
        </div>
      </div>

      <FactList className="mt3">
        {/*
          The one fact on this screen that appears nowhere else in the product,
          and the reason the aside exists. Mono, because it is a number read
          digit by digit against a phone that is being held up next to it.
        */}
        <FactList.Row k="Signs in with">
          {phone ? <span className="mono">{formatPhone(phone)}</span> : <FactList.Blank />}
        </FactList.Row>

        {clientCount !== null ? (
          <FactList.Row k="Clients">
            {clientCount} {clientCount === 1 ? 'client' : 'clients'}
          </FactList.Row>
        ) : null}
      </FactList>

      {/*
        The profile back-links to Settings and Settings linked nowhere — the
        asymmetry a trainer feels as *I came from there, how do I get back*. The
        rail has the row, but the rail is a strip of icons, and this is the
        screen where the distinction between the two names actually matters:
        what is above is the account, what is behind this link is the pitch.

        A CHIP, not an inline link, and `ProfileAside` made the same call for
        the same reason one level down: `Chip` renders a `next/link` when it is
        given an href, so this is a real 28px target. MEASURED as prose first —
        15px tall, under the 24px floor, at every width from 390 to 1920.
      */}
      <div className="mt3">
        <Chip href="/settings/profile">Your profile</Chip>
        <p className="small mt2" style={{ marginBottom: 0 }}>
          The longer version — what a client reads before they accept an invite.
        </p>
      </div>
    </Card>
  );
}
