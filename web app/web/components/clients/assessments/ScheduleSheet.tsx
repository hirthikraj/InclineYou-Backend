'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { scheduleAssessment, startCycle } from '@/lib/assessments/actions';
import { templateShape, type TemplateWire } from '@/lib/assessments/vocab';
import type { ClientWire } from '@/lib/assessments/api';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';
import { TextField } from '@/web-components/ui/Field';

/**
 * PUT A CHECK-IN ON THE BOARD — three answers and a switch.
 *
 * Who, which blueprint, and when — once, or on a cycle.
 *
 * **Nothing is sent to the client in v1** (there is no portal), so the old
 * *send it now* switch is gone: the trainer takes the assessment in the session.
 * That is what the other two buttons are for — *Put it on the board* books it
 * for the day, and *Take it now* books it for today and opens the take screen.
 * A cycle books the first one in the same write and the server books each next
 * one when the last is finished.
 *
 * ── A DIALOG, NOT A ROUTE, AND NOT A DRAWER ─────────────────────────────────
 *
 * Three fields is not a screen, and a drawer would be the add-client flow's
 * shape — that one books a week and assigns a plan. This writes one row.
 */
const EVERY = [
  { value: 'once', label: 'Once', days: 0 },
  { value: '14', label: 'Every 2 weeks', days: 14 },
  { value: '28', label: 'Every 4 weeks', days: 28 },
  { value: '42', label: 'Every 6 weeks', days: 42 },
  { value: '56', label: 'Every 8 weeks', days: 56 },
  { value: '84', label: 'Every 12 weeks', days: 84 },
];

export function ScheduleSheet({
  clients,
  templates,
  clientId: presetClient,
  onClose,
}: {
  /** Not read when `clientId` is given. */
  clients: ClientWire[];
  templates: TemplateWire[];
  /** The client file this was opened from — the person is not asked twice. */
  clientId?: string;
  onClose: (booked: boolean) => void;
}) {
  const router = useRouter();
  const roster = clients.filter((c) => c.status !== 'archived');
  const [clientId, setClientId] = useState(presetClient ?? '');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate());
  const [every, setEvery] = useState('once');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const chosen = templates.find((t) => t.id === templateId) ?? null;
  const days = EVERY.find((e) => e.value === every)?.days ?? 0;

  /** `takeNow` books for TODAY (the server's own, in the workspace's zone) and opens the take screen. */
  function book(takeNow: boolean) {
    setError(null);
    start(async () => {
      const result =
        days > 0 && !takeNow
          ? await startCycle({ clientId, templateId, intervalDays: days, firstDueOn: date })
          : await scheduleAssessment({ clientId, templateId, dueOn: takeNow ? undefined : date });
      if (!result.ok) {
        setError(result.message ?? 'That did not save.');
        return;
      }
      onClose(true);
      if (takeNow && result.data && 'id' in result.data) {
        router.push(`/clients/assessments/${result.data.id}/take`);
      }
    });
  }

  return (
    <ModalHost onClose={() => onClose(false)} cover="frame" initialFocus=".asm-sched-who select">
      <Modal
        title="Schedule an assessment"
        width={460}
        foot={
          <>
            <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>Cancel</Button>
            {days === 0 && (
              <Button variant="secondary" onClick={() => book(true)} disabled={busy || !clientId || !templateId}>
                Take it now
              </Button>
            )}
            <Button variant="primary" onClick={() => book(false)} disabled={busy || !clientId || !templateId}>
              {busy ? 'Booking…' : days > 0 ? 'Start the cycle' : 'Put it on the board'}
            </Button>
          </>
        }
      >
        {error && <Message tone="err">{error}</Message>}

        {templates.length === 0 ? (
          <p style={{ margin: 0 }}>
            There is nothing to send yet. Write an assessment on the Templates tab first — it is
            the set of measurements and questions this would ask for.
          </p>
        ) : (
          <>
            {!presetClient && (
              <Select
                className="asm-sched-who"
                label="Client"
                value={clientId}
                placeholder="Pick a client"
                onChange={(e) => setClientId(e.target.value)}
                options={roster.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
            <Select
              className="mt3"
              label="Assessment"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              /* The shape, under the field, so the trainer can see WHAT they are
                 about to ask for without opening the editor. It is the same
                 sentence the Templates tab prints on the row. */
              hint={chosen ? templateShape(chosen) : undefined}
            />
            <Select
              className="mt3"
              label="How often"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              options={EVERY.map((e) => ({ value: e.value, label: e.label }))}
              hint={days > 0 ? 'The next one is booked from the day each is finished.' : undefined}
            />
            <TextField
              className="mt3"
              type="date"
              label={days > 0 ? 'First due on' : 'Due on'}
              value={date}
              hint="The session you will have a tape in your hand."
              onChange={(e) => setDate(e.target.value)}
            />
          </>
        )}
      </Modal>
    </ModalHost>
  );
}

/** A week out, as `YYYY-MM-DD` in the browser's own zone. */
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
