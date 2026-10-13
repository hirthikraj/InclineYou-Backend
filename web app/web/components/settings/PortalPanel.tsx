'use client';

import { useState, useTransition } from 'react';

import { savePortalSettings } from '@/lib/settings/portal-actions';
import type { PortalPatch, PortalSettings } from '@/lib/settings/portal-api';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { Select } from '@/web-components/ui/Select';
import { SwitchRow } from '@/web-components/ui/Switch';

/**
 * CLIENT PORTAL — the trainer's two decisions about it (api-contract 1.2, tr-a10).
 *
 * Two cards, one per decision, because they are about different things: what clients are SENT, and what they SEE.
 *
 * ── EACH CONTROL SAVES ON ITS OWN ────────────────────────────────────────────────────────────────────────────────────────
 * Both are made once and rarely revisited, and a Save button beneath a switch is a way to leave it half-set and not know. A
 * control is disabled while its write is in flight, and the card reads back what the server answered rather than what was
 * pressed.
 *
 * ── REMINDERS ARE OFF UNTIL THE TRAINER TURNS THEM ON, AND TURNING THEM ON OPTS NOBODY IN ─────────────────────────────────
 * The card says so, with the server's own count of who a reminder would actually reach (`reminderReach`): a trainer who switches
 * it on and sees *0 of 12* knows why nobody is getting one, instead of finding out from a client. The wording of the message is
 * shown and cannot be edited: it is the one approved template, and a field that looked editable would be a promise the platform
 * cannot keep.
 */
const TIMINGS = [
  { value: 'evening_before', label: 'The evening before' },
  { value: 'two_hours_before', label: 'Two hours before' },
];

export function PortalPanel({ initial }: { initial: PortalSettings }) {
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(patch: PortalPatch) {
    setError(null);
    start(async () => {
      const r = await savePortalSettings(patch, settings.version);
      if (r.ok) setSettings(r.settings);
      else setError(r.message);
    });
  }

  const reach = settings.reminderReach;

  return (
    <div className="acxw">
      <div className="acx">
        <Card title="Session reminders">
          <SwitchRow
            title="Remind clients before a session"
            example="A WhatsApp message from InclineYou’s number, for sessions you booked."
            checked={settings.sessionReminders}
            disabled={pending}
            onChange={(next) => save({ sessionReminders: next })}
          />

          <div className="ptl__row">
            <Select
              label="When"
              width={220}
              value={settings.reminderTiming}
              options={TIMINGS}
              disabled={pending || !settings.sessionReminders}
              onChange={(e) => save({ reminderTiming: e.target.value as PortalSettings['reminderTiming'] })}
            />
          </div>

          <p className="ptl__lbl">The message</p>
          <blockquote className="ptl__q">{settings.reminderText}</blockquote>
          <p className="small ink3">The wording is fixed. InclineYou fills in the session, your name and the time.</p>

          <p className="ptl__reach" role="status">
            {reach.onPortal === 0
              ? 'No client is on the portal yet, so a reminder would reach nobody.'
              : `A reminder would reach ${reach.optedIn} of the ${reach.onPortal} ${reach.onPortal === 1 ? 'client' : 'clients'} on the portal${
                  reach.excluded > 0 ? `, and you have excluded ${reach.excluded}` : ''
                }.`}
          </p>
          <p className="small ink3">
            Turning this on doesn’t sign anyone up. Each client agrees to WhatsApp messages themselves, in their own portal.
          </p>
        </Card>

        <Card title="What clients see">
          <SwitchRow
            title="Clients can see what they owe"
            example="Off hides the Payments screen for every client. You can still change it for one client from their file."
            checked={settings.clientsSeeMoney}
            disabled={pending}
            onChange={(next) => save({ clientsSeeMoney: next })}
          />
          <p className="small ink3">
            A client only ever sees their own package and payments. Never another client’s, and never your totals.
          </p>
        </Card>
      </div>

      {error && (
        <Message tone="err" alert>
          {error}
        </Message>
      )}
    </div>
  );
}
