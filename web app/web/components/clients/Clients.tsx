'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { RosterData } from '@/lib/clients/api';
import type { NewClientData } from '@/lib/clients/new-api';
import { AddClientDrawer } from './AddClientDrawer';
import {
  NO_FILTERS,
  SEGMENTS,
  SORTS,
  TAGS,
  TAG_LABEL,
  TAG_TONE,
  buildRoster,
  filterCount,
  filterRows,
  searchRows,
  sortRows,
  type ClientTag,
  type Filters,
  type RosterRow,
  type Segment,
  type SortKey,
} from '@/lib/clients/roster';
import { avatarToken, initials, relativePast, rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import {
  Bars,
  Bell,
  Calendar,
  Glyph,
  No,
  Plus,
  Rupee,
  Search,
  Send,
  UserAdd,
  Warn,
} from '@/components/shell/Icons';
import { Palette, type PaletteClient } from '@/components/today/Palette';
import { LastContactProvider } from '@/components/nudge/LastContact';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { templateForKind } from '@/lib/nudges/verbs';

/* ────────────────────────────────────────────────────── inline-only icons ── */

/** Export / share-link icon — not in the shell set, only here. */
function ExportIcon({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v5.5H4.5V6H10" />
    </Glyph>
  );
}

/** Sort up-down arrows icon. */
function SortIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size} d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3" />
  );
}

/** Funnel / filter icon. */
function FilterIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M4 6h16M7 12h10M10 18h4" />;
}

/** Chevron pointing down. */
function ChevronDown({ size = 13 }: { size?: number }) {
  return <Glyph size={size} d="M6 9l6 6 6-6" />;
}

/** Vertical dots — "more" affordance on a row. */
function Dots3v({ size = 16 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="5.5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="18.5" r="1.4" />
    </Glyph>
  );
}

/* ─────────────────────────────────────────── attention icon per kind ── */

function KindIcon({ kind }: { kind: RosterRow['attention'] extends infer T ? (T extends { kind: infer K } ? K : never) : never }) {
  if (kind === 'setup') return <Calendar size={15} />;
  if (kind === 'overdue') return <Rupee size={15} />;
  if (kind === 'quiet') return <Bell size={15} />;
  if (kind === 'pack') return <Bars size={15} />;
  if (kind === 'missed') return <No size={15} />;
  if (kind === 'invite') return <Send size={15} />;
  // The fallback is the warning triangle, which is what `unavailable` wants:
  // it is the one row on this screen that is a typo rather than a situation.
  return <Warn size={15} />;
}

/* ─────────────────────────────────────────────────────── status tag ── */

/**
 * The derived tag. `title` carries the rule, because a tag a trainer cannot
 * account for is a tag they distrust — and "At risk" is a claim about a person
 * they know, so hovering it has to say what the roster is reading.
 */
