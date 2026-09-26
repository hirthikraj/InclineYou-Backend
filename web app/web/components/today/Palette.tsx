'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AttentionItem } from '@/lib/today/deck';
import type { DeckSession } from '@/lib/today/deck';
import { formatMinute, minuteOfDay } from '@/lib/today/time';
import { Calendar, Clock, Dumbbell, Rupee, Search } from '@/components/shell/Icons';
import { PRIMARY } from '@/components/shell/nav';
import { Avatar } from '@/web-components/ui/Avatar';

/**
 * ⌘K.
 *
 * There is no phone equivalent, and its absence is the loudest tell that a desktop
 * app was ported from a phone.
 *
 * ── THE ACTIONS ARE SCOPED TO THE MATCH, AND THEY ARE THE QUEUE'S ACTIONS ────
 *
 * Type `kav` and the first thing offered is *Renew Kavya M's pack* — which is a
 * row of **Needs you**, three inches below and to the left, carrying the same
 * reason. The palette is not a second navigation system; it is the same ranked
 * queue reached by typing. Everything it offers about a person comes from the deck
 * that is already on screen, which is why it cannot drift from it.
 *
 * ── AND TWO THINGS ABOUT THE FRAME THIS REPLACES ─────────────────────────────
 *
 * It searched `mee` and returned *Meera Krishnan* and then *Ananya S* — a second
 * result containing no such string, in the one component whose entire job is
 * matching. And the deck behind it was BLANKED: four stat cards holding `&nbsp;`
 * and an empty table. A palette drawn over a blank screen cannot show what a
 * palette is for, which is that the thing you were doing is still there behind it.
 * This one opens over the real day, and it matches on substring only.
 */

export interface PaletteClient {
  id: string;
  name: string;
}

interface Row {
  key: string;
  group: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  /**
   * The same thing `label` says, as a string.
   *
   * `label` is a `ReactNode` because a client row draws an avatar inside it, and
   * an `aria-label` cannot be a node. Carried rather than derived so the two
   * cannot drift — every row already knows its own name at the point it is built.
   */
  plain: string;
  hint?: string;
  accel?: string;
  href: string;
}

const LIST_ID = 'pal-results';

/**
 * One icon per attention kind, in one place.
 *
 * It was `kind === 'pack' ? dumbbell : rupee` at two call sites, which made every
 * kind that is not a pack a money row — so `log` would have drawn a ₹ against
 * *Close Usha Menon*, and `quiet` already did. A lookup so a fourth kind cannot
 * silently inherit the wrong one.
 */
function kindIcon(kind: AttentionItem['kind']): React.ReactNode {
  if (kind === 'pack') return <Dumbbell size={16} />;
  if (kind === 'overdue') return <Rupee size={16} />;
  return <Clock size={16} />;
}

