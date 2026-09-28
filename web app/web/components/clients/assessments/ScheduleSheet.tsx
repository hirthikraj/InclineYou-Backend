'use client';

import { useState, useTransition } from 'react';

import { scheduleAssessment } from '@/lib/assessments/actions';
import { templateShape, type TemplateWire } from '@/lib/assessments/vocab';
import type { ClientWire } from '@/lib/assessments/api';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';
import { TextField } from '@/web-components/ui/Field';

/**
 * PUT A CHECK-IN ON THE BOARD — three answers and a switch.
 *
 * Who, which blueprint, and when. The fourth control is the one that is not
 * obvious: **send it now, or leave it booked.** `sendNow` is the trainer's call
 * rather than a consequence of the date — a check-in dated three weeks out that
 * goes out today is a client who has three weeks to find twenty minutes for it,
 * which is the whole point of scheduling one. It defaults to on, because the
 * other case is the rarer one and a screen that defaults to *booked* produces a
 * row nobody is waiting on.
 *
 * ── A DIALOG, NOT A ROUTE, AND NOT A DRAWER ─────────────────────────────────
 *
 * Three fields is not a screen, and a drawer would be the add-client flow's
 * shape — that one books a week and assigns a plan. This writes one row.
 */
export function ScheduleSheet({
  clients,
  templates,
  onClose,
}: {
  clients: ClientWire[];
  templates: TemplateWire[];
  onClose: (booked: boolean) => void;
}) {
  const roster = clients.filter((c) => c.status !== 'archived');
  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate());
  const [sendNow, setSendNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const chosen = templates.find((t) => t.id === templateId) ?? null;

  function book() {
    setError(null);
    start(async () => {
      const result = await scheduleAssessment({
        clientId,
        templateId,
        /* Local midday, not midnight. A date typed as `2026-10-11` becomes an
           instant, and midnight local in IST is `18:30Z` on the day BEFORE —
           so a row booked for the 11th reads as the 10th to anything printing
           the UTC day. Midday cannot cross a date line in either direction. */
        dueAt: new Date(`${date}T12:00:00`).toISOString(),
        sendNow,
      });
      if (!result.ok) {
        setError(result.message ?? 'That did not save.');
        return;
      }
      onClose(true);
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
            <Button variant="primary" onClick={book} disabled={busy || !clientId || !templateId}>
              {busy ? 'Booking…' : sendNow ? 'Send it' : 'Put it on the board'}
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
            <Select
              className="asm-sched-who"
              label="Client"
              value={clientId}
              placeholder="Pick a client"
              onChange={(e) => setClientId(e.target.value)}
              options={roster.map((c) => ({ value: c.id, label: c.name }))}
            />
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
            <TextField
              className="mt3"
              type="date"
              label="Due on"
              value={date}
              hint="The day you expect it back — usually the session you will have a tape in your hand."
              onChange={(e) => setDate(e.target.value)}
            />
            <Checkbox
              className="mt3"
              label="Send it to the client now"
              checked={sendNow}
              onChange={() => setSendNow(!sendNow)}
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