function StatusTag({ tag }: { tag: ClientTag }) {
  const tone = TAG_TONE[tag];
  return (
    <span
      className={tone ? `tag ${tone}` : 'tag'}
      title={TAGS.find(t => t.key === tag)?.hint}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

/* ──────────────────────────────────────────────────── first-run state ── */

function FirstRun({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '64px 0', textAlign: 'center' }}>
      <p style={{ color: 'var(--tx-ink-3)', marginBottom: 16 }}>No clients yet</p>
      <button className="btn btn--primary" type="button" onClick={onAdd}>
        <Plus size={15} />
        Add your first client
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────── sort dropdown menu ── */

function SortMenu({
  sort,
  onSort,
  onClose,
  align = 'left',
}: {
  sort: SortKey;
  onSort: (k: SortKey) => void;
  onClose: () => void;
  /** `right` on a phone: the icon trio sits at the right edge and `.menu` is
   *  196px wide, so a left-anchored copy hangs off the screen. */
  align?: 'left' | 'right';
}) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(e.key) || !wrap.current) return;
      e.preventDefault();
      const items = [...wrap.current.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'Home' ? 0
        : e.key === 'End' ? items.length - 1
        : e.key === 'ArrowDown' ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
      items[to]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    // Focus the currently-active sort option on mount.
    const active = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (active ?? wrap.current?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      className="menu"
      ref={wrap}
      role="menu"
      aria-label="Sort by"
      style={{ top: '100%', ...(align === 'right' ? { right: 0 } : { left: 0 }), marginTop: 4 }}
    >
      {SORTS.map(s => (
        <button
          key={s.key}
          className="menu__i"
          type="button"
          role="menuitem"
          aria-checked={sort === s.key}
          onClick={() => { onSort(s.key); onClose(); }}
          style={sort === s.key ? { color: 'var(--tx-accent-text)' } : undefined}
        >
          {s.label}
          {sort === s.key && (
            <svg
              width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round"
              style={{ marginLeft: 'auto' }}
              aria-hidden="true"
            >
              <path d="M4.5 12.5l5 5 10-11" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────── filter panel ── */

const FILTER_MODES: { value: 'floor' | 'remote'; label: string }[] = [
  { value: 'floor', label: 'Floor' },
  { value: 'remote', label: 'Remote' },
];
const FILTER_MONEY: { value: 'owes' | 'paid' | 'ending'; label: string }[] = [
  { value: 'owes', label: 'Owes me' },
  { value: 'paid', label: 'Paid up' },
  { value: 'ending', label: 'Pack ending' },
];
const FILTER_BATCH: { value: 'morning' | 'evening' | 'night' | 'none'; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
  { value: 'none', label: 'No batch' },
];

function FilterPanel({
  filters,
  visibleCount,
  totalCount,
  onApply,
  onClose,
}: {
  filters: Filters;
  visibleCount: number;
  totalCount: number;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);

  function toggleMode(v: 'floor' | 'remote') {
    setDraft(d => ({
      ...d,
      mode: d.mode.includes(v) ? d.mode.filter(x => x !== v) : [...d.mode, v],
    }));
  }
  function toggleMoney(v: 'owes' | 'paid' | 'ending') {
    setDraft(d => ({
      ...d,
      money: d.money.includes(v) ? d.money.filter(x => x !== v) : [...d.money, v],
    }));
  }
  function toggleBatch(v: 'morning' | 'evening' | 'night' | 'none') {
    setDraft(d => ({
      ...d,
      batch: d.batch.includes(v as never) ? d.batch.filter(x => x !== v) : [...d.batch, v as never],
    }));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Count how many clients the draft would show.
  // (We receive visibleCount from the parent pre-computed for the current draft
  //  — but since draft is local here, pass the total and compute in parent via prop update.)
  // For the label we reuse totalCount for simplicity — the parent applies and then re-renders.

  return (
    <>
      <button className="scrim scrim--soft" type="button" aria-label="Close filter" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true" aria-label="Filter clients">
        <div className="panel__hd">
          <span className="panel__t">Filter</span>
          <span style={{ flex: 1 }} />
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => setDraft(NO_FILTERS)}
          >
            Reset
          </button>
        </div>

        <div className="panel__body">
          <p className="small" style={{ marginTop: 0 }}>
            Three axes. Each chip shows the count it would produce on its own.
          </p>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Where</p>
          <div className="wk">
            {FILTER_MODES.map(m => {
              const on = draft.mode.includes(m.value);
              return (
                <button
                  key={m.value}
                  className="chip"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMode(m.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Money</p>
          <div className="wk">
            {FILTER_MONEY.map(m => {
              const on = draft.money.includes(m.value);
              return (
                <button
                  key={m.value}
                  className="chip"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMoney(m.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Batch</p>
          <div className="wk">
            {FILTER_BATCH.map(b => {
              const on = draft.batch.includes(b.value as never);
              return (
                <button
                  key={b.value}
                  className="chip"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleBatch(b.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          <p
            className="small"
            style={{
              marginTop: 18,
              borderTop: '1px solid var(--tx-line)',
              paddingTop: 12,
            }}
          >
            Batch is <b>derived</b>, not typed — from where a client&apos;s sessions
            actually fall. Noon to four is nobody&apos;s batch.
          </p>
        </div>

        <div className="panel__foot">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => { onApply(draft); onClose(); }}
          >
            Show {visibleCount} client{visibleCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────── client row ── */

function RowMenu({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(e.key) || !wrap.current) return;
      e.preventDefault();
      const items = [...wrap.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'Home' ? 0
        : e.key === 'End' ? items.length - 1
        : e.key === 'ArrowDown' ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
      items[to]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div
      className="menu"
      ref={wrap}
      role="menu"
      aria-label={`Actions for ${row.name}`}
      style={{ top: '100%', right: 0, marginTop: 4 }}
    >
      <button
        className="menu__i"
        type="button"
        role="menuitem"
        onClick={() => go(`/clients/${row.id}`)}
      >
        Open {row.name.split(' ')[0]}&apos;s file
      </button>
      <button
        className="menu__i"
        type="button"
        role="menuitem"
        onClick={() => go('/schedule?new=1')}
      >
        Book a session
      </button>
      <div className="menu__sep" />
      <button className="menu__i" type="button" role="menuitem" disabled aria-disabled="true">
        Assign a program
        <span className="tag" style={{ marginLeft: 'auto', fontSize: 10 }}>Soon</span>
      </button>
      <button className="menu__i" type="button" role="menuitem" disabled aria-disabled="true">
        Message
        <span className="tag" style={{ marginLeft: 'auto', fontSize: 10 }}>Soon</span>
      </button>
      <div className="menu__sep" />
      <button className="menu__i" type="button" role="menuitem" disabled aria-disabled="true">
        {row.status === 'paused' ? 'Resume' : 'Pause'}
        <span className="tag" style={{ marginLeft: 'auto', fontSize: 10 }}>Soon</span>
      </button>
      <button className="menu__i" type="button" role="menuitem" disabled aria-disabled="true">
        Archive
        <span className="tag" style={{ marginLeft: 'auto', fontSize: 10 }}>Soon</span>
      </button>
    </div>
  );
}

function ClientRow({
  row,
  now,
  openRowId,
  setOpenRowId,
}: {
  row: RosterRow;
  now: number;
  openRowId: string | null;
  setOpenRowId: (id: string | null) => void;
}) {
  const av = avatarToken(row.id);
  const init = initials(row.name);
  const router = useRouter();
  const menuOpen = openRowId === row.id;

  const trClass = row.severity === 'critical' ? 'crit' : row.severity === 'alert' ? 'alert' : '';
  const hasAttn = !!row.attention;

  const lastAttended = row.lastAttendedAt
    ? relativePast(row.lastAttendedAt, now)
    : null;

  const href = `/clients/${row.id}`;

  return (
    <tr
      className={trClass || undefined}
      style={{ cursor: 'pointer' }}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(href); }}
      tabIndex={0}
      role="link"
      aria-label={`Open ${row.name}'s file`}
    >
      {/* Client column */}
      <td>
        <span className="who2">
          <span className="av av--sm" style={{ background: `var(${av})` }}>
            {init}
          </span>
          <span>
            <b>{row.name}</b>
            {/* Phone and where, on ONE line, because the column the mode used to
                have is the Status column now. The number stays visible on every
                row on purpose: it is half of what this screen searches. */}
            <i>
              {row.phone ?? '—'}
              {' · '}
              {row.mode === 'floor' ? 'Floor' : 'Remote'}
            </i>
          </span>
        </span>
      </td>

      {/* What's up column */}
      <td>
        {hasAttn ? (
          <span className="attn">
            <KindIcon kind={row.attention!.kind} />
            <u>{row.line}</u>
          </span>
        ) : (
          <span className="attn attn--calm">{row.line}</span>
        )}
      </td>

      {/* Status column */}
      <td>
        <StatusTag tag={row.tag} />
      </td>

      {/* Sessions left column */}
      <td className="num">
        {row.pack ? (
          <>
            {row.pack.remaining}
            {row.pack.total != null && (
              <span className="ink3">/{row.pack.total}</span>
            )}
          </>
        ) : (
          <span className="ink3">—</span>
        )}
      </td>

      {/* Owes column — the dues indicator.
          Toned rather than plain: an amount in this column is money the trainer
          is owed, and red at 7+ days is the same threshold `moneyBand` uses for
          the row's own line, so the colour and the sentence cannot disagree. */}
      <td className="num">
        {row.owed > 0 ? (
          <span
            style={{
              color:
                row.severity === 'critical' && row.attention?.kind === 'overdue'
                  ? 'var(--tx-danger)'
                  : 'var(--tx-warn)',
              fontWeight: 600,
            }}
          >
            {rupees(row.owed)}
          </span>
        ) : (
          <span className="ink3">—</span>
        )}
      </td>

      {/* Last attended column */}
      <td className="mono" style={{ color: 'var(--tx-ink-3)', fontSize: 11.5 }}>
        {lastAttended ?? <span className="ink3">Never</span>}
      </td>

      {/*
        Action column.

        ── IT USED TO BE A BUTTON THAT DID NOTHING ──────────────────────────
        Every row with an attention band drew `{row.attention.action}` as a bare
        `<button>` with no handler: *Remind*, *Check in* and *Renew*, live on
        every roster since this screen was written, and none of them wired to
        anything. Pressing one selected the row's text.

        Now the three message-shaped bands send. The other three — *Mark*,
        *Assign*, *Close* — are the trainer's own housekeeping and belong on the
        screens that do them, so the row states the verb without offering it
        rather than offering a second button that also does nothing.
      */}
      <td className="act" onClick={(e) => e.stopPropagation()}>
        {row.attention &&
          (templateForKind(row.attention.kind) ? (
            <NudgeButton
              clientId={row.id}
              clientName={row.name}
              template={templateForKind(row.attention.kind)!}
              label={row.attention.action}
              className="btn btn--secondary btn--sm"
            />
          ) : (
            <span className="tag">{row.attention.action}</span>
          ))}
      </td>

      {/* More column */}
      <td
        className="kb"
        style={{ position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn btn--icon btn--ghost btn--sm"
          type="button"
          aria-label={`More for ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setOpenRowId(menuOpen ? null : row.id)}
        >
          <Dots3v />
        </button>
        {menuOpen && (
          <RowMenu
            row={row}
            onClose={() => setOpenRowId(null)}
          />
        )}
      </td>
    </tr>
  );
}

/* ───────────────────────────────────────── phone card row (≤900 px) ── */

function PhoneRow({ row, now }: { row: RosterRow; now: number }) {
  const av = avatarToken(row.id);
  const init = initials(row.name);
  const router = useRouter();

  const rowClass = [
    'crd-row',
    row.severity === 'critical'
      ? 'crd-row--critical'
      : row.severity === 'alert'
      ? 'crd-row--alert'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const pack = row.pack;
  const packLow =
    pack == null
      ? undefined
      : pack.remaining <= 0
      ? 'out'
      : pack.remaining <= 2
      ? 'true'
      : undefined;
  const barPct =
    pack && pack.total
      ? Math.min(100, Math.round((pack.remaining / pack.total) * 100))
      : undefined;

  return (
    <button
      className={rowClass}
      type="button"
      onClick={() => router.push(`/clients/${row.id}`)}
      aria-label={`Open ${row.name}'s file`}
    >
      <span className="av av--sm" style={{ background: `var(${av})` }}>
        {init}
      </span>
      <span className="crd-row__main">
        <b>{row.name}</b>
        {row.line && <span>{row.line}</span>}
      </span>
      {/* A SIBLING of .crd-row__main, never a child: `.crd-row__main span` sets
          display:block on every span inside it and outranks `.tag`, so a tag
          nested in there would render as a full-width block. */}
      <span style={{ flex: '0 0 auto' }}>
        <StatusTag tag={row.tag} />
      </span>
      {pack != null && (
        <span className="crd-pk" data-low={packLow}>
          <b>
            {pack.remaining}
            {pack.total != null && <i>/{pack.total}</i>}
          </b>
          <s className="crd-pk__bar">
            <s style={{ width: barPct != null ? `${barPct}%` : '0%' }} />
          </s>
        </span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────── sort chip button ── */

function SortButton({
  sort,
  open,
  onToggle,
}: {
  sort: SortKey;
  open: boolean;
  onToggle: () => void;
}) {
  const label = SORTS.find(s => s.key === sort)?.label ?? 'Sort';
  return (
    <button
      className="chip"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
    >
      <SortIcon />
      {label}
      <ChevronDown />
    </button>
  );
}

/* ───────────────────────────────────────────────── which view is live ── */

/**
 * Whether the card list is the view on screen — `max-width:900px` in `app.css`,
 * the one breakpoint that swaps `.rst-desk` for `.rst-phone`.
 *
 * The screen needs this in JS for exactly one thing: the sort dropdown is
 * ANCHORED to its chip, the chip is inside `.rst-desk`, and `.rst-desk` is
 * `display:none` on a phone — so the phone's Sort button was opening a menu
 * inside a hidden container. Rendering both copies is not the fix: `SortMenu`
 * focuses itself on mount, and the second copy would move focus into a
 * `display:none` subtree and lose it.
 *
 * `false` until mounted, which is also the right SSR answer: the menu only
 * exists after a click, so there is nothing to mismatch on hydration.
 */
function usePhoneView(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:900px)');
    const read = () => setPhone(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return phone;
}

/* ──────────────────────────────────────────────────────── search box ── */

/**
 * Name or phone. Two of these are rendered — one in the desk tools row, one over
 * the phone card list — against ONE piece of state, because the two views are a
 * CSS swap and a search a trainer typed at 1440px has to survive the browser
 * being narrowed.
 *
 * It is not the ⌘K palette and does not replace it: the palette JUMPS to one
 * client anywhere in the app, this NARROWS the list in place, and the reason
 * both exist is that "who owes me money in the morning batch" is a question you
 * ask of a list.
 */
function SearchBox({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <label className="search" style={style}>
      <Search size={15} />
      <input
        type="search"
        value={value}
        placeholder="Search name or phone"
        aria-label="Search clients by name or phone"
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}

/* ────────────────────────────────────────────────── filter chip button ── */

function FilterButton({ fc, onClick }: { fc: number; onClick: () => void }) {
  return (
    <button className="chip" type="button" onClick={onClick}>
      <FilterIcon />
      {fc > 0 ? `Filter · ${fc}` : 'Filter'}
      {fc > 0 && <span className="rail__n rail__n--acc">{fc}</span>}
    </button>
  );
}

/* ─────────────────────────────────────────────────── main component ── */

export function Clients({
  data,
  now,
  newClientData,
  lastContact,
}: {
  data: RosterData;
  now: number;
  newClientData: NewClientData | null;
  /**
   * clientId → when they were last messaged, inside the cooldown window.
   *
   * Provided through context rather than threaded, because the two row
   * components that need it are nested functions four levels down — see
   * `components/nudge/LastContact.tsx`.
   */
  lastContact: Record<string, number>;
}) {
  const [segment, setSegment] = useState<Segment>('all');
  const [sort, setSort] = useState<SortKey>('attention');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const phoneView = usePhoneView();
  const router = useRouter();

  const openAddDrawer = () => {
    if (newClientData) {
      closeAll();
      setAddDrawerOpen(true);
    } else {
      router.push('/clients/new');
    }
  };

  const sortWrapRef = useRef<HTMLDivElement>(null);

  const roster = useMemo(() => buildRoster(data, now), [data, now]);
  const sorted = useMemo(() => sortRows(roster.rows, sort), [roster.rows, sort]);
  const visible = useMemo(
    () => filterRows(searchRows(sorted, query), filters, segment),
    [sorted, query, filters, segment],
  );

  /* The group header counts what is ON SCREEN, not what is on the roster — a
     header reading 11 above four rows is the kind of number a trainer stops
     trusting the rest of the screen for. */
  const attentionVisible = visible.filter(r => r.attention).length;
  const calmVisible = visible.length - attentionVisible;
  const searching = query.trim() !== '';

  const fc = filterCount(filters);

  // Compute how many clients the current filter draft would show (used by the panel's button label).
  // The panel has its own draft state so we can't know it here; we pass the current visible count
  // as a starting point and the panel updates its own preview as the user toggles chips.
  // For the "Show N clients" button we pass the current visible count — once the panel applies,
  // the count on screen updates automatically.
  const filterPanelCount = visible.length;

  const paletteClients: PaletteClient[] = useMemo(
    () => data.clients.map(c => ({ id: c.id, name: c.name })),
    [data.clients],
  );

  /* Counts by TAG now, so the line under the title and the chips beside it
     cannot disagree. `at risk` leads it for the same reason the sort does. */
  const subtitle = roster.firstRun
    ? 'No clients yet'
    : [
        roster.counts['at-risk'] ? `${roster.counts['at-risk']} at risk` : null,
        roster.counts.expiring ? `${roster.counts.expiring} expiring` : null,
        roster.counts.lapsed ? `${roster.counts.lapsed} lapsed` : null,
        roster.counts.active ? `${roster.counts.active} active` : null,
        roster.counts.prospect ? `${roster.counts.prospect} prospect` : null,
        roster.counts.paused ? `${roster.counts.paused} paused` : null,
        roster.archived ? `${roster.archived} archived` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const { tally } = roster;

  const showGroup =
    sort === 'attention' && segment === 'all' && attentionVisible > 0;

  const closeAll = useCallback(() => {
    setSortMenuOpen(false);
    setFilterPanelOpen(false);
    setOpenRowId(null);
  }, []);

  // Active filter chip labels for the tools row.
  const activeFilterChips: { label: string; remove: () => void }[] = [
    ...filters.mode.map(v => ({
      label: v === 'floor' ? 'Floor' : 'Remote',
      remove: () => setFilters(f => ({ ...f, mode: f.mode.filter(x => x !== v) })),
    })),
    ...filters.money.map(v => ({
      label: v === 'owes' ? 'Owes me' : v === 'paid' ? 'Paid up' : 'Pack ending',
      remove: () => setFilters(f => ({ ...f, money: f.money.filter(x => x !== v) })),
    })),
    ...filters.batch.map(v => ({
      label: v === 'morning' ? 'Morning' : v === 'evening' ? 'Evening' : v === 'night' ? 'Night' : 'No batch',
      remove: () => setFilters(f => ({ ...f, batch: f.batch.filter(x => x !== v) })),
    })),
  ];

  return (
    <LastContactProvider map={lastContact} now={now}>
      <TopBar crumb="Clients" onSearch={() => setPaletteOpen(true)} />

      <main className="main" id="main-content">
        <div className="ph ph--clients">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">Clients</h1>
              <p className="ph__sub">{subtitle}</p>
            </div>
            {!roster.firstRun && (
              <>
                {/* Desktop: Export + Add client text buttons */}
                <div className="ph__acts ph__acts--pair crd-deskacts">
                  <button className="btn btn--secondary" type="button">
                    <ExportIcon size={15} />
                    Export
                  </button>
                  <button className="btn btn--primary" type="button" onClick={openAddDrawer}>
                    <Plus size={15} />
                    Add client
                  </button>
                </div>
                {/* Mobile: sort · filter · add icon buttons (xrep-clients.html frame 1a) */}
                <div className="crd-ph-acts">
                  {/* Anchors the dropdown on a phone — the desk chip that
                      normally anchors it is inside the hidden `.rst-desk`. */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className="btn btn--icon btn--ghost"
                      type="button"
                      aria-label="Sort clients"
                      aria-haspopup="menu"
                      aria-expanded={sortMenuOpen}
                      onClick={() => { closeAll(); setSortMenuOpen(o => !o); }}
                    >
                      <SortIcon size={20} />
                    </button>
                    {sortMenuOpen && phoneView && (
                      <SortMenu
                        sort={sort}
                        onSort={setSort}
                        onClose={() => setSortMenuOpen(false)}
                        align="right"
                      />
                    )}
                  </div>
                  <button className="btn btn--icon btn--ghost" type="button" aria-label="Filter clients" onClick={() => { closeAll(); setFilterPanelOpen(true); }}>
                    <FilterIcon size={20} />
                  </button>
                  <button className="btn btn--icon btn--ghost" type="button" onClick={openAddDrawer} aria-label="Add client">
                    <UserAdd size={22} />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="ph__tabs" style={{ gap: 7 }}>
            {SEGMENTS.map(s => {
              const count = roster.counts[s.key];
              const active = segment === s.key;
              return (
                <button
                  key={s.key}
                  className="chip"
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSegment(s.key)}
                  style={
                    active
                      ? {
                          background: 'var(--tx-accent-soft)',
                          borderColor: 'var(--tx-accent-line)',
                          color: 'var(--tx-accent-text)',
                        }
                      : undefined
                  }
                >
                  {s.label}
                  {count > 0 && <span className="rail__n">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="body">
          {roster.firstRun ? (
            <FirstRun onAdd={openAddDrawer} />
          ) : (
            <>
              {/* ── Desktop: strip + tools + table ── */}
              <div className="rst-desk">
                {/* Summary strip */}
                <div className="strip">
                  {tally.overdueCount > 0 && (
                    <div className="warn">
                      <b>{rupees(tally.overdueAmt)}</b>
                      <i>overdue &gt; 7 d · {tally.overdueCount}</i>
                    </div>
                  )}
                  {tally.dueCount > 0 && (
                    <div>
                      <b>{rupees(tally.dueAmt)}</b>
                      <i>due, not yet late · {tally.dueCount}</i>
                    </div>
                  )}
                  {tally.quiet > 0 && (
                    <div>
                      <b>{tally.quiet}</b>
                      <i>gone quiet</i>
                    </div>
                  )}
                  {tally.ending > 0 && (
                    <div>
                      <b>{tally.ending}</b>
                      <i>pack ending</i>
                    </div>
                  )}
                  {tally.missed > 0 && (
                    <div>
                      <b>{tally.missed}</b>
                      <i>missed 2 or more</i>
                    </div>
                  )}
                  {tally.setup > 0 && (
                    <div>
                      <b>{tally.setup}</b>
                      <i>not set up</i>
                    </div>
                  )}
                </div>

                <div style={{ height: 12 }} />

                {/* Tools row */}
                <div className="tools" style={{ marginBottom: 12 }}>
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    /* `.search` is flex:1 min-width:150 by default, which would
                       eat the whole tools row and push the count off the end. */
                    style={{ flex: '0 1 260px', maxWidth: 260 }}
                  />

                  {/* Sort chip — anchors the dropdown */}
                  <div ref={sortWrapRef} style={{ position: 'relative' }}>
                    <SortButton
                      sort={sort}
                      open={sortMenuOpen}
                      onToggle={() => {
                        setFilterPanelOpen(false);
                        setOpenRowId(null);
                        setSortMenuOpen(o => !o);
                      }}
                    />
                    {sortMenuOpen && !phoneView && (
                      <SortMenu
                        sort={sort}
                        onSort={setSort}
                        onClose={() => setSortMenuOpen(false)}
                      />
                    )}
                  </div>

                  {/* Filter chip */}
                  <FilterButton
                    fc={fc}
                    onClick={() => {
                      setSortMenuOpen(false);
                      setOpenRowId(null);
                      setFilterPanelOpen(o => !o);
                    }}
                  />

                  {/* Active filter chips — removable */}
                  {activeFilterChips.map(chip => (
                    <button
                      key={chip.label}
                      className="chip"
                      type="button"
                      aria-pressed="true"
                      onClick={chip.remove}
                      style={{
                        background: 'var(--tx-accent-soft)',
                        borderColor: 'var(--tx-accent-line)',
                        color: 'var(--tx-accent-text)',
                      }}
                    >
                      {chip.label}
                      <svg
                        width="10" height="10" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth={2.5}
                        strokeLinecap="round" aria-hidden="true"
                        style={{ marginLeft: 2 }}
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ))}

                  <span className="tools__sp" style={{ flex: 1 }} />
                  <span className="small mono">
                    {visible.length} of {roster.rows.length}
                  </span>
                </div>

                {/* Roster table */}
                <table className="tbl rst">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>What&rsquo;s up</th>
                      <th>Status</th>
                      <th className="num">Sessions left</th>
                      <th className="num">Owes</th>
                      <th>Last attended</th>
                      <th className="act" />
                      <th className="kb" />
                    </tr>
                  </thead>
                  <tbody>
                    {showGroup && (
                      <tr className="grph">
                        <th colSpan={8}>
                          Needs attention{' '}
                          <span className="ink3">
                            <b>{attentionVisible}</b>
                          </span>
                          <em>at risk, then expiring, then dues</em>
                        </th>
                      </tr>
                    )}
                    {visible.map(row => (
                      <ClientRow
                        key={row.id}
                        row={row}
                        now={now}
                        openRowId={openRowId}
                        setOpenRowId={setOpenRowId}
                      />
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            textAlign: 'center',
                            padding: '32px 0',
                            color: 'var(--tx-ink-3)',
                          }}
                        >
                          {searching
                            ? `Nobody on the roster matches “${query.trim()}”`
                            : 'No clients match'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Phone card list (≤900px) — xrep-clients.html frame 1a ── */}
              <div className="rst-phone">
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  style={{ margin: '0 0 12px' }}
                />
                {showGroup ? (
                  <>
                    <div className="crd-stick crd-stick--alert">
                      <span>Needs attention</span>
                      <em>{attentionVisible}</em>
                    </div>
                    <div className="crd-list">
                      {visible
                        .filter(r => !!r.attention)
                        .map(row => (
                          <PhoneRow key={row.id} row={row} now={now} />
                        ))}
                    </div>
                    {calmVisible > 0 && (
                      <>
                        <div className="crd-stick">
                          <span>Everyone else</span>
                          <em>{calmVisible}</em>
                        </div>
                        <div className="crd-list">
                          {visible
                            .filter(r => !r.attention)
                            .map(row => (
                              <PhoneRow key={row.id} row={row} now={now} />
                            ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="crd-list">
                    {visible.map(row => (
                      <PhoneRow key={row.id} row={row} now={now} />
                    ))}
                    {visible.length === 0 && (
                      <p
                        style={{
                          padding: '32px 16px',
                          textAlign: 'center',
                          color: 'var(--tx-ink-3)',
                        }}
                      >
                        {searching
                          ? `Nobody on the roster matches “${query.trim()}”`
                          : 'No clients match'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Filter panel — absolute, anchored to .main (position:relative) */}
        {filterPanelOpen && (
          <FilterPanel
            filters={filters}
            visibleCount={filterPanelCount}
            totalCount={roster.rows.length}
            onApply={setFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        {/* Add-client left drawer — absolute, anchored to .main (position:relative) */}
        {addDrawerOpen && newClientData && (
          <AddClientDrawer
            data={newClientData}
            now={now}
            onClose={() => setAddDrawerOpen(false)}
          />
        )}
      </main>

      {paletteOpen && (
        <Palette
          open
          onClose={() => setPaletteOpen(false)}
          clients={paletteClients}
          attention={[]}
          today={[]}
        />
      )}
    </LastContactProvider>
  );
}