/** One definition, because the option and the input's pointer must agree. */
function optionId(row: Row): string {
  return `pal-opt-${row.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * Substring, case-insensitive, on the name. Nothing cleverer, and deliberately:
 * a fuzzy matcher that returns a client whose name does not contain what was typed
 * is the defect above, and a trainer with twenty-two clients does not need fuzz —
 * they need the four letters they typed to mean the four letters they typed.
 */
function matches(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

export function Palette({
  open,
  onClose,
  clients,
  attention,
  today,
}: {
  open: boolean;
  onClose: () => void;
  clients: PaletteClient[];
  attention: AttentionItem[];
  today: DeckSession[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  /*
   * NO RESET EFFECT, AND NO `useEffect` FOR FOCUS EITHER.
   *
   * The obvious shape is `useEffect(() => { if (open) { setQuery(''); … } },
   * [open])`, and it is wrong twice: setting state inside an effect costs a
   * cascading render, and a palette that keeps its state while closed is a
   * palette that reopens showing the last search.
   *
   * Both go away by making OPEN mean MOUNTED. The caller renders this component
   * only while it is open, so every open starts from the initial state and
   * `autoFocus` puts the caret in the field on the render that created it. The
   * `open` prop is kept in the signature because it is the caller's own state and
   * reading it here keeps the two from disagreeing.
   */

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    const out: Row[] = [];

    // The destinations, always reachable — a palette that offers nothing until
    // you type is a palette nobody learns.
    //
    // THE FIVE, FROM `nav.tsx`, RATHER THAN FOUR WRITTEN OUT HERE.
    //
    // This list used to be four hand-typed rows and it had already drifted: it
    // offered *Money* at `G M` when the rail's accelerator for it was `M`, and it
    // offered no way to reach the exercise library at all. Reading `PRIMARY`
    // means the palette cannot know about a destination the rail does not, or
    // miss one it does — the same argument `TabBar.tsx` makes for the bar.
    //
    // `Today` is included even though the palette is usually opened FROM it: it
    // is reachable from every other screen too, and a "Go to" list missing the
    // first destination reads as a bug rather than as an optimisation.
    //
    // The accelerator is `G` plus the rail's own letter, so the hint the palette
    // prints and the hint the rail prints are one string in one file.
    const destinations: Row[] = PRIMARY.map((d) => ({
      key: `go-${d.key}`,
      group: 'Go to',
      icon: d.icon,
      label: d.label,
      plain: `${d.label} — ${d.purpose}`,
      accel: `G ${d.accel}`,
      href: d.href,
    }));

    if (q === '') {
      // Nothing typed: offer the day. The two things a trainer opens this for
      // without a name in mind are the next session and the top of the queue.
      const next = today.find((s) => !s.done);
      if (next) {
        out.push({
          key: `sess-${next.id}`,
          group: 'Today',
          icon: <Dumbbell size={16} />,
          label: `${next.clientName} · ${formatMinute(minuteOfDay(next.at))}`,
          plain: `${next.clientName} at ${formatMinute(minuteOfDay(next.at))}`,
          hint: next.detail,
          href: `/clients/${next.clientId}`,
        });
      }
      attention.slice(0, 3).forEach((item) => {
        out.push({
          key: `att-${item.key}`,
          group: 'Needs you',
          icon: kindIcon(item.kind),
          label: `${item.action} ${item.clientName}`,
          plain: `${item.action} ${item.clientName}`,
          hint: item.line,
          href: `/clients/${item.clientId}`,
        });
      });
      return [...out, ...destinations];
    }

    const hits = clients.filter((c) => matches(c.name, q)).slice(0, 6);
    hits.forEach((c) => {
      const item = attention.find((a) => a.clientId === c.id);
      out.push({
        key: `cli-${c.id}`,
        group: 'Clients',
        icon: (
          <Avatar name={c.name} id={c.id} size="sm" />
        ),
        label: c.name,
        plain: c.name,
        hint: item?.line,
        accel: '↵',
        href: `/clients/${c.id}`,
      });
    });

    // The actions offered for a match are the ones the queue is already asking
    // for, in the queue's own order — never a generic menu of everything that can
    // be done to a person.
    hits.forEach((c) => {
      attention
        .filter((a) => a.clientId === c.id)
        .forEach((a) => {
          out.push({
            key: `act-${a.key}`,
            group: 'Actions',
            icon: kindIcon(a.kind),
            label: `${a.action} ${c.name}${a.kind === 'pack' ? '’s pack' : ''}`,
            plain: `${a.action} ${c.name}${a.kind === 'pack' ? '’s pack' : ''}`,
            hint: a.line,
            href: `/clients/${c.id}`,
          });
        });
      const session = today.find((s) => s.clientId === c.id && !s.done);
      if (session) {
        out.push({
          key: `mv-${session.id}`,
          group: 'Actions',
          icon: <Calendar size={16} />,
          label: `Move their ${formatMinute(minuteOfDay(session.at))}`,
          plain: `Move ${c.name}'s ${formatMinute(minuteOfDay(session.at))}`,
          href: `/schedule?session=${session.id}`,
        });
      }
    });

    return out.length > 0 ? out : destinations;
  }, [query, clients, attention, today]);

  /*
   * The cursor is CLAMPED rather than reset by an effect, for the same reason.
   * Typing narrows the list, so a cursor left at row five of a list that now has
   * two is out of range for exactly one render — and an effect fixing it after
   * the fact is a second render plus a frame where `aria-selected` is on nothing.
   * The clamp is correct on the first render instead.
   */
  const selected = Math.min(cursor, Math.max(0, rows.length - 1));

  if (!open) return null;

  const go = (row: Row) => {
    onClose();
    router.push(row.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(Math.min(rows.length - 1, selected + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(Math.max(0, selected - 1));
      return;
    }
    if (event.key === 'Enter' && rows[selected]) {
      event.preventDefault();
      go(rows[selected]);
    }
  };


  return (
    <>
      {/* The scrim is a button rather than a div with an onClick: clicking away
          is a real way out of a dialog and it should be one for a keyboard too. */}
      <button
        className="scrim scrim--top"
        type="button"
        aria-label="Close the palette"
        onClick={onClose}
      />
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="pal__in">
          <Search size={17} />
          {/*
            A COMBOBOX, NOT A BARE FIELD — and this is a fix, not a flourish.
            The arrows moved `aria-selected` down a `role="listbox"` that the
            input was not connected to, so a screen reader announced the field,
            then nothing at all for every press after it: the palette's whole
            interaction was silent. `aria-activedescendant` is the one attribute
            that makes a moving selection in a list somebody else owns audible,
            and it needs `role="combobox"` plus `aria-controls` to have anywhere
            to point. The visible behaviour is unchanged.
          */}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            placeholder="Search clients, sessions, exercises…"
            aria-label="Search"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={rows[selected] ? optionId(rows[selected]) : undefined}
            /* The design draws a span and a caret because it is a picture. A real
               palette needs a real input — and the caret then comes free, which
               is one fewer thing that can be out of step with the text. */
            style={{
              flex: 1,
              background: 'none',
              border: 0,
              outline: 'none',
              color: 'var(--tx-ink)',
              font: 'inherit',
              fontSize: 15,
            }}
          />
        </div>
        {/*
          THE OPTIONS ARE DIRECT CHILDREN OF THE LISTBOX, and the group headers
          are `presentation`. They used to be wrapped one-per-`<div>` so the
          header could sit above its row — which is a correct layout and an
          invalid listbox: a `role="listbox"` whose children are generic elements
          loses the option relationship in most readers, so the count came back
          as one item, or none. `<Fragment>` keeps the same DOM order with nothing
          between the list and its rows, and the header keeps its place in it.
        */}
        <div className="pal__list" id={LIST_ID} role="listbox" aria-label="Results">
          {rows.map((row, i) => {
            /* The header is a comparison against the PREVIOUS row rather than
               a `lastGroup` the map reassigns. Same output, and the mutable
               version is a variable written after render has completed, which
               is unstable the moment React replays this render. */
            const header = rows[i - 1]?.group !== row.group ? row.group : null;
            return (
              <Fragment key={row.key}>
                {header && (
                  <p className="pal__gk" role="presentation">
                    {header}
                  </p>
                )}
                <div
                  className="pal__i"
                  id={optionId(row)}
                  role="option"
                  aria-selected={i === selected}
                  /* The group is not in the row's text, so a reader hears
                     "Renew Kavya M" without ever hearing which list it came
                     from — and *Renew* and *Clients* are different answers. */
                  aria-label={`${row.group}: ${row.plain}${row.hint ? `, ${row.hint}` : ''}`}
                  tabIndex={-1}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(row)}
                >
                  {row.icon}
                  {row.label}
                  {/* A class, not two inline values — the hint has to move under
                      the label on a phone, where the label itself takes two
                      lines, and a `style` attribute has nowhere to put a media
                      query. See `.pal__h` in app.css. */}
                  {row.hint && <span className="pal__h">{row.hint}</span>}
                  {row.accel && <kbd>{row.accel}</kbd>}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** ⌘K / Ctrl-K, and nothing else — a palette with three ways in is three bugs. */
export function usePaletteKey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
