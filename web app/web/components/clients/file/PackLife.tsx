'use client';

import { useState, useTransition } from 'react';

import type { ClientPackageWire, PackageAdjustmentWire } from '@/lib/clients/client-api';
import { endPack, extendPack, pausePack, resumePack } from '@/lib/clients/package-actions';

import { longDateStr } from './shared';
import { Button } from '@/web-components/ui/Button';
import { TextField } from '@/web-components/ui/Field';

/**
 * THE THREE MESSY REALITIES — pause, resume, extend.
 *
 * A client goes to Kerala for three weeks. A trainer throws in a fortnight
 * because somebody had a bad month. Neither of those was representable before
 * V30, and a trainer who cannot represent them keeps a parallel notebook —
 * which is the moment they have half-left the product, because the notebook
 * becomes the true copy and this becomes the one they update when they remember.
 *
 * ── PAUSED IS A STATE THE SCREEN SHOUTS ─────────────────────────────────────
 *
 * `paused_at` is a column and not a `status` value, precisely so every other
 * read keeps counting a travelling client as the active client they still are.
 * The cost of that choice is that nothing about `status` says they are away — so
 * this component says it, loudly, on the pack card. A pause nobody can see is a
 * pause a trainer forgets to end, and a pack that stays frozen for a month is
 * worse than one that was never paused.
 *
 * ── EXTENDING ASKS FOR A REASON AND DOES NOT REQUIRE ONE ────────────────────
 *
 * Goodwill is the cheapest thing a trainer gives away and the easiest to forget
 * having given. The reason is what turns "I think I've stretched this before"
 * into a line they can read. But a required field between a trainer on a gym
 * floor and a two-second kindness is a field that stops the kindness, so it is
 * offered and never demanded — the same call `payment.note` and V29's notes make.
 *
 * ── AND A DEAL CAN END EARLY ────────────────────────────────────────────────
 *
 * *End this pack* (R74) is for the client who switches from the floor to home
 * visits without leaving: the pack closes `cancelled` and its sessions stop
 * being charged. Only once nothing is owed or pending — the server says so if
 * there is, and the sentence names the two ways out.
 */

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Mode = null | 'pause' | 'resume' | 'extend' | 'end';

