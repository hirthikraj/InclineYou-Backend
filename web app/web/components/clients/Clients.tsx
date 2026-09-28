'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { RosterData } from '@/lib/clients/api';
import type { NewClientData } from '@/lib/clients/new-api';
import { AddClientDrawer } from './AddClientDrawer';
import { useDismiss } from '@/lib/ui/dismiss';
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
  FOCUS_LABEL,
  type ClientTag,
  type Filters,
  type Focus,
  type Roster,
  type RosterRow,
  type Segment,
  type SortKey,
} from '@/lib/clients/roster';
import { relativePast, rupees } from '@/lib/today/time';
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
  Warn,
} from '@/components/shell/Icons';
import type { PaletteClient } from '@/components/today/Palette';
import { usePaletteRows } from '@/components/shell/PaletteHost';
import type { AttentionItem, DeckSession } from '@/lib/today/deck';
import { LastContactProvider } from '@/components/nudge/LastContact';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { templateForKind } from '@/lib/nudges/verbs';
import type { NudgeTemplateName } from '@/lib/nudges/types';
import {
  archiveClient,
  pauseClient,
  resumeClient,
  unarchiveClient,
  type ArchiveReason,
  type StatusWriteResult,
} from '@/lib/clients/status-actions';
import { Button } from '@/web-components/ui/Button';
import { renew } from '@/lib/today/actions';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { Avatar } from '@/web-components/ui/Avatar';
import { PackGauge } from '@/web-components/ui/PackGauge';
import { Table, Row, type Column } from '@/web-components/ui/Table';

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
      <Button variant="primary" onClick={onAdd}>
        <Plus size={15} />
        Add your first client
      </Button>
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
  { value: 'floor', label: 'In Person' },
  { value: 'remote', label: 'Online' },
];
const FILTER_MONEY: { value: 'owes' | 'paid' | 'ending'; label: string }[] = [
  { value: 'owes', label: 'Pending' },
  { value: 'paid', label: 'Paid up' },
  { value: 'ending', label: 'Pack ending' },
];
const FILTER_BATCH: { value: 'morning' | 'evening' | 'night' | 'none'; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
  { value: 'none', label: 'No batch' },
];

/**
 * ── AND SORT IS THE PANEL'S FIRST SECTION ON A PHONE ───────────────────────
 *
 * Sort had its own 20px glyph in the header's icon trio and its own dropdown.
 * Two unlabelled glyphs side by side, opening two surfaces, for one job —
 * *arrange this list* — and neither of them able to say what it was currently
 * set to. The desk states both: a labelled `SortIcon + label + ⌄` control and a
 * counted `Filter · 2` chip. The phone dropped both labels and the count.
 *
 * So on a phone there is ONE door. It is the pattern `/programs/certified`
 * already uses at this width — a bar and a sheet — and it buys the thing a bare
 * glyph cannot: the control names the answer before it is pressed.
 *
 * `sort` rides the DRAFT with the three filter axes rather than committing on
 * tap. Not consistency for its own sake: this panel's primary button says
 * *Show 12 clients*, and a sort that had already applied underneath would have
 * re-ordered the list behind a scrim while the trainer was still choosing what
 * it should contain. One press, one change to the list.
 *
 * The desk keeps its own two controls untouched — they are labelled, they state
 * their answers, and they sit on a row with room for both.
 */
