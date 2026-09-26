'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { chooseRoster } from '@/lib/auth/actions';
import { Button } from '@/web-components/ui/Button';
import { CardBody } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';

/**
 * A client on two rosters, switching between them — **without signing out.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DATA, THE COOKIE AND THE ACTION ALL EXISTED. NO SCREEN CALLED THEM.
 *
 * `me.rosters` reaches the account screen and was used for exactly one thing:
 * `rosterCount={me.rosters.length}`, which changes one sentence inside the
 * delete copy. Meanwhile `setActiveClient` and `chooseRoster` are both written
 * (`lib/auth/session.ts`, `lib/auth/actions.ts`) and **`/sign-in/role` was the
 * only screen in the product that called them.** So changing which trainer you
 * were looking at meant signing out and back in — and until `ThisDevice`
 * shipped, a client on a phone could not sign out either.
 *
 * The irony was on the same screen. The visibility card tells a two-roster
 * client that *"each trainer sees only their own sessions with you. Neither can
 * see the other"* — which is the exact sentence that makes somebody want to go
 * and look at the other one.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * NOTHING NEW SERVER-SIDE, AND THAT IS NOT A COINCIDENCE
 *
 * `chooseRoster` writes one cookie and makes no server call, because the token
 * already covers every roster this number is on — `/sign-in/role`'s own
 * footnote: *"nothing here is a second account; it is the same sign-in, read
 * from the other side."* It also re-checks the id against the rosters the
 * SERVER just named rather than trusting the argument, so this component cannot
 * write a cookie that makes the portal 404.
 *
 * ── A ROUTER REFRESH AND NOT A `revalidatePath` ─────────────────────────────
 *
 * The cookie is what every read is scoped by (`getActiveClient` in
 * `lib/portal/api.ts` appends it as `?clientId=`), so the whole tree is stale
 * the moment it changes — not one path. `router.refresh()` re-runs the server
 * components for the route the client is standing on with the new cookie in
 * hand, which is the smallest correct answer. `chooseRoster` cannot do it: a
 * server action cannot revalidate against a cookie it has only just written.
 *
 * ── AND IT RENDERS NOTHING AT ONE ROSTER ────────────────────────────────────
 *
 * Which is most clients. A control offering to switch to the only thing there
 * is would be a question with one answer.
 */
export function RosterSwitch({
  rosters,
  activeClientId,
}: {
  rosters: { clientId: string; clientName: string; trainerName: string }[];
  /** Which one is open. `me.client.id`, so it is the server's answer and not the cookie's. */
  activeClientId: string;
}) {
  const others = rosters.filter((r) => r.clientId !== activeClientId);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (others.length === 0) return null;

  function open(clientId: string) {
    setFailure(null);
    start(async () => {
      const res = await chooseRoster(clientId);
      if (!res.ok) {
        /* The one way this fails is a roster that ended between the page
           loading and the press. Saying so beats "that did not work", because
           the recovery is different: there is nothing to retry. */
        setFailure('That trainer is not on your number any more. Reload to see the current list.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <CardBody divided>
      <h3 className="h5">Your other trainer{others.length > 1 ? 's' : ''}</h3>
      <p className="small mt2">
        Your number is on {rosters.length} lists. Opening one changes what every screen in here
        shows — your sessions, your plan and your progress with that trainer.
      </p>
      {failure && (
        <Message tone="err" alert className="mt3">
          {failure}
        </Message>
      )}
      <div className="col gap3 mt3">
        {others.map((r) => (
          /* A `.row` per roster rather than a `ListRow`: `ListRow`'s trailing
             slot is for a figure or a chevron on a row that NAVIGATES, and this
             one posts an action. `.lrow__s` would also ellipsise the trainer's
             name, which is the whole content of the row. */
          <div key={r.clientId} className="row gap3">
            <span className="small sp" style={{ color: 'var(--tx-ink)', minWidth: 0 }}>
              {r.trainerName}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => open(r.clientId)}
            >
              Open
            </Button>
          </div>
        ))}
      </div>
    </CardBody>
  );
}
