'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { BuilderData, ShelfData } from '@/lib/programs/api';
import { createTemplate } from '@/lib/programs/actions';
import { GOALS } from '@/lib/programs/blueprint';
import { TopBar } from '@/components/shell/TopBar';
import { Builder } from './Builder';
import { CloseIcon, PlusIcon } from './Icons';
import { Shelf } from './Shelf';
import { ProgramsTabs } from './tabs';

/**
 * `/programs` AND `/programs/:id` — one screen, two states.
 *
 * "The list and the builder are one screen" is the information architecture's
 * own row for this route, and what the page this replaces did not do: it had
 * three template chips in a toolbar and no way to see six programs, their shape,
 * or who was on them.
 *
 * With a program open the BUILDER owns the page — header, shelf and plane —
 * because everything the header says belongs to the draft it is holding. With
 * nothing open this file draws the shelf beside an empty pane, which is the
 * first-run screen and the "pick one" screen at once.
 */
export function Programs({
  data,
  open,
}: {
  data: ShelfData;
  /** The template being built, when the URL names one. */
  open: BuilderData | null;
}) {
  const [creating, setCreating] = useState(false);
  const templates = open ? open.templates : data.templates;

  const shelf = (
    <Shelf
      templates={templates}
      selectedId={open?.template.id ?? null}
      onNew={() => setCreating(true)}
    />
  );

  return (
    <>
      <TopBar crumb={open ? `Programs · ${open.template.name}` : 'Programs'} onSearch={() => {}} />

      <main className="main body--flush pg" id="main-content">
        {open ? (
          <Builder
            template={open.template}
            assignments={open.assignments}
            clients={open.clients}
            names={open.names}
            shelf={shelf}
            shelfCount={templates.length}
          />
        ) : (
          <>
            <div className="ph">
              <div className="ph__row">
                <div>
                  <h1 className="ph__t">Programs</h1>
                  <p className="ph__sub">
                    {templates.length === 0
                      ? 'What your clients do, written once and assigned many times'
                      : `${templates.length} program${templates.length === 1 ? '' : 's'} on the shelf`}
                  </p>
                </div>
                <div className="ph__acts">
                  <button className="btn btn--primary" type="button" onClick={() => setCreating(true)}>
                    <PlusIcon />
                    New program
                  </button>
                </div>
              </div>
              {/* Inside `.ph` so it does not scroll away with the list, and drawn
                  even with a program open — the reason to open the exercise
                  library is strongest exactly then. */}
              <ProgramsTabs current="programs" templateCount={templates.length} />
            </div>

            <div className="split">
              {shelf}
              <div className="split__r pg__empty">
                {templates.length === 0 ? (
                  <FirstRun onNew={() => setCreating(true)} />
                ) : (
                  <p className="pg__none">Pick a program to open it.</p>
                )}
              </div>
            </div>
          </>
        )}

        {creating && <NewProgram onClose={() => setCreating(false)} />}
      </main>
    </>
  );
}

function FirstRun({ onNew }: { onNew: () => void }) {
  return (
    <div className="pg__firstrun">
      <h2 className="h5">Nothing on the shelf yet</h2>
      <p className="small">
        A program is a blueprint: days, weeks and the exercises in them. You write it once and give
        each client their own copy of it — editing the blueprint afterwards never touches anybody who
        is already training on one.
      </p>
      <button className="btn btn--primary btn--lg" type="button" onClick={onNew}>
        <PlusIcon />
        Write your first program
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────── the new-program form ── */

/**
 * Four answers, and three of them are the shape.
 *
 * The day count and the week count are asked HERE rather than left to the
 * builder's toolbar because they are the first thing a trainer knows about a
 * block — "a four-week, three-day upper/lower" is how one is described out loud
 * — and because a template created with neither writes NULL to both columns,
 * which is the state the day list has to be guessed back from.
 */
function NewProgram({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<string>('');
  const [days, setDays] = useState(3);
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createTemplate({
      name,
      goal: goal || null,
      weeks,
      trainingDays: Array.from({ length: days }, (_, i) => i + 1),
      dayLabels: Object.fromEntries(Array.from({ length: days }, (_, i) => [String(i + 1), ''])),
    });
    setBusy(false);
    if (result.ok) router.push(`/programs/${result.value.id}`);
    else setError(result.message);
  }

  return (
    <div className="pg__scrim" role="dialog" aria-modal="true" aria-label="New program">
      <div className="pg__dialog">
        <header className="pg__panelhd">
          <p className="pg__panelt">New program</p>
          <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="pg__panelb">
          <label className="fld">
            <span className="fld__l">Name</span>
            <input
              ref={field}
              className="ctl"
              value={name}
              placeholder="Push / Pull / Legs"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) void submit();
              }}
            />
          </label>

          <div className="fld">
            <span className="fld__l">Goal</span>
            <div className="tools">
              {GOALS.map(g => (
                <button
                  key={g.key}
                  className="chip"
                  type="button"
                  aria-pressed={goal === g.label}
                  onClick={() => setGoal(goal === g.label ? '' : g.label)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <span className="fld__h">
              It is a tag on the shelf, and you can write your own later. Nothing depends on it.
            </span>
          </div>

          <div className="fldrow">
            <label className="fld fld--w2">
              <span className="fld__l">Days a week</span>
              <select className="ctl" value={days} onChange={e => setDays(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <option key={n} value={n}>
                    {n} day{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld fld--w2">
              <span className="fld__l">How many weeks</span>
              <input
                className="ctl"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={e => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          <p className="small">
            Days are <b>slots</b>, not weekdays — Day 1, Day 2, Day 3. Which weekday each one lands on
            is chosen per client when you assign it, because that is the client&rsquo;s to decide.
          </p>

          {error && (
            <div className="why why--warn">
              <p>{error}</p>
            </div>
          )}
        </div>

        <footer className="pg__panelft">
          <button className="btn btn--secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? 'Creating…' : 'Create and start building'}
          </button>
        </footer>
      </div>
    </div>
  );
}