function FilterPanel({
  filters,
  sort,
  visibleCount,
  totalCount,
  onApply,
  onClose,
}: {
  filters: Filters;
  sort: SortKey;
  visibleCount: number;
  totalCount: number;
  onApply: (f: Filters, sort: SortKey) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [sortDraft, setSortDraft] = useState<SortKey>(sort);

  /*
   * THE EXIT — and it is `lib/ui/dismiss.ts` now, not thirty lines here.
   *
   * This sheet reasoned it out first: a transition cannot outlive its box, so
   * the surface has to stay mounted while it leaves, and the wait has to ASK the
   * element what is running rather than trust a clock — because both a timer and
   * `transitionend` are wrong on paths this app really has. That argument was
   * written for one panel on one breakpoint. Every panel in the product now
   * leaves the same way, so the argument moved to the hook, in full, and this is
   * the same code with the reasoning one file over.
   */
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

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
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  // Count how many clients the draft would show.
  // (We receive visibleCount from the parent pre-computed for the current draft
  //  — but since draft is local here, pass the total and compute in parent via prop update.)
  // For the label we reuse totalCount for simplicity — the parent applies and then re-renders.

  return (
    <>
      {/* `crd-fscrim` / `crd-fpanel` carry the phone's sheet treatment. Both are
          OPT-IN classes rather than changes to `.scrim--soft` and `.panel`,
          because nine components render `className="panel"` and two of them pin
          their own width inline — app.css's own block on this states the case. */}
      <button
        className={`scrim scrim--soft crd-fscrim${closing ? ' scrim--out crd-fscrim--out' : ''}`}
        type="button"
        aria-label="Close filter"
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        /* BOTH exit classes, and the pair is the point. `panel--out` is the
           desktop one webapp.css added for every panel; `crd-fpanel--out` is
           this sheet's own, and it only exists inside the phone query — so above
           900px the generic nudge-and-fade runs, and below it app.css's later
           `transform` overrides that with the slide the sheet shape wants. One
           className, two breakpoints, no `matchMedia` in the component. */
        className={`panel crd-fpanel${closing ? ' panel--out crd-fpanel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filter and sort clients"
      >
        <div className="panel__hd">
          <span className="panel__t">Filter</span>
          <span style={{ flex: 1 }} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDraft(NO_FILTERS); setSortDraft('attention'); }}
          >
            Reset
          </Button>
        </div>

        <div className="panel__body">
          <p className="small" style={{ marginTop: 0 }}>
            Three axes. Each chip shows the count it would produce on its own.
          </p>

          {/* PHONE ONLY, and the class is what says so — the desk's own sort
              control is three inches away on the tools row, labelled and
              already stating its answer, so a second copy of it inside a panel
              is the duplication this section exists to remove rather than to
              double. `Reset` puts it back to the default rather than leaving it
              behind: a Reset that clears three axes and silently keeps the
              fourth is a Reset a trainer has to check. */}
          <div className="crd-fsort">
            <p className="micro" style={{ margin: '16px 0 8px' }}>Sort by</p>
            <div className="wk">
              {SORTS.map(s => {
                const on = sortDraft === s.key;
                return (
                  <Chip
                    pressed={on}
                    key={s.key}
                    onClick={() => setSortDraft(s.key)}
                    style={on ? {
                      background: 'var(--tx-accent-soft)',
                      borderColor: 'var(--tx-accent-line)',
                      color: 'var(--tx-accent-text)',
                    } : undefined}
                  >
                    {s.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Where</p>
          <div className="wk">
            {FILTER_MODES.map(m => {
              const on = draft.mode.includes(m.value);
              return (
                <Chip
                  pressed={on}
                  key={m.value}
                  onClick={() => toggleMode(m.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {m.label}
                </Chip>
              );
            })}
          </div>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Money</p>
          <div className="wk">
            {FILTER_MONEY.map(m => {
              const on = draft.money.includes(m.value);
              return (
                <Chip
                  pressed={on}
                  key={m.value}
                  onClick={() => toggleMoney(m.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {m.label}
                </Chip>
              );
            })}
          </div>

          <p className="micro" style={{ margin: '16px 0 8px' }}>Batch</p>
          <div className="wk">
            {FILTER_BATCH.map(b => {
              const on = draft.batch.includes(b.value as never);
              return (
                <Chip
                  pressed={on}
                  key={b.value}
                  onClick={() => toggleBatch(b.value)}
                  style={on ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  } : undefined}
                >
                  {b.label}
                </Chip>
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
          <Button variant="ghost" onClick={dismiss}>
            Cancel
          </Button>
          <Button
            variant="primary"
            /* Applies NOW and leaves over 240ms. The list re-sorting behind a
               sheet that is still on its way out is the point: it is the answer
               to what the chips were doing, and it arrives while the thing that
               asked the question is still visible. */
            onClick={() => { onApply(draft, sortDraft); dismiss(); }}
          >
            Show {visibleCount} client{visibleCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────── client row ── */

/**
 * THE ROW MENU — and the four rows on it that used to say *Soon*.
 *
 * `Assign a plan`, `Message`, `Pause` and `Archive` shipped as
 * `<button disabled>` with a *Soon* tag, and the argument for marking them was
 * right at the time and has expired — the same shape, and the same resolution,
 * as the + sheet's three disabled rows. What each one needed:
 *
 * | Row | What made it live |
 * | --- | --- |
 * | Assign a plan | an href. `/clients/{id}/program` is the destination the file's own *Quick actions* card already uses |
 * | Message | `NudgeButton`, the one component every other surface that knows about a client already sends through |
 * | Pause / Resume | `pauseClient` / `resumeClient`. The roster has drawn the `paused` tag, the *Paused 4 Sep · 6 sessions left* line and the *Paused* filter since it was written, with nothing able to set the status |
 * | Archive | `archiveClient`. `buildRoster` has always dropped archived rows before it builds one, and counted them |
 *
 * So three of the four are a reader that already existed being handed a writer,
 * and `lib/clients/status-actions.ts` carries the argument for the two that
 * write.
 *
 * ── THE MESSAGE ROW PICKS ITS TEMPLATE FROM THE ROW ──────────────────────────
 *
 * Not a fixed `check_in`. The action column beside it already sends the band's
 * own template — `templateForKind`, shared with the deck so that two screens
 * cannot phrase one client differently — and a menu offering a generic *how is
 * your week going* to somebody whose row says *₹6,000 overdue · 11 days* would
 * be the second phrasing that table exists to prevent. So: the band's template
 * where there is a band, `re_engagement` for a `lapsed` row (the one tag that
 * raises no band, and the register `check_in` is too light for at a month —
 * `lib/nudges/verbs.ts` argues both halves), and `check_in` for a calm row,
 * which is the case this menu is really for. A trainer who wants a different one
 * has all seven in the file's Follow-ups card.
 *
 * ── AND ARCHIVE ASKS FIRST ───────────────────────────────────────────────────
 *
 * It is the one row here a trainer cannot undo from this screen: `SEGMENTS` has
 * no *Archived* filter, so the row leaves and there is no view to bring it back
 * from. `AccountMenu`'s sign-out is the shape borrowed — the menu BECOMES the
 * confirm rather than opening a dialog over it, with the cost named in prose,
 * because a modal for one row is heavier than the thing it protects and a
 * `window.confirm` cannot say the sentence that actually matters: **nothing is
 * deleted.** Pause is not confirmed. It is one click to undo from this menu.
 */
/**
 * The Archived list — the archived rows from the same `status=all` read, with
 * the reason and date, and Unarchive (api-contract Clients: no extra request).
 * Unarchive books their kept week again; closed packs stay closed.
 */
function ArchivedList({ rows }: { rows: Roster['archivedRows'] }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const label = Object.fromEntries(ARCHIVE_REASONS) as Record<string, string>;
  return (
    <details className="rst__archived">
      <summary>{rows.length} archived</summary>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <span>{r.name}</span>
            <span className="ink3">
              {' · '}{(r.reason && label[r.reason]) ?? 'Archived'}
              {r.archivedAt ? ` · ${new Date(r.archivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              {r.note ? ` · ${r.note}` : ''}
            </span>{' '}
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setBusy(r.id);
                setMessage(null);
                startTransition(async () => {
                  const result = await unarchiveClient(r.id);
                  if (!result.ok) setMessage(result.message ?? 'That did not save.');
                  setBusy(null);
                });
              }}
            >
              {pending && busy === r.id ? 'Bringing back…' : 'Unarchive'}
            </Button>
          </li>
        ))}
      </ul>
      {message && <p className="fail" role="alert">{message}</p>}
    </details>
  );
}