export function PackLife({
  clientId,
  pkg,
  adjustments,
}: {
  clientId: string;
  pkg: ClientPackageWire;
  adjustments: PackageAdjustmentWire[];
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('14');
  const [effective, setEffective] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const paused = pkg.pausedAt != null;
  const pausedDays = pkg.pausedDays ?? 0;
  const given = adjustments
    .filter((a) => a.kind === 'extend')
    .reduce((sum, a) => sum + a.days, 0);

  function close(): void {
    setMode(null);
    setReason('');
    setError(null);
  }

  function run(fn: () => Promise<{ ok: boolean; message?: string }>): void {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) close();
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--tx-line)', paddingTop: 12 }}>
      {/* ── The paused banner ──────────────────────────────────────────── */}
      {paused && (
        <p className="msg msg--warn" style={{ marginBottom: 10 }}>
          <span>
            <b>Paused since {longDateStr(pkg.pausedAt as number)}.</b> No session will be
            charged against this pack while it is stopped, and its expiry is not running
            down. Restart it and the days it lost go back on the end date.
          </span>
        </p>
      )}

      {/* ── What has already happened to it ────────────────────────────── */}
      {(pausedDays > 0 || given > 0) && !paused && (
        <p className="small" style={{ marginBottom: 10, color: 'var(--tx-ink-3)' }}>
          {given > 0 && (
            <>
              <b>{given} days</b> given on this pack
              {pausedDays > 0 ? ', and ' : '. '}
            </>
          )}
          {pausedDays > 0 && (
            <>
              <b>{pausedDays} days</b> paused and returned.{' '}
            </>
          )}
          That is why the end date is not the one it was sold with.
        </p>
      )}

      {/* ── The three buttons ──────────────────────────────────────────── */}
      {mode === null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {paused ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEffective(todayISO());
                setMode('resume');
              }}
            >
              Start it again
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEffective(todayISO());
                setMode('pause');
              }}
            >
              Pause it
            </Button>
          )}
          {!paused && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode('extend')}
            >
              Give more time
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setMode('end')}>
            End this pack
          </Button>
        </div>
      )}

      {/* ── End it early ───────────────────────────────────────────────── */}
      {mode === 'end' && (
        <div>
          <p className="small" style={{ marginBottom: 8 }}>
            Closes this pack now. Sessions left on it are no longer charged — the next
            live pack of the same kind takes them, or they go uncharged. It can&rsquo;t be
            reopened; sell a new pack if you change your mind.
          </p>
          {error && (
            <p className="msg msg--warn mt3" role="alert">
              <span>{error}</span>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="danger" size="sm" disabled={pending}
              onClick={() => run(() => endPack(clientId, pkg.id))}>
              {pending ? 'Ending…' : 'End it'}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={close}>
              Keep it running
            </Button>
          </div>
        </div>
      )}

      {/* ── Pause / resume ─────────────────────────────────────────────── */}
      {(mode === 'pause' || mode === 'resume') && (
        <div>
          <p className="small" style={{ marginBottom: 8 }}>
            {mode === 'pause'
              ? 'Stops the clock. The pack stays theirs and nothing is charged against it until you start it again.'
              : 'Starts the clock. The days it spent paused go back onto the end date, so nobody loses time they paid for.'}
          </p>
          <div className="fld">
            <label className="fld__l" htmlFor="pl-date">
              {mode === 'pause' ? 'Paused from' : 'Back from'}
            </label>
            <input
              className="ctl"
              id="pl-date"
              type="date"
              value={effective}
              onChange={(e) => setEffective(e.target.value)}
            />
            <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
              Back-date it to the day it actually happened. Catching up on a Sunday
              should not cost anybody three days.
            </p>
          </div>
          {/* A resume carries no reason on the wire — the pause did. */}
          {mode === 'pause' && (
            <TextField
              label={<>Why <span className="ink3">· optional</span></>}
              id="pl-reason"
              className="mt3"
              type="text"
              value={reason}
              maxLength={200}
              placeholder="Kerala till the 20th"
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          {error && (
            <p className="msg msg--warn mt3" role="alert">
              <span>{error}</span>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  mode === 'pause'
                    ? pausePack(clientId, pkg.id, { reason, effectiveDate: effective })
                    : resumePack(clientId, pkg.id, { effectiveDate: effective }),
                )
              }
            >
              {pending ? 'Saving…' : mode === 'pause' ? 'Pause it' : 'Start it again'}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Extend ─────────────────────────────────────────────────────── */}
      {mode === 'extend' && (
        <div>
          <p className="small" style={{ marginBottom: 8 }}>
            Pushes the end date out. The sessions do not change — this is time, not
            sessions.
          </p>
          <TextField
            label="How many days"
            id="pl-days"
            numeric
            type="number"
            min="1"
            max="3650"
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <div className="fld mt3">
            <label className="fld__l" htmlFor="pl-why">
              Why <span className="ink3">· optional</span>
            </label>
            <input
              className="ctl"
              id="pl-why"
              type="text"
              value={reason}
              maxLength={200}
              placeholder="Rough month, on me"
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
              Worth a few words. It is the difference between knowing you have already
              stretched this twice and only feeling it.
            </p>
          </div>
          {error && (
            <p className="msg msg--warn mt3" role="alert">
              <span>{error}</span>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => extendPack(clientId, pkg.id, Number(days), reason))}
            >
              {pending ? 'Saving…' : `Give ${Number(days) || 0} days`}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── The history ────────────────────────────────────────────────── */}
      {adjustments.length > 0 && mode === null && (
        <details style={{ marginTop: 12 }}>
          <summary className="small" style={{ cursor: 'pointer', color: 'var(--tx-ink-3)' }}>
            {adjustments.length} change{adjustments.length === 1 ? '' : 's'} to this pack
          </summary>
          <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            {adjustments.map((a) => (
              <li key={a.id}>
                <span className="mono" style={{ color: 'var(--tx-ink-3)' }}>
                  {longDateStr(a.effectiveAt)}
                </span>{' '}
                {adjustmentLabel(a)}
                {a.reason && <span style={{ color: 'var(--tx-ink-3)' }}> · {a.reason}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * A resume with zero days is not a no-op worth hiding — it is a pause that
 * happened and ended the same day, and the pair reads as nonsense with one half
 * missing. So it says "back the same day" rather than "0 days returned".
 */
function adjustmentLabel(a: PackageAdjustmentWire): string {
  if (a.kind === 'pause') return 'paused';
  if (a.kind === 'resume') {
    return a.days > 0 ? `back after ${a.days} days, all of them returned` : 'back the same day';
  }
  if (a.kind === 'extend') return `${a.days} days given`;
  if (a.kind === 'sessions') return `${a.sessions > 0 ? '+' : ''}${a.sessions} sessions corrected`;
  if (a.kind === 'session') return a.reversedAt ? 'a session charged, then undone' : 'a session charged';
  if (a.kind === 'due_date') return a.dueDate ? `due date moved to ${a.dueDate}` : 'due date cleared';
  return a.kind;
}
