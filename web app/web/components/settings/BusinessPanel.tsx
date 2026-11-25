'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { SaveRow } from '@/components/settings/IdentityForm';
import type { Message } from '@/lib/auth/copy';
import { saveBusiness } from '@/lib/practice/actions';
import { BUSINESS_LIMITS, INDIAN_STATES, addressLines, type BusinessWire, type BusinessWrite } from '@/lib/practice/types';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Select } from '@/web-components/ui/Select';
import { TextField } from '@/web-components/ui/Field';

/**
 * Settings → Business (api-contract 1.2, bz-a1/bz-a2; V46) — THE WORKSPACE'S BUSINESS.
 *
 * One business per workspace. Its name IS the workspace's name (the switcher shows it), so renaming it here renames the
 * workspace — and a solo workspace stops following the trainer's own name from then on. Four cards in Account's two-by-two
 * grid (`.acxw`), so the two tabs read as siblings: who the business is, how clients reach it, where it is, how they pay it.
 * One form and one Save: the server takes the whole thing, so no half of it can land without the other. The UPI ID is the one
 * exception: since V50 it is edited on Business → Payment setup, and this form no longer sends it (absent = leave it).
 *
 * Only the workspace's OWNER may change it. Anybody else sees the same cards with the fields read-only and a line saying
 * whose it is to change — never a Save that would answer 403.
 *
 * No billing or tax section (GSTIN, PAN, bank) and no logo yet — both decided with the owner on 22 Nov 2026.
 */
