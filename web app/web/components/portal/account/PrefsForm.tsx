'use client';

import { useState, useTransition } from 'react';

import { removePushSubscription, savePrefs, savePushSubscription, type PrefsChange } from '@/lib/portal/settings-actions';
import type { PrefsWire } from '@/lib/portal/settings-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';
import { SwitchRow } from '@/web-components/ui/Switch';

const NOTICES: { key: keyof PrefsWire['notify']; title: string; example: string }[] = [
  { key: 'sessionReminder', title: 'Session reminders', example: 'The evening before, so a booked session never catches you out' },
  { key: 'programUpdated', title: 'Plan changes', example: 'When your trainer updates your program' },
  { key: 'trainerNote', title: 'Notes from your trainer', example: 'A line after a session, or a weekly one' },
  { key: 'assessment', title: 'New assessments', example: 'When one is waiting for you' },
  { key: 'personalBest', title: 'Personal bests', example: 'A new best on a lift' },
  { key: 'packChanged', title: 'Package changes', example: 'Sessions added, paused or extended' },
];

function toKey(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromKey(key: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The client's settings. Every switch saves as it is tapped (a switch has saved by the time the thumb lands), naming only what it changed, and the
 * screen is the server's answer rather than a guess — so a refusal puts the switch back where it was and says why. About one notice a day at most is
 * the product's promise, not a field. Turning WhatsApp on is consent to be messaged by the platform, and the line beside it says exactly that.
 */
export function PrefsForm({ prefs: initial, trainerFirstName, vapidKey }: { prefs: PrefsWire; trainerFirstName: string; vapidKey: string | null }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [nominee, setNominee] = useState(initial.nominee ?? { name: '', phone: '' });
  const [nomineeMsg, setNomineeMsg] = useState<string | null>(null);
  const [pushId, setPushId] = useState<string | null>(null);

  function change(c: PrefsChange, after?: (p: PrefsWire) => void) {
    setFailure(null);
    start(async () => {
      const res = await savePrefs(c, prefs.version);
      if (res.ok) {
        setPrefs(res.value);
        after?.(res.value);
      } else setFailure(res.message);
    });
  }

  async function setPush(on: boolean) {
    setFailure(null);
    if (!on) {
      if (pushId) await removePushSubscription(pushId);
      setPushId(null);
      return change({ channels: { push: false } });
    }
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidKey) throw new Error('This browser can’t receive notifications.');
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromKey(vapidKey) });
      const p256dh = sub.getKey('p256dh');
      const auth = sub.getKey('auth');
      if (!p256dh || !auth) throw new Error('This browser didn’t give us what we need to send you notifications.');
      const res = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: toKey(new Uint8Array(p256dh)), auth: toKey(new Uint8Array(auth)) }, userAgent: navigator.userAgent.slice(0, 280) });
      if (!res.ok) throw new Error(res.message);
      setPushId(res.value.id);
      change({ channels: { push: true } });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'We couldn’t turn notifications on.');
    }
  }

  function saveNominee() {
    setNomineeMsg(null);
    const n = nominee.name.trim();
    const p = nominee.phone.replace(/[\s-]/g, '');
    if (!n && !p) return change({ nominee: null }, () => setNomineeMsg('Removed.'));
    if (!n || !p) return setNomineeMsg('Add both a name and a number, or neither.');
    change({ nominee: { name: n, phone: p.startsWith('+') ? p : `+91${p}` } }, () => setNomineeMsg('Saved.'));
  }

  return (
    <div className="pl">
      <div aria-live="polite">{failure ? <Message tone="err">{failure}</Message> : null}</div>

      <Card>
        <Card.Head title="Your workouts" level={3} />
        <Card.Body>
          <SwitchRow checked={prefs.autoRestTimer} disabled={pending} title="Start the rest timer for me" example="After you log a set that has a rest, the clock starts" onChange={(v) => change({ autoRestTimer: v })} />
          <SwitchRow checked={prefs.hideWeight} disabled={pending} title="Hide my body weight" example="It isn’t asked in your assessments and isn’t shown back to you" onChange={(v) => change({ hideWeight: v })} />
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="What we tell you about" level={3} />
        <Card.Body>
          {NOTICES.map((n) => (
            <SwitchRow key={n.key} checked={prefs.notify[n.key]} disabled={pending} title={n.title} example={n.example} onChange={(v) => change({ notify: { [n.key]: v } })} />
          ))}
          <p className="pl__s" style={{ marginTop: 10 }}>About one notice a day at most. Turning a category off means it never appears, here or anywhere else.</p>
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="Where we can reach you" level={3} />
        <Card.Body>
          <SwitchRow checked={prefs.channels.whatsapp} disabled={pending} title="WhatsApp" example={prefs.whatsapp.reminderOffered ? `Lets InclineYou message you on WhatsApp — for session reminders ${trainerFirstName} has switched on` : 'Lets InclineYou message you on WhatsApp'} onChange={(v) => change({ channels: { whatsapp: v } })} />
          {prefs.whatsapp.optedIn && !prefs.channels.whatsapp && <p className="pl__s">You said yes before, so turning it back on isn’t a new agreement.</p>}
          {vapidKey && <SwitchRow checked={prefs.channels.push} disabled={pending} title="Notifications on this device" example="A short notice on this phone or computer, even when the site isn’t open" onChange={(v) => void setPush(v)} />}
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="A person to speak for you" level={3} />
        <Card.Body>
          <p className="pl__s">Optional. Someone you name who may act for you on your data if you can’t — for example to ask for it to be erased. Leave both empty for none.</p>
          <div className="as__grid">
            <TextField label="Their name" value={nominee.name} maxLength={80} onChange={(e) => setNominee({ ...nominee, name: e.target.value })} />
            <TextField label="Their number" hint="With country code, like +919841000001" inputMode="tel" value={nominee.phone} onChange={(e) => setNominee({ ...nominee, phone: e.target.value })} />
          </div>
          <div className="pwk__actions">
            <Button variant="secondary" disabled={pending} onClick={saveNominee}>Save</Button>
            {nomineeMsg && <span className="pl__s" role="status">{nomineeMsg}</span>}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
