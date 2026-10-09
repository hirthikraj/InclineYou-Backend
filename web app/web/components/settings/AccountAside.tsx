'use client';

import Link from 'next/link';

import { formatPhone } from '@/lib/auth/policy';
import { Card } from '@/web-components/ui/Card';
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
  phone,
  email,
  clientCount,
}: {
  phone: string;
  email: string;
  clientCount: number | null;
}) {
  return (
    <Card title="This account">
      {/* What is NOT in the form beside it. It used to open with an avatar, the name and the email — the three things the
          card to its left is editing — so a trainer read each twice. The number is the one fact that appears nowhere
          else on this screen, which is why the aside exists; mono, because it is read digit by digit against a phone. */}
      <FactList>
        <FactList.Row k="Signs in with">
          {phone ? <span className="mono">{formatPhone(phone)}</span> : <FactList.Blank />}
        </FactList.Row>
        {/* The SAVED email, so the read-back still says something the form does not: what is on file, not what is being typed. */}
        <FactList.Row k="Email">{email ? <span style={{ overflowWrap: 'anywhere' }}>{email}</span> : <FactList.Blank />}</FactList.Row>
        {clientCount !== null ? (
          <FactList.Row k="Clients">
            {clientCount} {clientCount === 1 ? 'client' : 'clients'}
          </FactList.Row>
        ) : null}
      </FactList>

      {/* The profile back-links to Settings and Settings linked nowhere. A WHOLE-ROW link, not a 28px pill drawn like a
          status tag: it says where it goes and why, and the row is the target. */}
      <Link href="/settings/profile" className="acx-link">
        <span>
          <b>Your profile</b>
          <i>What a client reads before they accept an invite.</i>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </Card>
  );
}
