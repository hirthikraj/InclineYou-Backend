'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { TemplateWire } from '@/lib/programs/api';
import {
  GOALS,
  daysOf,
  goalKeyOf,
  toEntries,
  weekCountOf,
  type GoalKey,
} from '@/lib/programs/blueprint';
import { PlusIcon, SearchIcon } from './Icons';

/**
 * THE SHELF — the left half of "the list and the builder are one screen".
 *
 * The IA's own row, and what the page this replaces did not do: it had three
 * template chips in a toolbar and no way to see six programs, their shape, or
 * who was on them.
 *
 * ── THE SHAPE IS THE THING BEING CHOSEN BETWEEN ──────────────────────────────
 *
 * Ported from the app's `WeekShape`: seven cells, the filled ones being the
 * slots this template trains. "8 weeks, 9 clients" says nothing about whether it
 * trains five days or three, and *how many days a week* is the first question a
 * trainer answers when they pick a block for somebody.
 *
 * The cells are ordinal slots, not weekdays — the same law that gives the
 * builder no Rest column. So the strip is "three of seven possible days", drawn
 * left-packed, and it deliberately does not claim to be Mon–Sun.
 */
export function Shelf({
  templates,
  selectedId,
  onNew,
}: {
  templates: TemplateWire[];
  selectedId: string | null;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [goal, setGoal] = useState<GoalKey | null>(null);

  const rows = useMemo(
    () =>
      templates.map(t => {
        const entries = toEntries(t.exercises);
        return {
          template: t,
          days: daysOf(t, entries),
          weeks: weekCountOf(t, entries),
          goalKey: goalKeyOf(t.goal),
        };
      }),
    [templates],
  );

  /* The chips count what they would show, and they are drawn only for goals
     something is filed under. Five chips over an empty shelf is five ways to
     find nothing. */
  const counts = useMemo(() => {
    const out = new Map<GoalKey, number>();
    for (const row of rows) out.set(row.goalKey, (out.get(row.goalKey) ?? 0) + 1);
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      if (goal && row.goalKey !== goal) return false;
      if (!q) return true;
      return (
        row.template.name.toLowerCase().includes(q) ||
        (row.template.goal ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, goal]);

  return (
    <div className="split__l">
      <div className="split__hd">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search your programs"
            aria-label="Search programs"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>

        <div className="tools" role="group" aria-label="Filter by goal">
          <button
            className="chip"
            type="button"
            aria-pressed={goal === null}
            onClick={() => setGoal(null)}
          >
            All {templates.length}
          </button>
          {GOALS.filter(g => (counts.get(g.key) ?? 0) > 0).map(g => (
            <button
              key={g.key}
              className="chip"
              type="button"
              aria-pressed={goal === g.key}
              onClick={() => setGoal(goal === g.key ? null : g.key)}
            >
              {g.label} {counts.get(g.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="split__scroll">
        {filtered.length === 0 ? (
          <p className="pg__none">
            {templates.length === 0 ? 'No programs yet.' : 'No programs match.'}
          </p>
        ) : (
          <ul className="pg__shelf">
            {filtered.map(row => (
              <li key={row.template.id}>
                <ShelfRow
                  template={row.template}
                  days={row.days}
                  weeks={row.weeks}
                  selected={row.template.id === selectedId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pg__shelffoot">
        <button className="btn btn--lg btn--secondary pg__wide" type="button" onClick={onNew}>
          <PlusIcon />
          New program
        </button>
      </div>
    </div>
  );
}

function ShelfRow({
  template,
  days,
  weeks,
  selected,
}: {
  template: TemplateWire;
  days: number[];
  weeks: number;
  selected: boolean;
}) {
  const active = new Set(days);
  const clients = template.activeAssignedCount;

  return (
    <Link
      className="lrow"
      href={`/programs/${template.id}`}
      aria-current={selected ? 'page' : undefined}
    >
      <span className="lrow__m">
        <span className="lrow__t">{template.name}</span>
        <span className="lrow__s">
          {/* The figure the brief calls "times assigned", and it is the ACTIVE
              count rather than the lifetime one. A trainer reading this row is
              deciding whether it is safe to edit, and a client who finished this
              block in March is not somebody an edit can reach. The lifetime
              figure is on the builder's header, where there is room to say which
              is which. */}
          {clients === 0
            ? 'Nobody on this yet'
            : `${clients} client${clients === 1 ? '' : 's'} on this`}
          {' · '}
          {days.length} day{days.length === 1 ? '' : 's'} a week
          {template.goal ? ` · ${template.goal}` : ''}
        </span>
      </span>
      <span className="lrow__r">
        <span className="shape" aria-hidden="true">
          {/* The bare `.shape__c` IS the off state — a `--off` modifier was in
              the page this replaces and is in no stylesheet, so every cell drew
              filled. The three tones cycle by slot so Push/Pull/Legs is legible
              without a legend, which is what §22 says the tones are for. */}
          {[1, 2, 3, 4, 5, 6, 7].map(slot => (
            <i
              key={slot}
              className={active.has(slot) ? `shape__c shape__c--${((slot - 1) % 3) + 1}` : 'shape__c'}
            />
          ))}
        </span>
        <span className="lrow__n">{weeks} wk</span>
      </span>
    </Link>
  );
}
