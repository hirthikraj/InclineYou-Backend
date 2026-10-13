'use client';

import { useState, useTransition } from 'react';

import { deleteAccount, leaveTrainer, sendDeletionCode, verifyDeletionCode } from '@/lib/portal/settings-actions';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';

type Stage = 'rest' | 'leave' | 'delete-ask' | 'delete-code' | 'delete-confirm';

/**
 * The two ways out, kept apart because they are different things. Leaving ends ONE arrangement: your trainer is told, your history stays yours to
 * download, and the number is free to accept somebody new. Deleting erases you — behind a code to your number, so a phone left unlocked can’t do it —
 * and the amounts and dates of what was paid stay with your trainer under *Former client*, because that is their revenue.
 */
export function LeaveDelete({ trainerName }: { trainerName: string }) {
  const first = trainerName.split(' ')[0];
  const [stage, setStage] = useState<Stage>('rest');
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string } | void>, next?: Stage) {
    setFailure(null);
    start(async () => {
      const res = await fn();
      if (res && !res.ok) return setFailure(res.message ?? 'That didn’t go through.');
      if (next) setStage(next);
    });
  }

  return (
    <>
      <Card>
        <Card.Head title={`Leave ${first}`} level={3} />
        <Card.Body>
          {stage !== 'leave' ? (
            <>
              <p className="pl__s">Ends your training with {first}. They’re told, plainly. Your history stays yours — download it first if you’d like a copy — and nothing about what you’ve paid changes.</p>
              <Button variant="secondary" onClick={() => setStage('leave')}>Leave {first}…</Button>
            </>
          ) : (
            <>
              <Message tone="warn">Leave {trainerName}? You’ll lose access to your plan and sessions here. You can still download your data afterwards, and another trainer can invite this number.</Message>
              {failure && <Message tone="err" className="mt3">{failure}</Message>}
              <div className="pwk__actions">
                <Button variant="danger" disabled={pending} onClick={() => run(() => leaveTrainer())}>{pending ? 'Leaving…' : 'Yes, leave'}</Button>
                <Button variant="ghost" disabled={pending} onClick={() => setStage('rest')}>Stay</Button>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="Delete my account" level={3} />
        <Card.Body>
          {stage === 'rest' || stage === 'leave' ? (
            <>
              <p className="pl__s">Erases you: your details, notes about you, assessments, plan and upcoming bookings go. What was paid stays as amounts and dates under <i>Former client</i> — that’s {first}’s revenue and isn’t yours to remove. This can’t be undone.</p>
              <Button variant="danger" onClick={() => setStage('delete-ask')}>Delete my account…</Button>
            </>
          ) : (
            <>
              {stage === 'delete-ask' && (
                <>
                  <p className="pl__s">We’ll send a 6-digit code to your number to check it’s you.</p>
                  {failure && <Message tone="err">{failure}</Message>}
                  <div className="pwk__actions">
                    <Button variant="secondary" disabled={pending} onClick={() => run(() => sendDeletionCode(), 'delete-code')}>{pending ? 'Sending…' : 'Send me a code'}</Button>
                    <Button variant="ghost" onClick={() => setStage('rest')}>Cancel</Button>
                  </div>
                </>
              )}
              {stage === 'delete-code' && (
                <>
                  <TextField label="The 6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                  {failure && <Message tone="err" className="mt3">{failure}</Message>}
                  <div className="pwk__actions">
                    <Button variant="secondary" disabled={pending || code.length !== 6} onClick={() => {
                      setFailure(null);
                      start(async () => {
                        const res = await verifyDeletionCode(code);
                        if (!res.ok) return setFailure(res.message);
                        setTicket(res.value.ticket);
                        setStage('delete-confirm');
                      });
                    }}>{pending ? 'Checking…' : 'Check code'}</Button>
                    <Button variant="ghost" onClick={() => setStage('rest')}>Cancel</Button>
                  </div>
                </>
              )}
              {stage === 'delete-confirm' && (
                <>
                  <Message tone="warn">Last step. Pressing this erases your account and signs you out everywhere.</Message>
                  {failure && <Message tone="err" className="mt3">{failure}</Message>}
                  <div className="pwk__actions">
                    <Button variant="danger" disabled={pending || !ticket} onClick={() => run(() => deleteAccount(ticket!))}>{pending ? 'Deleting…' : 'Delete my account'}</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => setStage('rest')}>Cancel</Button>
                  </div>
                </>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
