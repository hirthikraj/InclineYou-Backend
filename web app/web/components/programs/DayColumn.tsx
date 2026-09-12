'use client';

import { useEffect, useRef, useState } from 'react';

import type { ExerciseNameWire } from '@/lib/programs/api';
import {
  blocksOf,
  ordinalLabel,
  partsToText,
  prescribe,
  prescribeAgainst,
  type Block,
  type Entry,
  type Part,
} from '@/lib/programs/blueprint';
import { AltIcon, ArrowDown, ArrowUp, CopyIcon, DotsIcon, LinkIcon, PlusIcon, TrashIcon } from './Icons';

/**
 * ONE DAY, AS COLUMNS — the plane the whole builder sits on.
 *
 * Columns are **Day 1 … Day n**, the template's ordinal slots, and there is
 * never a Rest column: rest is the absence of a slot and the absence is already
 * drawn by there being no column. Which weekday each slot lands on is the
 * client's, captured at assign time.
 *
 * The column is 236px because that is what fits "Romanian deadlift" over a
 * "3 × 12 · 90s rest · slow eccentric" prescription without truncating either.
 */

/** Private to this builder, so a column only ever accepts a row from it — a
 *  file, a link or a selection dragged in from elsewhere is not a prescription. */
const DRAG_MIME = 'application/x-inclineyou-row';

export interface DayColumnProps {
  day: number;
  label: string;
  rows: Entry[];
  /** Week 1's rows for the same day, when this column is a week being compared
   *  against it. Drives the one accented figure in the weeks-across view. */
  against?: Entry[] | null;
  names: Record<string, ExerciseNameWire>;
  selection: Set<string>;
  /** The column a move is about to land in. Same treatment a drag target gets,
   *  so the keyboard path and the pointer path report the same thing. */
  dropTarget?: boolean;
  /** A week with nothing of its own, showing week 1 dimmed. */
  repeat?: boolean;
  readOnly?: boolean;
  onToggle: (uid: string, additive: boolean) => void;
  onOpenRow: (uid: string) => void;
  onAdd: () => void;
  onNudge: (uid: string, direction: -1 | 1) => void;
  onLink: (uid: string) => void;
  onUnlink: (groupId: string) => void;
  onDuplicateRow: (uid: string) => void;
  onRemoveRow: (uid: string) => void;
  onRelabel?: (label: string) => void;
  onMakeOwn?: () => void;
  onCopyDay?: () => void;
  onMoveHere?: () => void;
  /** The block being dragged right now, anywhere on the plane — its first
   *  row's uid. Every column needs it, because a drag that started in Day 1 is
   *  a drop target in Day 3. */
  dragUid?: string | null;
  onDragRow?: (uid: string) => void;
  onDragEnd?: () => void;
  /** Land the dragged block above `beforeUid`, or at the tail when it is null. */
  onDropRow?: (beforeUid: string | null) => void;
}

