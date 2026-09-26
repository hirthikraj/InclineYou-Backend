'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { abandonPending } from '@/lib/auth/actions';
import { IconUser } from './Icons';
import { TrustLine } from './TrustLine';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

/**
 * §08 · 7e — a client with nobody.
 *
 * Reached three ways: declining the only invite, acknowledging the only removal,
 * or signing in later on a number whose memberships are all already answered and
 * gone.
 *
 * ── THE ONE THING THIS SCREEN MUST NOT DO IS READ AS A FAILURE ───────────────
 *
 * Nothing went wrong. There is simply nobody attached to this number right now,
 * and the fix is on somebody else's phone. So the headline states the fact, the
 * card says how to change it, and there is no error tone anywhere on the screen.
 *
 * ── AND THERE IS NO "I'M A TRAINER" BUTTON ───────────────────────────────────
 *
 * That is frame 3a's exit and it is wrong here. The design's §08 gives two
 * reasons and **one of them is now out of date, which makes the other one
 * load-bearing**: it says the door "would either fail at the server or quietly
 * convert somebody who declined one invite into a trainer with an empty roster."
 *
 * The first half is no longer true. `AuthService.claimTrainer` was widened for
 * trainer↔client duality (23 Aug 2026) and its comment is explicit: "a phone that
 * is already somebody's client can claim a trainer account too … the existing
 * `app_user` row is updated to `role = 'trainer'` rather than refused." So the
 * server would take it.
 *
 * Which leaves the second half as the only thing standing between somebody who
 * declined an invite and an accidental coaching account. It is a good reason on
 * its own — but it is now a decision this screen enforces rather than one the
 * backend enforces for it, and that is worth knowing before anybody "helpfully"
 * adds the button back.
 */
export function Unattached({
  phone,
  trainerName,
}: {
  phone: string | null;
  /** The trainer it just ended with, when this was reached from a decline or an
   *  acknowledgement rather than from a cold sign-in. Null at sign-in: the
   *  backend's unattached response carries no name and no memberships. */
  trainerName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function differentNumber() {
    if (pending) return;
    startTransition(async () => {
      await abandonPending();
      router.push('/sign-in');
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        Nobody is coaching you right now
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        {trainerName ? (
          <>That’s done with {trainerName}. Nothing else is attached to this number, </>
        ) : (
          <>Nothing went wrong. There is simply no trainer attached to this number, </>
        )}
        and the fix is on somebody else’s phone.
      </p>

      <Card style={{ marginTop: 20 }}>
        <Card.Body style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          {/* The glyph the phone uses on this card. It sits beside a heading that
              already says what it means, so it is aria-hidden like every other. */}
          <span
            style={{
              width: 38,
              height: 38,
              flex: '0 0 auto',
              borderRadius: 'var(--tx-r2)',
              background: 'var(--tx-surface-2)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--tx-ink-2)',
            }}
          >
            <IconUser size={19} />
          </span>
          <span>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-ink)' }}>
              How to get added
            </p>
            <p className="small" style={{ marginTop: 8 }}>
              Give your trainer the number you just used
              {phone ? (
                <>
                  {' '}
                  — <b className="mono">{phone}</b>
                </>
              ) : null}
              . When they add it you get a request here, and nothing is shared until you accept
              it.
            </p>
          </span>
        </Card.Body>
      </Card>

      {/*
        The phone adds one line the design does not, and it is worth keeping: it
        is the sentence that stops somebody waiting on this screen. Signing in
        again is the action, and it costs something small and knowable.
      */}
      <p className="small" style={{ marginTop: 14 }}>
        Signing in again costs one more code. Your number stays yours either way.
      </p>

      <Button
        variant="secondary"
        size="lg"
        style={{ marginTop: 12 }}
        onClick={differentNumber}
        disabled={pending}
      >
        {pending ? 'Starting again…' : 'Use a different number'}
      </Button>

      <TrustLine>
        There is no <b>I’m a trainer</b> on this screen, and that is deliberate: this number’s
        role is already client. Offering to open a coaching account would quietly convert somebody
        who declined one invite into a trainer with an empty roster.
      </TrustLine>
    </>
  );
}