/**
 * Renew — POST /v1/packages/{id}/renew (Today A3), the pack's own terms copied
 * on the server. The id is minted once per button, so a retried click answers
 * 200 with the same package instead of selling two.
 */
function RenewButton({ packageId, label }: { packageId: string; label: string }) {
  const [attempt] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await renew(packageId, attempt);
          setMessage(result.ok ? null : result.message ?? 'That did not renew.');
        })}
      >
        {pending ? 'Renewing…' : label}
      </Button>
      {message && <span className="fail" role="alert">{message}</span>}
    </>
  );
}

/** client_archive_reason's six values, in the MockUI ArchiveSheet's words. */
const ARCHIVE_REASONS: [ArchiveReason, string][] = [
  ['goal_reached', 'Reached their goal'],
  ['moved_away', 'Moved away'],
  ['cost', 'Cost'],
  ['no_time', 'No time'],
  ['switched_trainer', 'Switched trainer'],
  ['other', 'Other'],
];

function RowMenu({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  /* The menu BECOMES the sheet for the two verbs that ask something first:
     archive needs a reason (client_archive), pause asks when they're back. */
  const [confirming, setConfirming] = useState<false | 'archive' | 'pause'>(false);
  const [reason, setReason] = useState<ArchiveReason>('other');
  const [note, setNote] = useState('');
  const [backOn, setBackOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const paused = row.status === 'paused';
  const first = row.name.split(' ')[0];

  /* The band's template, then the lapsed exception, then the calm default — the
     order is the argument, and it is stated in the block above. */
  const template: NudgeTemplateName =
    (row.attention ? templateForKind(row.attention.kind) : null) ??
    (row.tag === 'lapsed' ? 're_engagement' : 'check_in');

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

  /* Focus follows the view. The confirm swaps the rows out from under whatever
     held it, and a menu whose focus has fallen back to `<body>` is a menu the
     arrow keys have quietly stopped working in — so the second view takes it the
     same way the first took it on mount. */
  useEffect(() => {
    if (!confirming) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [confirming]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  /**
   * Run a status write; close on success, hold on failure.
   *
   * Closing on an error would be a menu reporting that nothing happened by
   * vanishing — which is indistinguishable from it having worked. So a refusal
   * keeps the menu open with the server's own sentence in it.
   */
  function write(action: () => Promise<StatusWriteResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onClose();
      else setError(result.message ?? 'That did not save. Nothing changed.');
    });
  }

  if (confirming === 'pause') {
    return (
      <div
        className="menu menu--confirm"
        ref={wrap}
        role="menu"
        aria-label={`Pause ${row.name}?`}
        style={{ top: '100%', right: 0, marginTop: 4 }}
      >
        <p className="menu__note">
          Their packs stop running and the sessions while they&apos;re away are
          cancelled. Leave the date empty if you don&apos;t know yet.
        </p>
        <label className="menu__note">
          Back on{' '}
          <input type="date" value={backOn} onChange={(e) => setBackOn(e.target.value)} disabled={pending} />
        </label>
        <button
          className="menu__i"
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={() => write(() => pauseClient(row.id, backOn || null))}
        >
          {pending ? 'Pausing…' : `Pause ${first}`}
        </button>
        <button
          className="menu__i"
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={() => { setError(null); setConfirming(false); }}
        >
          Not now
        </button>
        {error && <p className="menu__note fail">{error}</p>}
      </div>
    );
  }

  if (confirming === 'archive') {
    return (
      <div
        className="menu menu--confirm"
        ref={wrap}
        role="menu"
        aria-label={`Archive ${row.name}?`}
        style={{ top: '100%', right: 0, marginTop: 4 }}
      >
        <p className="menu__note">
          {first} comes off the roster. Their sessions, payments and history all
          stay — nothing is deleted.
        </p>
        <label className="menu__note">
          Why{' '}
          <select value={reason} onChange={(e) => setReason(e.target.value as ArchiveReason)} disabled={pending}>
            {ARCHIVE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="menu__note">
          Note{' '}
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="Optional" />
        </label>
        <button
          className="menu__i menu__i--danger"
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={() => write(() => archiveClient(row.id, reason, note))}
        >
          {pending ? 'Archiving…' : `Archive ${first}`}
        </button>
        {/* Disabled while the write is away, for `ConfirmRows`' reason: the
            request cannot be recalled, and a live way out beside an in-flight
            archive is a button that lies. */}
        <button
          className="menu__i"
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={() => { setError(null); setConfirming(false); }}
        >
          Keep them
        </button>
        {error && <p className="menu__note fail">{error}</p>}
      </div>
    );
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
        Open {first}&apos;s file
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
      <button
        className="menu__i"
        type="button"
        role="menuitem"
        onClick={() => go(`/clients/${row.id}/program`)}
      >
        Assign a plan
      </button>
      {/* The one row that is not this component's own button. `.menu__nudge`
          flattens `.ndg`'s right-aligned column back into a menu row; the send,
          the WhatsApp mark, the popup-block recovery and the error sentence are
          all the shared component's. */}
      <span className="menu__nudge">
        <NudgeButton
          clientId={row.id}
          clientName={row.name}
          template={template}
          label="Message"
          className="menu__i"
          role="menuitem"
          showContactedNote={false}
        />
      </span>
      <div className="menu__sep" />
      <button
        className="menu__i"
        type="button"
        role="menuitem"
        disabled={pending}
        title={
          paused
            ? `Let the roster read ${first}'s sessions and packs again`
            : `Stop the roster raising ${first} while they are away`
        }
        onClick={() => (paused ? write(() => resumeClient(row.id)) : setConfirming('pause'))}
      >
        {pending ? (paused ? 'Resuming…' : 'Pausing…') : paused ? 'Resume' : 'Pause'}
      </button>
      <button
        className="menu__i menu__i--danger"
        type="button"
        role="menuitem"
        disabled={pending}
        onClick={() => setConfirming('archive')}
      >
        Archive
      </button>
      {error && <p className="menu__note fail">{error}</p>}
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
  const router = useRouter();
  const menuOpen = openRowId === row.id;

  const trClass = row.severity === 'critical' ? 'crit' : row.severity === 'alert' ? 'alert' : '';
  const hasAttn = !!row.attention;

  const lastAttended = row.lastAttendedAt
    ? relativePast(row.lastAttendedAt, now)
    : null;

  const href = `/clients/${row.id}`;

  return (
    <Row
      className={trClass || undefined}
      style={{ cursor: 'pointer' }}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(href); }}
      tabIndex={0}
      role="link"
      aria-label={`Open ${row.name}'s file`}
      /* ── THE CLIENT CELL IS THE ROW'S HEADER ──────────────────────────
         `<th scope="row">`, so a reader running down the Pending column
         hears *Priya Pillai, ₹6,400* rather than *₹6,400* nine times. It
         was a plain `<td>`, which on the one table in this product built to
         be read across is the cell that most needed to name its row.

         The severity spine follows it: §14's `tr.alert td:first-child` is
         `td:first-child, th:first-child` now, because the first cell of a
         row is the first cell of a row whichever element it is. */
      header={
        <span className="who2">
          <Avatar name={row.name} id={row.id} size="sm" />
          <span>
            <b>{row.name}</b>
            {/* Phone and where, on ONE line, because the column the mode used to
                have is the Status column now. The number stays visible on every
                row on purpose: it is half of what this screen searches. */}
            <i>
              {row.phone ?? '—'}
              {' · '}
              {row.mode === 'floor' ? 'In Person' : 'Online'}
            </i>
          </span>
        </span>
      }
      cells={[
        {
          key: 'up',
          className: 'rst__c-up',
          content: hasAttn ? (
            /* `title` on both forms, because the track is capped at the
               90th percentile of the line and the longest one ellipsises —
               see §14. A sentence a trainer cannot finish reading and cannot
               recover is worse than one that wraps. */
            <span className="attn" title={row.line}>
              <KindIcon kind={row.attention!.kind} />
              <u>{row.line}</u>
            </span>
          ) : (
            <span className="attn attn--calm" title={row.line}>{row.line}</span>
          ),
        },
        {
          key: 'tag',
          className: 'rst__c-tag',
          content: <StatusTag tag={row.tag} />,
        },
        {
          /* ── THE GAUGE, WHERE A BARE FRACTION WAS ─────────────────────
             `20/24` and `0/24` are the same shape — two numerals, a slash,
             two numerals, in the same tabular figures at the same weight —
             so the one client with nothing left was not findable down this
             column without reading every cell. The phone card list has
             drawn the bar since it shipped and the desk table, which is
             the view a trainer triages in, drew the fraction. `PackGauge`
             is that card's own `.crd-pk`, promoted. */
          key: 'left',
          numeric: true,
          className: 'rst__c-left',
          content: row.pack ? (
            <PackGauge remaining={row.pack.remaining} total={row.pack.total} />
          ) : (
            <span className="ink3">—</span>
          ),
        },
        /* ── THERE IS NO PENDING COLUMN ──────────────────────────────
           It drew `rupees(row.owed)`, toned, and every figure it carried was
           already printed four columns to its left with its age attached —
           *₹6,400 overdue · 13 days* beside a *₹6,400*. Nineteen of
           twenty-three rows were an em dash. A column that is blank on 83% of
           rows and a restatement on the rest is 96px the action track can use
           and one more thing the eye has to skip on every read.

           What did NOT go with it: *Amount pending* is still a sort, the
           *overdue* and *due* tiles on the strip still select exactly the rows
           it named, and `owed` is still on `RosterRow` for both. The one case
           this loses is a client who owes AND has a heavier band — the line is
           whichever band wins (`candidates.sort(...)[0]`), so an empty pack or
           an unfinished setup would print instead and the money would not be on
           the row at all. None of the seeded roster is in that state; if it
           becomes common the answer is the LINE carrying both, not the column
           coming back. */
        {
          key: 'last',
          className: 'mono rst__c-last',
          style: { color: 'var(--tx-ink-3)', fontSize: 11.5 },
          content: lastAttended ?? <span className="ink3">Never</span>,
        },
        {
          /*
            Action column.

            ── IT USED TO BE A BUTTON THAT DID NOTHING ──────────────────
            Every row with an attention band drew `{row.attention.action}` as
            a bare `<button>` with no handler: *Remind*, *Check in* and
            *Renew*, live on every roster since this screen was written, and
            none of them wired to anything. Pressing one selected the row's
            text.

            Now the three message-shaped bands send. The other three —
            *Mark*, *Assign*, *Close* — are the trainer's own housekeeping
            and belong on the screens that do them, so the row states the
            verb without offering it rather than offering a second button
            that also does nothing.

            IT IS ALSO THE TRACK THAT TAKES THE BAND'S SURPLUS, which is
            what makes `Messaged 2 days ago` fit beside its button instead
            of under it — see §14. At 1,424px of band this cell is 354px
            wide against the 118 it used to be pinned to.
          */
          key: 'act',
          className: 'act',
          content: row.attention &&
            (row.attention.kind === 'pack' && row.attention.packageId ? (
              <RenewButton packageId={row.attention.packageId} label={row.attention.action} />
            ) : templateForKind(row.attention.kind) ? (
              <NudgeButton
                clientId={row.id}
                clientName={row.name}
                template={templateForKind(row.attention.kind)!}
                label={row.attention.action}
                className="btn btn--secondary btn--sm"
              />
            ) : (
              <Tag>{row.attention.action}</Tag>
            )),
          onClick: (e) => e.stopPropagation(),
        },
        {
          key: 'kb',
          className: 'kb',
          style: { position: 'relative' },
          content: (
            <>
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
            </>
          ),
          onClick: (e) => e.stopPropagation(),
        },
      ]}
    />
  );
}

/* ────────────────────────────────────────────────── the roster's columns ──

   THE CLASSES ARE THE LAYOUT AND THE BAND'S ANSWER TO IT. Each `rst__c-*` is
   both the track's width (webapp.css §14 sizes them off the widest ink each
   column actually draws) and the handle the container query hides it by, when
   the pane is too narrow to hold every column honestly. They are on the header
   AND the body cell because `display:none` has to take both, or `fixed` keeps
   reserving a track for a column nobody can see.

   The last two carry no label on purpose — `bare` — for the reason `Table` puts
   in its own type: an actions column has nothing to sort and nothing to name,
   and a header over it would be a word the eye has to dismiss on every read. */
const ROSTER_COLUMNS: Column[] = [
  { key: 'who', label: 'Client', className: 'rst__c-who' },
  { key: 'up', label: 'What’s up', className: 'rst__c-up' },
  { key: 'tag', label: 'Status', className: 'rst__c-tag' },
  /* *Sessions left* until this pass, and the rename is what the gauge bought.
     A header only has to NAME the column when the column can be read; the cell
     draws `6/8` over a bar now, so the quantity is on screen and the word above
     it is free to be the noun instead of the sentence. It is 86px narrower, and
     86px is what lets *Pending* and *Last attended* survive a band this screen
     is actually opened at. `title` carries the long form for anyone who wants
     it. */
  {
    key: 'left',
    label: <span title="Sessions left on their current pack">Pack</span>,
    numeric: true,
    className: 'rst__c-left',
  },
  { key: 'last', label: 'Last attended', className: 'rst__c-last' },
  { key: 'act', label: '', bare: true, className: 'act' },
  { key: 'kb', label: '', bare: true, className: 'kb' },
];

/* Which COLUMN each sort names, so `aria-sort` lands on the right header.

   Two of the five name no column of their own and both point at *What’s
   up*, which is the column that says what they read. `attention` never had one:
   it is a ranking across four columns, not one of them. `owed` had one until
   the Pending column came out, and the line is where the figure lives now —
   *₹6,400 overdue · 13 days* is the same fact the column drew, with its age
   attached. A sort whose `aria-sort` landed on nothing would be a table that
   says it is unsorted while it is sorted. */
const SORT_COLUMN: Record<SortKey, string> = {
  attention: 'up',
  name: 'who',
  recent: 'last',
  left: 'left',
  owed: 'up',
};

/* ───────────────────────────────────────── phone card row (≤900 px) ── */

function PhoneRow({ row, now }: { row: RosterRow; now: number }) {
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

  return (
    <button
      className={rowClass}
      type="button"
      onClick={() => router.push(`/clients/${row.id}`)}
      aria-label={`Open ${row.name}'s file`}
    >
      <Avatar name={row.name} id={row.id} size="sm" />
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
      {/* `.crd-pk` was this card's own class, in `app.css`, at this one
          call-site — while the DESK row four hundred lines up drew the same
          fact as a bare `20/24`. It is `c-packgauge` now and both draw it. */}
      {pack != null && <PackGauge remaining={pack.remaining} total={pack.total} />}
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
    <Chip
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
    >
      <SortIcon />
      {label}
      <ChevronDown />
    </Chip>
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
      {/*
       * `autoComplete="off"` AND `suppressHydrationWarning`, and the second one
       * is the interesting half.
       *
       * REPORTED FROM AN IPHONE 13 over the LAN dev server: *"A tree hydrated but
       * some attributes of the server rendered HTML didn't match the client
       * properties"*, pointing at this element. `value` is `query`, `query` is
       * `useState('')`, and there is no date, no locale and no `Math.random()`
       * anywhere in this component — so the server writes `value=""` and the
       * client computes `""`, and React's own list of causes leaves exactly one
       * candidate: something OUTSIDE React wrote to this node before hydration.
       *
       * On iOS that is Safari's form-state restoration. Safari repopulates text
       * inputs from the previous visit on a reload or a back-navigation, and it
       * does so before the bundle runs, which is precisely the window React is
       * comparing across. It shows up on a phone and not on a desk because a
       * trainer reloads a phone to see a CSS change; nobody reloads to test a
       * search field.
       *
       * That restoration is not a bug worth fighting — a query surviving a reload
       * is a small kindness — so this says the node is legitimately not React's
       * at hydration time. It is scoped to ONE input, so a genuine mismatch on
       * any other element still reports.
       *
       * FALSIFIABLE: if the warning still names this line after this change, the
       * cause is NOT pre-hydration mutation and this comment is wrong — look at
       * `.rst-desk`/`.rst-phone` next, since both copies of this field render on
       * the server and only CSS decides which one a reader sees.
       */}
      <input
        type="search"
        value={value}
        placeholder="Search name or phone"
        aria-label="Search clients by name or phone"
        autoComplete="off"
        suppressHydrationWarning
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}

/* ────────────────────────────────────────────────── filter chip button ── */

function FilterButton({ fc, onClick }: { fc: number; onClick: () => void }) {
  return (
    /* The count is the BADGE and only the badge. It was in the label as well —
       `Filter · 1` with a `1` plate immediately after it — which draws as
       *Filter · 1 1* and reads at a glance as eleven. The phone's copy of this
       control (`crd-ph-filter`) has always been the label plus the badge, and
       one screen spelling one control two ways is the drift `ui/Chip` exists to
       stop. `aria-label` carries the number in words, because a `.rail__n` is a
       plate with a digit in it and *Filter 3* is not a sentence. */
    <Chip
      onClick={onClick}
      aria-label={fc > 0 ? `Filter and sort clients, ${fc} on` : 'Filter and sort clients'}
    >
      <FilterIcon />
      Filter
      {fc > 0 && <span className="rail__n rail__n--acc">{fc}</span>}
    </Chip>
  );
}

/* ─────────────────────────────────────────────────── main component ── */


/* Module constants, not `[]` at the call site: a fresh empty array every render
   is a fresh identity, and `usePaletteRows` depends on these by identity. */
const EMPTY_ATTENTION: AttentionItem[] = [];
const EMPTY_SESSIONS: DeckSession[] = [];

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
    () => data.clients.filter(c => c.status !== 'archived').map(c => ({ id: c.id, name: c.name ?? 'Client' })),
    [data.clients],
  );

  /* The shell already carries a roster, and this one is the same people. It is
     handed up anyway so the palette matches THIS screen's list exactly — the
     roster page is where a trainer would notice the two disagreeing. */
  usePaletteRows({ clients: paletteClients, attention: EMPTY_ATTENTION, today: EMPTY_SESSIONS });

  /* Counts by TAG now, so the line under the title and the chips beside it
     cannot disagree. `at risk` leads it for the same reason the sort does. */
  /* ── THE SUBTITLE STOPPED SAYING WHAT THE CHIPS SAY ───────────────────────
     It was the tag counts as prose — *4 at risk · 3 expiring · 16 active · 1
     archived* — sitting twelve pixels above a chip row that draws the identical
     six numbers, each one of them pressable. A line of text restating the
     control directly beneath it is not a summary, it is the control with its
     affordance removed; and where they could disagree, the reader has no way to
     know which one is stale.

     What survives is the two facts the chips genuinely cannot carry: how many
     people are on the roster at all (`All` carries it, but as a count on a
     filter rather than as the size of the thing) and how many are ARCHIVED —
     which is not a segment, has no chip, and is the only number on this screen
     naming clients the table below will never show. */
  const subtitle = roster.firstRun
    ? 'No clients yet'
    : [
        `${roster.rows.length} ${roster.rows.length === 1 ? 'client' : 'clients'}`,
        roster.archived ? `${roster.archived} archived` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const { tally } = roster;

  /* ── THE SIX TILES ───────────────────────────────────────────────────────
     In this order, always, whatever the roster holds — see the strip's own
     comment for why. `tone` is the `.warn` class `.strip` already defines and
     it is on the overdue tile alone: money past seven days is the one figure
     here that is worse than the others rather than merely different from them,
     and a tone on every tile is a tone on none.

     The money tiles print an AMOUNT and the other four print a COUNT, which is
     the split the trainer already reads them by — *how much* for the two about
     rupees, *how many* for the four about people. The overdue tile's count
     rides in its label rather than becoming a second figure. */
  const focusTiles: {
    key: Focus;
    value: string | number;
    label: string;
    count: number;
    tone?: string;
  }[] = [
    { key: 'overdue', value: rupees(tally.overdueAmt), label: `overdue > 7 d · ${tally.overdueCount}`, count: tally.overdueCount, tone: 'warn' },
    { key: 'due', value: rupees(tally.dueAmt), label: `due, not yet late · ${tally.dueCount}`, count: tally.dueCount },
    { key: 'quiet', value: tally.quiet, label: 'gone quiet', count: tally.quiet },
    { key: 'ending', value: tally.ending, label: 'pack ending', count: tally.ending },
    { key: 'missed', value: tally.missed, label: 'missed 2 or more', count: tally.missed },
    { key: 'setup', value: tally.setup, label: 'not set up', count: tally.setup },
  ];

  /* A second press clears it, and picking a tile closes whatever is open —
     the sort menu and the filter panel are both answers to the same question
     and leaving one up beside a fresh selection is two controls disagreeing.

     It does NOT touch the segment. A trainer on *At risk* who presses *gone
     quiet* means the intersection, which is what `filterRows` gives them. */
  const pickFocus = useCallback((key: Focus) => {
    setSortMenuOpen(false);
    setFilterPanelOpen(false);
    setOpenRowId(null);
    setFilters(f => ({ ...f, focus: f.focus === key ? null : key }));
  }, []);

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
      label: v === 'floor' ? 'In Person' : 'Online',
      remove: () => setFilters(f => ({ ...f, mode: f.mode.filter(x => x !== v) })),
    })),
    ...filters.money.map(v => ({
      label: v === 'owes' ? 'Pending' : v === 'paid' ? 'Paid up' : 'Pack ending',
      remove: () => setFilters(f => ({ ...f, money: f.money.filter(x => x !== v) })),
    })),
    ...filters.batch.map(v => ({
      label: v === 'morning' ? 'Morning' : v === 'evening' ? 'Evening' : v === 'night' ? 'Night' : 'No batch',
      remove: () => setFilters(f => ({ ...f, batch: f.batch.filter(x => x !== v) })),
    })),
    /* The strip's own selection appears here too, and that is not a duplicate
       control. The pressed tile is 90px above and easy to miss once the table
       has scrolled; this row is where every OTHER narrowing already announces
       itself, and a filter that is on but only visible in one place is the one
       a trainer forgets is on and then reports the roster as broken. */
    ...(filters.focus
      ? [{
          label: FOCUS_LABEL[filters.focus],
          remove: () => setFilters(f => ({ ...f, focus: null })),
        }]
      : []),
  ];

  return (
    <LastContactProvider map={lastContact} now={now}>
      <TopBar crumb="Clients" />

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
                  <Button variant="secondary">
                    <ExportIcon size={15} />
                    Export
                  </Button>
                  <Button variant="primary" onClick={openAddDrawer}>
                    <Plus size={15} />
                    Add client
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── ROW 1 ON A PHONE: FIND, THEN NARROW ─────────────────────────
              The header's three ghost glyphs are gone and this replaces them.
              What was there: sort, filter and add, 20px each, right-aligned in
              a header whose `<h1>` is `display:none` at this width — so 108px
              of buttons sat at the end of a 366px row with **258px of empty
              band** to their left, which is the "three controls that failed to
              lay out" shape `app.css` already records against `.top__acts`.
              Three things were wrong beyond the emptiness.

              · ONE WAS A CREATE AND TWO WERE VIEW CONTROLS, drawn identically.
                `app.css` claimed *"the Add button is `btn--primary` so it reads
                as the primary action at a glance"* while the markup said
                `btn--ghost` — the comment and the code had drifted apart.
              · ADD WAS A DUPLICATE OF A BETTER DOOR. The bar's centre `+` lists
                *Add a client* first and lands on `/clients/new` with the form
                open, one tap from every screen; this glyph opened a drawer
                instead, so one act had two surfaces. The glyph goes and the `+`
                stays — nothing becomes unreachable, and `openAddDrawer` is
                still the desk's own path and the first-run screen's.
              · SORT AND FILTER WERE TWO DOORS TO ONE JOB and neither could say
                what it was set to. Sort is the panel's first section now.

              AND THE SEARCH FIELD LEADS. It used to be the first thing inside
              `.rst-phone`, which put it THIRD on the screen and made it scroll
              away with the cards. It is the fastest path to a named client on
              the screen whose whole job is finding one, and `TopBar` makes the
              same argument about its own field — "twenty-two clients are four
              taps deep through the roster and one search away".

              THE PAIR IS ON ONE ROW because they are one job: narrow this list,
              by text or by facet. The segment strip keeps the row below it and
              therefore keeps its whole width — putting `Filter` there instead
              would have taken 90px off a strip that already overflows 630/390
              and has to scroll. */}
          {!roster.firstRun && (
            <div className="crd-phtools">
              <SearchBox value={query} onChange={setQuery} />
              <Chip
                className="crd-ph-filter"
                aria-label={
                  fc > 0
                    ? `Filter and sort clients, ${fc} filters on`
                    : 'Filter and sort clients'
                }
                onClick={() => { closeAll(); setFilterPanelOpen(true); }}
              >
                <FilterIcon size={15} />
                Filter
                {fc > 0 && <span className="rail__n rail__n--acc">{fc}</span>}
              </Chip>
            </div>
          )}

          <div className="ph__tabs" style={{ gap: 7 }}>
            {SEGMENTS.map(s => {
              const count = roster.counts[s.key];
              const active = segment === s.key;
              return (
                <Chip
                  pressed={active}
                  key={s.key}
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
                </Chip>
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
              {/* `rstband` is the design system's size CONTAINER, and it has
                  to be here rather than on a viewport breakpoint: the rail is
                  248px expanded and 64px collapsed, so one window width hands
                  this table two panes 184px apart. Measured, that is the
                  difference between the whole roster fitting at 1280 and 167px
                  of it sitting off the edge. The columns answer the space they
                  actually have. */}
              <div className="rst-desk rstband">
                {/* ── THE SUMMARY STRIP, AND WHY IT IS SIX BUTTONS ─────────
                    Every tile here names a subset of the rows directly
                    underneath it — *₹6,400 overdue · 1* is one client on this
                    screen, *2 gone quiet* is two — and until this pass not one
                    of them selected it. The trainer read the figure and then
                    went and found those rows by eye in a list of twenty-three,
                    which is the work the figure was supposed to have done.

                    So each tile applies the filter it describes, and pressing
                    it again puts the roster back. `matchesFocus` in `roster.ts`
                    is written against the SAME expressions `buildRoster`
                    tallies with, because a tile that says 2 and then selects
                    three rows is worse than a tile that does nothing.

                    ALL SIX ARE ALWAYS DRAWN, greyed and inert at zero. They
                    were conditional — `{tally.quiet > 0 && …}` — so the strip
                    was a different shape on every roster and, worse, on the
                    same roster after a filter: press *Pack ending*, and the
                    three tiles left of it stayed while the two right of it
                    vanished and the whole strip re-laid itself under the
                    pointer that had just pressed it. Six tiles, one order, is a
                    position a trainer learns once. */}
                <div className="strip strip--pick">
                  {focusTiles.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      className={t.tone}
                      disabled={t.count === 0}
                      aria-pressed={filters.focus === t.key}
                      onClick={() => pickFocus(t.key)}
                    >
                      <b>{t.value}</b>
                      <i>{t.label}</i>
                    </button>
                  ))}
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
                    <Chip
                      pressed
                      key={chip.label}
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
                    </Chip>
                  ))}

                  <span className="tools__sp" style={{ flex: 1 }} />
                  <span className="small mono">
                    {visible.length} of {roster.rows.length}
                  </span>
                </div>

                {/* ── THE ROSTER, DRAWN BY `ui/Table` ──────────────────────
                    It was a hand-written `<table className="tbl rst">`, which
                    is the drift the catalogue exists to stop — and here it had
                    cost four things, all of them invisible to a sighted reader
                    and all of them free from the component:

                    · NO `<caption>`. The busiest table in the product announced
                      itself as *table, 8 columns, 24 rows*, of nothing.
                    · NO `scope` on any header. A roster read cell by cell could
                      not say which column a figure belonged to, so *₹6,400* was
                      a number with no name eight cells into a row.
                    · NO `aria-sort`, on a table that is ALWAYS sorted and whose
                      default order — attention first — is the single most
                      important thing about how it reads.
                    · NO `<th scope="row">`. The client is what names every
                      other cell on the line, and without it the Pending column
                      read out as a column of bare amounts.

                    `sort` is mapped rather than passed through: `SortKey` is
                    this screen's vocabulary and `aria-sort` takes ascending or
                    descending, so the map is where the two meet. *Needs
                    attention first* is descending — worst at the top — and
                    *Name A–Z* is the one that climbs. */}
                <div className="rstband__t">
                <Table
                  className="rst"
                  caption={`${visible.length} of ${roster.rows.length} clients, sorted by ${SORTS.find(x => x.key === sort)?.label ?? sort}`}
                  columns={ROSTER_COLUMNS}
                  sort={{ key: sort === 'attention' ? 'up' : SORT_COLUMN[sort], direction: sort === 'name' ? 'ascending' : 'descending' }}
                >
                  {showGroup && (
                    /* ── THE GROUP HEADER IS SEVEN CELLS, NOT ONE SPANNING 8 ──
                       It was `<th colSpan={8}>`, on the reasonable assumption
                       that a browser clamps a span to the columns that exist.
                       IT DOES NOT. Three of these columns are `display:none` at
                       a narrow band, so the span claimed eight columns against
                       a table that had five — and Chrome created the missing
                       three, out of the table's width. MEASURED at an 813px
                       band: the columns summed to **692**, the action track
                       came out at 40px against the 161 it is owed, and *Check
                       in* was drawn over the Pack column. Deleting this one row
                       from the DOM restored every width exactly.

                       So the row carries a real cell per hideable column,
                       wearing the SAME `rst__c-*` class the header does — which
                       means the row's cell count and the header's can never
                       disagree, because one stylesheet rule hides both. Only
                       the first cell has anything in it; `.grph th` paints all
                       of them, so the band is still unbroken across the row. */
                    <tr className="grph">
                      <th colSpan={2}>
                        Needs attention{' '}
                        <span className="ink3">
                          <b>{attentionVisible}</b>
                        </span>
                        <em>at risk, then expiring, then pending</em>
                      </th>
                      <th className="rst__c-tag" />
                      <th className="rst__c-left" />
                      <th className="rst__c-last" />
                      <th className="act" />
                      <th className="kb" />
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
                    /* Same shape as the group header above, and for the same
                       reason: a span wider than the columns that exist invents
                       the difference. `.rst tbody td{height:var(--rst-row)}` is
                       cancelled here — an empty state is not a row. */
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          textAlign: 'center',
                          padding: '32px 0',
                          height: 'auto',
                          color: 'var(--tx-ink-3)',
                          whiteSpace: 'normal',
                        }}
                      >
                        {searching
                          ? `Nobody on the roster matches “${query.trim()}”`
                          : 'No clients match'}
                      </td>
                      <td className="rst__c-tag" />
                      <td className="rst__c-left" />
                      <td className="rst__c-last" />
                      <td className="act" />
                      <td className="kb" />
                    </tr>
                  )}
                </Table>
                </div>
              </div>

              {/* ── Phone card list (≤900px) — inclineyou-clients.html frame 1a ──
                  THE SEARCH FIELD IS NOT HERE ANY MORE. It sat at the top of
                  this scroller, which put it THIRD on the screen — under the
                  icon row and under the segment chips — and made it scroll away
                  with the cards. Both are wrong for this control: it is the
                  fastest path to a named client on the screen whose whole job is
                  finding one, and `TopBar` argues the same point about its own
                  field ("twenty-two clients are four taps deep through the
                  roster and one search away"). It is the header's first row
                  now, where `.ph` pins it. */}
              <div className="rst-phone">
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
          {roster.archivedRows.length > 0 && <ArchivedList rows={roster.archivedRows} />}
        </div>

        {/* Filter panel — absolute, anchored to .main (position:relative) */}
        {filterPanelOpen && (
          <FilterPanel
            filters={filters}
            sort={sort}
            visibleCount={filterPanelCount}
            totalCount={roster.rows.length}
            onApply={(f, s) => { setFilters(f); setSort(s); }}
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

    </LastContactProvider>
  );
}