type Draft = {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

function draftOf(b: BusinessWire): Draft {
  const a = b.address ?? {};
  return {
    name: b.name,
    tagline: b.tagline ?? '',
    phone: (b.phone ?? '').replace(/^\+91/, ''),
    email: b.email ?? '',
    line1: a.line1 ?? '',
    line2: a.line2 ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    pincode: a.pincode ?? '',
  };
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function BusinessPanel({ initial }: { initial: BusinessWire }) {
  const [saved, setSaved] = useState(initial);
  const [d, setD] = useState<Draft>(() => draftOf(initial));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const locked = !saved.canEdit || pending;

  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(saved));
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setD((x) => ({ ...x, [k]: e.target.value }));
    if (message) setMessage(null);
  };
  const leave = (k: keyof Draft) => () => setTouched((t) => ({ ...t, [k]: true }));

  // Shape checks, shown once a field has been left — never while it is still being typed.
  const errors = {
    name: touched.name && !d.name.trim() ? 'Your business needs a name.' : undefined,
    phone: touched.phone && d.phone.trim() && !/^[6-9]\d{9}$/.test(d.phone.replace(/[\s-]/g, '')) ? 'A 10-digit mobile number.' : undefined,
    email: touched.email && d.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) ? 'That doesn’t look like an email address.' : undefined,
    pincode: touched.pincode && d.pincode.trim() && !/^[1-9]\d{5}$/.test(d.pincode.trim()) ? 'Six digits, not starting with 0.' : undefined,
  };
  const broken = Object.values(errors).some(Boolean) || !d.name.trim();

  function submit() {
    setTouched({ name: true, phone: true, email: true, pincode: true });
    if (broken) return;
    setMessage(null);
    const write: BusinessWrite = {
      name: d.name.trim(),
      tagline: orNull(d.tagline),
      phone: orNull(d.phone.replace(/[\s-]/g, '')),
      email: orNull(d.email),
      address: { line1: orNull(d.line1), line2: orNull(d.line2), city: orNull(d.city), state: orNull(d.state), pincode: orNull(d.pincode) },
      // No upiVpa: it lives on Business → Payment setup since V50, and an absent key leaves it as it is.
    };
    start(async () => {
      const r = await saveBusiness(write);
      if (!r.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: r.message });
        return;
      }
      setSaved(r.business);
      setD(draftOf(r.business));
      setTouched({});
      setMessage({ tone: 'ok', icon: 'check', lead: 'Saved.', rest: 'Clients see these details when they pay you.' });
    });
  }

  const where = addressLines(saved.address);

  return (
    <form
      className="acxw"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="acx">
        <Card title="Your business">
          {!saved.canEdit && (
            <p className="small bz-lock">Only the owner of this workspace can change these details.</p>
          )}
          <TextField
            label="Business name"
            hint="Also the name of this workspace. Clients see it when they pay you."
            value={d.name}
            maxLength={BUSINESS_LIMITS.name}
            error={errors.name}
            disabled={locked}
            onBlur={leave('name')}
            onChange={set('name')}
          />
          <TextField
            className="mt3"
            label={<>Tagline <Optional /></>}
            hint={`${d.tagline.length}/${BUSINESS_LIMITS.tagline} · One line under the name.`}
            placeholder="Strength training for busy people"
            value={d.tagline}
            maxLength={BUSINESS_LIMITS.tagline}
            disabled={locked}
            onChange={set('tagline')}
          />
        </Card>

        <Card title="How clients reach it">
          <TextField
            label={<>Business phone <Optional /></>}
            hint="If clients should call a different number from the one you sign in with."
            inputMode="numeric"
            autoComplete="off"
            placeholder="98xxxxxx10"
            value={d.phone}
            maxLength={12}
            error={errors.phone}
            disabled={locked}
            onBlur={leave('phone')}
            onChange={set('phone')}
          />
          <TextField
            className="mt3"
            label={<>Business email <Optional /></>}
            type="email"
            autoComplete="off"
            placeholder="hello@yourstudio.in"
            value={d.email}
            maxLength={BUSINESS_LIMITS.email}
            error={errors.email}
            disabled={locked}
            onBlur={leave('email')}
            onChange={set('email')}
          />
        </Card>

        <Card title="Address">
          <TextField label={<>Address line 1 <Optional /></>} placeholder="Building, street" value={d.line1}
            maxLength={BUSINESS_LIMITS.line} disabled={locked} onChange={set('line1')} />
          <TextField className="mt3" label={<>Address line 2 <Optional /></>} placeholder="Area, landmark" value={d.line2}
            maxLength={BUSINESS_LIMITS.line} disabled={locked} onChange={set('line2')} />
          <div className="bz-row mt3">
            <TextField label="City" value={d.city} maxLength={BUSINESS_LIMITS.city} disabled={locked} onChange={set('city')} />
            <TextField label="PIN code" inputMode="numeric" value={d.pincode} maxLength={6} error={errors.pincode}
              disabled={locked} onBlur={leave('pincode')} onChange={set('pincode')} />
          </div>
          <Select
            className="mt3"
            label="State"
            value={d.state}
            disabled={locked}
            onChange={set('state')}
            options={[{ value: '', label: 'Choose a state or union territory' }, ...INDIAN_STATES.map((s) => ({ value: s, label: s }))]}
          />
          {where.length > 0 && !dirty && <p className="small mt3">On a bill: {where.join(', ')}</p>}
        </Card>

        {/* The UPI ID moved to Business → Payment setup (V50, 23 Nov 2026), beside the QR, the part-payment switch and,
            later, autopay — how clients pay is money, not the business's identity. Read here, edited there. */}
        <Card title="Payments">
          <p className="small">
            {saved.upiVpa ? <>Clients pay you by UPI at <b className="mono">{saved.upiVpa}</b>.</> : <>No UPI ID yet — clients can’t pay you from their portal.</>}
          </p>
          <p className="mt3"><Button variant="secondary" size="sm" href="/business/payment-setup">Open Payment setup</Button></p>
        </Card>
      </div>

      {saved.canEdit && (
        <div className="bz-save">
          {dirty || pending || message ? <MessageSlot message={message} /> : null}
          <SaveRow pending={pending} dirty={dirty} />
        </div>
      )}
    </form>
  );
}

function Optional() {
  return <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>;
}
