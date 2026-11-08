'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import type { Message } from '@/lib/auth/copy';
import { signOutDevice, signOutOtherDevices } from '@/lib/devices/actions';
import type { Device } from '@/lib/devices/api';
import { dateLabel, describeDevice, lastSeenLabel } from '@/lib/devices/describe';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/**
 * SIGNED-IN DEVICES — every browser this account is signed in on, each with *Sign out*, and *Sign out everywhere else*
 * (UC-AUTH-10 for a trainer, UC-CP-38 for a client; the same routes and the same component for both).
 *
 * The reason it exists is the shared machine: a gym's front-desk computer, a borrowed phone. Before it, a trainer who had
 * left a session open somewhere could end it only by changing their number or closing their account.
 *
 * This browser is marked and has no button: signing out HERE is the account menu's *Sign out*, which also clears every
 * cookie of the sitting. A device signed out from this list stops working on its next request.
 */
export function SignedInDevices({ initial }: { initial: Device[] | null }) {
  const [devices, setDevices] = useState(initial);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!devices) {
    return <p className="small">We couldn’t load your devices just now. Reload the page in a moment.</p>;
  }

  const others = devices.filter((d) => !d.current);
  // This browser first, then the rest by most recent use (the server's order).
  const ordered = [...devices.filter((d) => d.current), ...others];

  function act(key: string, write: () => ReturnType<typeof signOutOtherDevices>, done: string) {
    setMessage(null);
    setBusy(key);
    start(async () => {
      const result = await write();
      setBusy(null);
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      if (result.devices) setDevices(result.devices);
      setMessage({ tone: 'ok', icon: 'check', lead: done, rest: 'It stops working the next time it is used.' });
    });
  }

  return (
    <div>
      <ul className="devs" aria-label="Signed-in devices">
        {ordered.map((d) => (
          <li key={d.id} className="devs__row">
            <div className="devs__what">
              <b>
                {describeDevice(d.userAgent)} {d.current && <Tag tone="ok">This browser</Tag>}
              </b>
              <span className="small">
                {d.current ? 'Active now' : lastSeenLabel(d.lastSeenAt)} · signed in {dateLabel(d.issuedAt)}
              </span>
            </div>
            {!d.current && (
              <Button
                size="sm"
                disabled={pending}
                loading={busy === d.id}
                onClick={() => act(d.id, () => signOutDevice(d.id), `${describeDevice(d.userAgent)} is signed out.`)}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>

      {others.length === 0 && <p className="small mt3">You’re not signed in anywhere else.</p>}

      {message || pending ? <MessageSlot message={message} /> : null}

      {others.length > 1 && (
        <div className="mt3">
          <Button
            variant="danger"
            disabled={pending}
            loading={busy === 'others'}
            onClick={() => act('others', signOutOtherDevices, 'Every other device is signed out.')}
          >
            Sign out everywhere else
          </Button>
        </div>
      )}

      <p className="small mt3">
        Lists browsers only. If you use the InclineYou phone app, sign out inside the app.
      </p>
    </div>
  );
}