export function DayColumn(props: DayColumnProps) {
  const { day, label, rows, repeat, dropTarget, readOnly, onRelabel, onDropRow } = props;
  const blocks = blocksOf(rows);

  /* ── the drag ───────────────────────────────────────────────────────────
     Handled ONCE on the body rather than per row, and the insertion point is
     measured off the rendered blocks. A superset is one block and therefore one
     target: a drop indicator between 4a and 4b would be offering to put a row
     inside a pair, which `blocksOf` would then split into two blocks nobody
     asked for. */
  const body = useRef<HTMLDivElement>(null);
  const [before, setBefore] = useState<string | null | undefined>(undefined);
  const showing = before !== undefined;

  /* WHETHER THIS IS OUR DRAG IS ASKED OF THE PAYLOAD, NOT OF REACT STATE.
     `dragstart` and the first `dragover` land in the same task, so a gate on
     the `dragUid` prop misses that one — harmless in a real drag, where a
     second `dragover` arrives a pixel later, and wrong in principle. The type
     list is readable during a drag where `getData` is not, which is exactly
     what it is there for. */
  function accepts(e: React.DragEvent) {
    return Boolean(onDropRow) && e.dataTransfer.types.includes(DRAG_MIME);
  }

  function locate(clientY: number): string | null {
    const el = body.current;
    if (!el) return null;
    for (const block of el.querySelectorAll<HTMLElement>('[data-block]')) {
      const box = block.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return block.dataset.block ?? null;
    }
    return null;
  }

  function over(e: React.DragEvent) {
    if (!accepts(e)) return;
    // Without this the browser refuses the drop and animates the row back to
    // where it came from, which reads exactly like a feature that is broken.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setBefore(locate(e.clientY));
  }

  function drop(e: React.DragEvent) {
    if (!accepts(e)) return;
    e.preventDefault();
    onDropRow?.(locate(e.clientY));
    setBefore(undefined);
  }

  return (
    <section
      className={`dayc${repeat ? ' dayc--repeat' : ''}${dropTarget ? ' dayc--drop' : ''}${
        showing ? ' dayc--dragover' : ''
      }`}
      aria-label={label ? `Day ${day} · ${label}` : `Day ${day}`}
    >
      <header className="dayc__hd">
        <b>Day {day}</b>
        {onRelabel ? (
          <DayLabel label={label} onSave={onRelabel} />
        ) : (
          <i>{label || (repeat ? 'repeats week 1' : '')}</i>
        )}
        {rows.length > 0 && <span className="dayc__ct">{rows.length}</span>}
        {props.onCopyDay && !readOnly && (
          <button
            className="btn btn--icon btn--ghost pg__hd-act"
            type="button"
            title={`Copy Day ${day} into another day`}
            aria-label={`Copy Day ${day} into another day`}
            onClick={props.onCopyDay}
          >
            <CopyIcon size={13} />
          </button>
        )}
      </header>

      <div
        className="dayc__b"
        ref={body}
        onDragOver={over}
        onDrop={drop}
        onDragLeave={e => {
          // Only when the pointer has actually left the column — a `dragleave`
          // fires on every child boundary crossed on the way down it.
          if (!body.current?.contains(e.relatedTarget as Node | null)) setBefore(undefined);
        }}
      >
        {blocks.map((block, i) => (
          <BlockView
            key={block.entries[0].uid}
            block={block}
            nextBlock={blocks[i + 1] ?? null}
            dropBefore={showing && before === block.entries[0].uid}
            {...props}
          />
        ))}

        {before === null && <div className="dayc__dropline" aria-hidden="true" />}

        {repeat ? (
          <div className="dayc__f">
            Nothing of its own — repeats week 1.
            {props.onMakeOwn && (
              <button
                className="btn btn--sm btn--secondary pg__wide pg__gap"
                type="button"
                onClick={props.onMakeOwn}
              >
                Make this week its own
              </button>
            )}
          </div>
        ) : (
          !readOnly && (
            <button className="dayc__add" type="button" onClick={props.onAdd}>
              <PlusIcon size={13} />
              Add exercise
            </button>
          )
        )}

        {/* A move in flight turns every column into a destination. The button
            fills the lane's empty part rather than sitting under the rows,
            because a day is a LANE and the empty part of a lane is the target —
            §22's own argument for `align-items:stretch`. */}
        {props.onMoveHere && (
          <button className="dayc__here" type="button" onClick={props.onMoveHere}>
            Move here
          </button>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── the day label ── */

function DayLabel({ label, onSave }: { label: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        className="dayc__lbl"
        type="button"
        onClick={() => {
          // Seeded HERE rather than kept in sync by an effect. The draft only
          // exists while the field does, so there is nothing to synchronise —
          // and an effect that mirrors a prop into state is a second render
          // pass for a value the first one already had.
          setDraft(label);
          setEditing(true);
        }}
        title="Name this day"
      >
        {label || <span className="dayc__lbl-none">Name this day…</span>}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      className="ctl dayc__lblin"
      value={draft}
      aria-label={`Name for day`}
      placeholder="Push, Pull, Legs…"
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onSave(draft.trim());
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          setEditing(false);
          onSave(draft.trim());
        }
        if (e.key === 'Escape') {
          setEditing(false);
          setDraft(label);
        }
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────── a block ── */

/**
 * A SUPERSET IS ONE BLOCK, NOT TWO ROWS.
 *
 * The members share a spine and a single rest line, because a superset's rest is
 * after the *round* and not between the movements — printing it twice is how a
 * superset turns back into two straight sets on the gym floor. The ordinals read
 * 4a / 4b rather than A1 / A2, so the number still answers "where am I in the
 * day" while the letter says these two are one position.
 */
function BlockView({
  block,
  nextBlock,
  dropBefore,
  names,
  selection,
  against,
  readOnly,
  dragUid,
  onToggle,
  onOpenRow,
  onNudge,
  onLink,
  onUnlink,
  onDuplicateRow,
  onRemoveRow,
  onDragRow,
  onDragEnd,
}: DayColumnProps & { block: Block; nextBlock: Block | null; dropBefore: boolean }) {
  const grouped = block.entries.length > 1;
  const head = block.entries[0].uid;
  const dragging = Boolean(dragUid) && block.entries.some(e => e.uid === dragUid);
  /* A block is the drag UNIT, so the handle on any of its rows picks the block
     up by its head — `dropEntries` expands to the whole group from there. */
  const drag = readOnly || !onDragRow ? undefined : { head, onDragRow, onDragEnd };
  // A group prints rest once, on the footer. A single row prints its own.
  const rest = block.entries.find(e => e.restSeconds)?.restSeconds ?? null;

  const rowsView = block.entries.map((entry, i) => (
    <Row
      key={entry.uid}
      entry={entry}
      ordinal={ordinalLabel(block, i)}
      name={names[entry.exerciseId]?.name}
      altName={entry.altExerciseId ? names[entry.altExerciseId]?.name : undefined}
      selected={selection.has(entry.uid)}
      groupRest={grouped}
      against={against?.find(a => a.order === entry.order) ?? null}
      readOnly={readOnly}
      onToggle={additive => onToggle(entry.uid, additive)}
      onOpen={() => onOpenRow(entry.uid)}
      onNudge={d => onNudge(entry.uid, d)}
      onLink={() => onLink(entry.uid)}
      onUnlink={entry.groupId ? () => onUnlink(entry.groupId!) : undefined}
      onDuplicate={() => onDuplicateRow(entry.uid)}
      onRemove={() => onRemoveRow(entry.uid)}
      drag={drag}
      dragging={dragging}
      /* The whole group is one target, so only an ungrouped row carries the
         marker — for a superset it goes on the wrapper below. */
      block={grouped ? undefined : head}
      dropBefore={grouped ? false : dropBefore}
    />
  ));

  const last = block.entries[block.entries.length - 1];

  return (
    <>
      {grouped ? (
        <div
          className={`dayc__grp${dropBefore ? ' dayc__grp--dropbefore' : ''}${
            dragging ? ' dayc__grp--dragging' : ''
          }`}
          data-block={head}
        >
          {rowsView}
          <p className="dayc__gr">
            <b>Superset</b>
            {rest ? ` · ${rest}s rest after` : ' · no rest set'}
          </p>
        </div>
      ) : (
        rowsView
      )}

      {/* THE LINK LIVES IN THE GAP, which is where the relationship it creates
          lives. It is hidden until the body is hovered — six of these stacked
          down a column would read as the content — and because a gap is
          pointer-only, the identical action is on every row's menu. */}
      {!readOnly && nextBlock && (
        <div className="dayc__link">
          <i role="button" tabIndex={-1} aria-hidden="true" onClick={() => onLink(last.uid)}>
            <LinkIcon />
            Link
          </i>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── a row ── */

function Row({
  entry,
  ordinal,
  name,
  altName,
  selected,
  groupRest,
  against,
  readOnly,
  onToggle,
  onOpen,
  onNudge,
  onLink,
  onUnlink,
  onDuplicate,
  onRemove,
  drag,
  dragging,
  block,
  dropBefore,
}: {
  entry: Entry;
  ordinal: string;
  name: string | undefined;
  altName: string | undefined;
  selected: boolean;
  groupRest: boolean;
  against: Entry | null;
  readOnly?: boolean;
  onToggle: (additive: boolean) => void;
  onOpen: () => void;
  onNudge: (d: -1 | 1) => void;
  onLink: () => void;
  onUnlink?: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  drag?: { head: string; onDragRow: (uid: string) => void; onDragEnd?: () => void };
  dragging?: boolean;
  /** Set on an ungrouped row only: this row IS its block, so the column
   *  measures the insertion point off it. */
  block?: string;
  dropBefore?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  /*
   * THE ROW IS DRAGGABLE ONLY WHILE THE GRIP IS HELD.
   *
   * `.dayc__h` has drawn `cursor:grab` since the column was written and nothing
   * was ever attached to it, so the one affordance the design gives a pointer
   * was inert. Arming on the handle's `mousedown` rather than making the row
   * permanently `draggable` keeps the rest of the row selectable and stops a
   * click that wanders two pixels from turning into a move.
   */
  const [armed, setArmed] = useState(false);
  /* A grip pressed and released without a drag leaves the row armed, and a row
     that stays draggable after the pointer has gone is the next accidental
     move. Disarmed on the button coming up anywhere. */
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);
  const parts = against
    ? prescribeAgainst(entry, against)
    : prescribe(entry, groupRest);

  const label = name ?? 'Exercise not in your library';
  const sentence = `${label} — ${partsToText(parts) || 'no prescription set'}`;

  return (
    <div
      className={`dayc__ex${menu ? ' dayc__ex--menu' : ''}${name ? '' : ' dayc__ex--ghost'}${
        dragging ? ' dayc__ex--dragging' : ''
      }${dropBefore ? ' dayc__ex--dropbefore' : ''}`}
      data-block={block}
      draggable={armed || undefined}
      onDragStart={e => {
        if (!drag) return;
        e.dataTransfer.effectAllowed = 'move';
        // The private type is what every column tests a drop against; the plain
        // one is there because Firefox starts no drag without it.
        e.dataTransfer.setData(DRAG_MIME, drag.head);
        e.dataTransfer.setData('text/plain', drag.head);
        drag.onDragRow(drag.head);
      }}
      onDragEnd={() => {
        setArmed(false);
        drag?.onDragEnd?.();
      }}
      aria-pressed={selected}
      /*
       * SPACE TICKS A ROW; ENTER OPENS IT.
       *
       * Selection is a first-class state here rather than a mode, because moving
       * an exercise had no keyboard path at all and WCAG 2.2 SC 2.5.7 requires
       * the single-pointer alternative. The bar names the size of the set and
       * "Move to" is a control rather than a gesture — TrainHeroic's pattern,
       * and the one bulk affordance in the category that survives a keyboard.
       */
      role="button"
      tabIndex={readOnly ? -1 : 0}
      title={sentence}
      onKeyDown={e => {
        if (readOnly) return;
        if (e.key === ' ') {
          e.preventDefault();
          onToggle(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        } else if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onLink();
        }
      }}
      onClick={e => {
        if (readOnly) return;
        onToggle(e.metaKey || e.ctrlKey || e.shiftKey);
      }}
      onDoubleClick={() => !readOnly && onOpen()}
    >
      <span
        className="dayc__h"
        aria-hidden="true"
        title={drag ? 'Drag to reorder' : undefined}
        onMouseDown={() => drag && setArmed(true)}
      >
        <Grip />
      </span>
      <span className="dayc__o">{ordinal}</span>
      <span className="dayc__m">
        <span className="dayc__n">{label}</span>
        {parts.length > 0 && (
          <span className="dayc__p">
            {parts.map((part, i) => (
              <PartText key={i} part={part} />
            ))}
          </span>
        )}
        {altName && (
          <span className="dayc__alt">
            <AltIcon />
            or <b>{altName}</b>
          </span>
        )}
      </span>

      {!readOnly && (
        <RowMenu
          open={menu}
          setOpen={setMenu}
          canUnlink={Boolean(onUnlink)}
          onOpenRow={onOpen}
          onLink={onLink}
          onUnlink={onUnlink}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onNudge={onNudge}
        />
      )}
    </div>
  );
}

function PartText({ part }: { part: Part }) {
  if (part.tone === 'fail') return <span className="fail">{part.text}</span>;
  if (part.tone === 'changed') return <em>{part.text}</em>;
  return <>{part.text}</>;
}

function Grip() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.2" cy="2.6" r="1.15" />
      <circle cx="7.8" cy="2.6" r="1.15" />
      <circle cx="2.2" cy="7" r="1.15" />
      <circle cx="7.8" cy="7" r="1.15" />
      <circle cx="2.2" cy="11.4" r="1.15" />
      <circle cx="7.8" cy="11.4" r="1.15" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────── the row menu ── */

/**
 * ONE OVERFLOW BUTTON PER ROW, and the menu is where the actions go.
 *
 * That rule came out of the roster page — five glyph-only actions at 18px are
 * indistinguishable in a hurry — and it is the reason the system needed a menu
 * component at all. It is also the keyboard-reachable home of every action the
 * gap affordance and the drag handle offer to a pointer.
 */
function RowMenu({
  open,
  setOpen,
  canUnlink,
  onOpenRow,
  onLink,
  onUnlink,
  onDuplicate,
  onRemove,
  onNudge,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  canUnlink: boolean;
  onOpenRow: () => void;
  onLink: () => void;
  onUnlink?: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onNudge: (d: -1 | 1) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, setOpen]);

  function run(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(false);
      fn();
    };
  }

  return (
    <div className="dayc__menu" ref={box}>
      <button
        className="btn btn--icon btn--ghost dayc__more"
        type="button"
        aria-label="More actions for this exercise"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <DotsIcon size={15} />
      </button>

      {open && (
        <div className="menu" role="menu">
          <button className="menu__i" role="menuitem" type="button" onClick={run(onOpenRow)}>
            Edit the numbers <kbd>↵</kbd>
          </button>
          {canUnlink && onUnlink ? (
            <button className="menu__i" role="menuitem" type="button" onClick={run(onUnlink)}>
              <LinkIcon size={13} />
              Break the superset
            </button>
          ) : (
            <button className="menu__i" role="menuitem" type="button" onClick={run(onLink)}>
              <LinkIcon size={13} />
              Superset with the next <kbd>⌘L</kbd>
            </button>
          )}
          <div className="menu__sep" />
          <button className="menu__i" role="menuitem" type="button" onClick={run(() => onNudge(-1))}>
            <ArrowUp size={13} />
            Move up
          </button>
          <button className="menu__i" role="menuitem" type="button" onClick={run(() => onNudge(1))}>
            <ArrowDown size={13} />
            Move down
          </button>
          <button className="menu__i" role="menuitem" type="button" onClick={run(onDuplicate)}>
            <CopyIcon size={13} />
            Duplicate
          </button>
          <div className="menu__sep" />
          <button
            className="menu__i menu__i--danger"
            role="menuitem"
            type="button"
            onClick={run(onRemove)}
          >
            <TrashIcon size={13} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
