'use client';

import { useState, useTransition } from 'react';

import { saveMyDetails, type DetailsChange, type MyDetailsWire } from '@/lib/portal/profile-actions';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';
import { Select } from '@/web-components/ui/Select';
import { Textarea } from '@/web-components/ui/Textarea';

const ACTIVITY = [
  { value: '', label: 'Not set' },
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Light — walks, the odd workout' },
  { value: 'moderate', label: 'Moderate — active most weeks' },
  { value: 'active', label: 'Active — training most days' },
  { value: 'very_active', label: 'Very active — physical job or twice a day' },
];

const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kathmandu', 'Europe/London', 'America/New_York', 'Australia/Sydney'];

/**
 * §5 · *Your details* — the five things a client may correct about themselves. The number and the date of birth are shown and are not
 * fields: a changed number goes through the trainer (it is the sign-in and the channel), and a date of birth is the adult-only check
 * the invite made. Only what changed is sent, with the version the screen was drawn from, so a second tab cannot be overwritten silently.
 */
export function MyDetailsForm({ details, trainerName }: { details: MyDetailsWire; trainerName: string }) {
  const [saved, setSaved] = useState(details);
  const [name, setName] = useState(details.name ?? '');
  const [goal, setGoal] = useState(details.goal ?? '');
  const [height, setHeight] = useState(details.heightCm == null ? '' : String(details.heightCm));
  const [timezone, setTimezone] = useState(details.timezone ?? 'Asia/Kolkata');
  const [activity, setActivity] = useState(details.activityLevel ?? '');
  const [failure, setFailure] = useState<{ message: string; field?: 'name' | 'height' } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const zones = ZONES.includes(timezone) || ZONES.includes(saved.timezone ?? '') ? ZONES : [timezone, ...ZONES];

  function save() {
    setFailure(null);
    setDone(false);
    const change: DetailsChange = {};
    const trimmed = name.trim();
    if (!trimmed) return setFailure({ message: 'Your name can’t be empty.', field: 'name' });
    if (trimmed !== (saved.name ?? '')) change.name = trimmed;
    if (goal.trim() !== (saved.goal ?? '')) change.goal = goal.trim() || null;
    if (height.trim() !== (saved.heightCm == null ? '' : String(saved.heightCm))) {
      const n = Number(height);
      if (height.trim() && (!Number.isFinite(n) || n < 50 || n > 250)) return setFailure({ message: 'Height is between 50 and 250 cm.', field: 'height' });
      change.heightCm = height.trim() ? n : null;
    }
    if (timezone !== (saved.timezone ?? '')) change.timezone = timezone;
    if (activity !== (saved.activityLevel ?? '')) change.activityLevel = activity || null;
    if (Object.keys(change).length === 0) return setDone(true);

    start(async () => {
      const res = await saveMyDetails(change, saved.version);
      if (!res.ok) return setFailure({ message: res.message });
      setSaved(res.details);
      setDone(true);
    });
  }

  return (
    <Card>
      <Card.Body>
        <TextField label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={failure?.field === 'name' ? failure.message : undefined} />
        <Textarea label="Your goal" hint={`${trainerName} sees this. Leave it empty if you’d rather not say.`} value={goal} limit={1000} rows={3} onChange={(e) => setGoal(e.target.value)} />
        <TextField label="Height (cm)" inputMode="decimal" numeric width={160} value={height} onChange={(e) => setHeight(e.target.value)} error={failure?.field === 'height' ? failure.message : undefined} />
        <Select label="How active are you now" value={activity} options={ACTIVITY} onChange={(e) => setActivity(e.target.value)} />
        <Select label="Time zone" hint="Your sessions and reminders are shown in this." value={timezone} options={zones.map((z) => ({ value: z, label: z.replace('_', ' ') }))} onChange={(e) => setTimezone(e.target.value)} />

        <TextField label="Mobile number" value={saved.phone ?? ''} readOnly hint={`This is how you sign in. To change it, ask ${trainerName}.`} />
        <TextField label="Date of birth" value={saved.dateOfBirth ?? ''} readOnly hint="Set when you joined." />

        <div aria-live="polite">
          {failure && !failure.field ? <Message tone="err" className="mt3">{failure.message}</Message> : null}
          {done ? <Message tone="ok" className="mt3">Saved.</Message> : null}
        </div>
        <Button variant="primary" size="lg" style={{ marginTop: 16 }} disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </Card.Body>
    </Card>
  );
}
