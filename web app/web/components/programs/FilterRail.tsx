'use client';

import { useEffect, useState } from 'react';

import type { GoalKey } from '@/lib/programs/blueprint';
import { GOALS } from '@/lib/programs/blueprint';
import {
  EQUIPMENT,
  EQUIPMENT_ORDER,
  LEVELS,
  LEVEL_ORDER,
  applyFilter,
  dayChoices,
  describeFilter,
  filterIsEmpty,
  type CertifiedFilter,
  type CertifiedRow,
  type Equipment,
  type Level,
  weekChoices,
} from '@/lib/programs/certified';
import { Panel } from '@/components/shell/Icons';
import { CloseIcon } from './Icons';
import { useFilterRailCollapsed } from './collapse';
import { Button } from '@/web-components/ui/Button';
import { Chip as UiChip } from '@/web-components/ui/Chip';
import { SearchField } from '@/web-components/ui/SearchField';

/** Funnel. Copied from `Clients.tsx`'s own — that screen put filters behind a
 *  counted control first, and a second drawing of the same idea would be a
 *  second glyph for one meaning. */
const FunnelIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

/**
 * THE CERTIFIED SHELF'S LEFT COLUMN — five filter groups, and nothing else.
 *
 * `/programs` puts search plus one goal row in `.split__hd` and gives the rest
 * of the column to the shelf itself. There is no shelf on this side — the
 * catalogue is in the right pane — so the whole left column is the filter set,
 * and it scrolls on its own.
 *
 * ── EVERY GROUP COUNTS WHAT IT WOULD SHOW, AND EMPTY GROUPS ARE NOT DRAWN ────
 *
 * The shelf's own rule: *five chips over an empty shelf is five ways to find
 * nothing.* So the week and day rows are built from what is actually on the
 * catalogue rather than from a hard-coded 1–7, and a chip whose count is zero
 * against the OTHER filters is dimmed rather than removed — removed would make
 * the rail reflow under the pointer on every press.
 *
 * ── AND CLEAR-ALL IS IN THE FOOT, NOT PER GROUP ──────────────────────────────
 *
 * With five groups on screen a per-group reset is five controls that each undo a
 * fifth of the state, and the one a trainer actually wants is all of it.
 *
 * ── IT FOLDS TO A SPINE, AND THE SPINE HAS TO CARRY THE COUNT ────────────────
 *
 * `collapse.ts` carries why either left column folds. This one has a hazard the
 * program shelf does not: a folded LIST hides names, and a folded FILTER SET
 * hides the reason the grid beside it is showing four of forty. So the spine
 * states how many groups are ticked and wears the accent while any are — and
 * `.cert__count` says the terms in full at the top of the pane, which is where
 * a trainer is already reading the number the filters produced.
 *
 * ── AND ON A PHONE IT IS NOT A COLUMN AT ALL ─────────────────────────────────
 *
 * MEASURED at 390×844: `.split__l` took **321px — 38% of the screen** — to show
 * four of its six groups, because `.cert__rail`'s 386px of chips were in a 261px
 * scroller, so *Equipment* and *Yours* were reachable only by scrolling a box
 * nested inside the page's. The catalogue underneath got **294px**, and the
 * first card began at y=536 — **63% down the screen on the screen whose whole
 * job is showing programs.**
 *
 * A filter SET is not a list, so the two answers the shelf had are both wrong
 * here: it cannot become one scrolling chip row, because `3` and `8 wks` and
 * `Beginner` are answers to questions and the question is the group's own label,
 * and it cannot take a third of the screen either.
 *
 * So under 900px the column becomes **one 58px bar** — the search, which is the
 * fastest filter there is and the one a trainer reaches for when they know what
 * they want, plus a counted *Filter* control — and the six groups move into the
 * same bottom sheet `ProgramSwitcher` opens. Both halves of that are already in
 * this product: `Clients.tsx` put filters behind a control reading *Filter · 2*,
 * and `.pgsheet` is the section's bottom sheet. Neither is new here.
 */
export function FilterRail({
  rows,
  filter,
  onChange,
  mineCount,
  shownCount,
}: {
  /** Every certified row, unfiltered — the counts are what the chips are for. */
  rows: CertifiedRow[];
  filter: CertifiedFilter;
  onChange: (next: CertifiedFilter) => void;
  /** How many the grid is currently showing. Only the phone sheet reads it, for
   *  its *Show 4 programs* foot — a sheet that covers the grid it is narrowing
   *  has to say what it did, and the pane's `.cert__count` is behind it. Passed
   *  rather than recomputed: `CertifiedShelf` already has the filtered list, and
   *  a second `applyFilter` here is a second chance to disagree with it. */
  shownCount: number;
  /** How many are already on the trainer's shelf. The *hide mine* chip is not
   *  drawn at zero: a control that can only ever remove nothing is one more
   *  thing to read. */
  mineCount: number;
}) {
  const [collapsed, toggleCollapsed] = useFilterRailCollapsed();
  /* The phone's sheet. Separate from `collapsed`, which is the DESK's fold and
     remembered per device — see the block below for why the two must not be one
     piece of state. */
  const [sheet, setSheet] = useState(false);

  /* Capture, and `stopImmediatePropagation` — same contract as
     `ProgramSwitcher`'s and `PhoneProgram`'s, so one press spends one rung. */
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setSheet(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sheet]);
  /**
   * A chip's count is *how many would be left if this were the only thing
   * ticked in its own group, with every other group as it stands* — which is
   * what makes ticking a second chip in one group read as widening rather than
   * narrowing, because that is what it does.
   *
   * THAT SENTENCE HAS BEEN IN THIS FILE SINCE IT WAS WRITTEN AND THE CODE
   * UNDER IT DID SOMETHING ELSE: the old `countFor` applied the predicate and
   * `hideMine`, and IGNORED the other four groups outright. So with *Beginner*
   * ticked, the Equipment row still read `Full gym 3` while the grid it was
   * describing held one — every figure in the rail was a count of the
   * catalogue, presented as a count of the result.
   *
   * `applyFilter` is now what answers, which is the only way the two cannot
   * drift again: the chip is counted by the same function that will run when
   * it is pressed, so the number on it is a prediction the grid has to keep.
   */
  function countIf(patch: Partial<CertifiedFilter>): number {
    return applyFilter(rows, { ...filter, ...patch }).length;
  }

  /** How many the CATALOGUE holds, filters ignored. A different question, and
   *  the one that decides whether a chip is drawn at all — see `Chip` below
   *  for why the two answers must not be the same number. */
  function inCatalogue(predicate: (r: CertifiedRow) => boolean): number {
    return rows.filter(predicate).length;
  }

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const days = dayChoices(rows);
  const weeks = weekChoices(rows);

  /* How many of the six groups are narrowing the grid. `describeFilter` is the
     same list `.cert__count` prints, so the spine's number and the pane's
     sentence cannot disagree. */
  const active = describeFilter(filter).length;

  /* THE SIX GROUPS, ONCE. They are the desk column's body and the phone sheet's,
     and only one of the two is ever in the document: the column is `display:none`
     under 900px and the sheet cannot be opened over it, because the control that
     opens it is `display:none` above 900. So this is one instance at any width
     rather than the two `.pgw__desk`/`.pgw__phone` pays for — and, either way,
     one place where a group is declared. */
  const groups = (
    <>
      <Group label="Goal">
        {GOALS.map(g => {
          if (inCatalogue(r => r.goalKey === g.key) === 0) return null;
          const on = filter.goal.has(g.key);
          return (
            <Chip
              key={g.key}
              on={on}
              count={countIf({ goal: new Set([g.key]) })}
              label={g.label}
              onClick={() => onChange({ ...filter, goal: toggle<GoalKey>(filter.goal, g.key) })}
            />
          );
        })}
      </Group>

      {/* THE LABEL STAYS A BARE NUMBER AND THE DISAMBIGUATION IS THE ARIA NAME.
          `3 days` reads better in a pill beside a `.chip__n` — and MEASURED in
          a 235px rail it takes the group from one row to two, and Length with
          it: +72px, which put Equipment and Yours below a fold with nothing
          saying they were there. The rail is 260px for a reason the block at
          `--w-list:260px` measured, and it is not going back to 400 so that a
          noun the group label already says can be repeated on every chip.

          So the number keeps the pill and `spoken` carries the sentence. A
          sighted reader has "DAYS A WEEK" 6px above the chip; a screen-reader
          user gets it from `role="group"`'s own label AND from the chip's,
          which is the one place the noun costs no pixels. */}
      <Group label="Days a week">
        {days.map(d => (
          <Chip
            key={d.value}
            on={filter.days.has(d.value)}
            count={countIf({ days: new Set([d.value]) })}
            label={String(d.value)}
            spoken={`${d.value} ${d.value === 1 ? 'day' : 'days'} a week`}
            onClick={() => onChange({ ...filter, days: toggle(filter.days, d.value) })}
          />
        ))}
      </Group>

      <Group label="Length">
        {weeks.map(w => (
          <Chip
            key={w.value}
            on={filter.weeks.has(w.value)}
            count={countIf({ weeks: new Set([w.value]) })}
            label={`${w.value} wks`}
            spoken={`${w.value} weeks long`}
            onClick={() => onChange({ ...filter, weeks: toggle(filter.weeks, w.value) })}
          />
        ))}
      </Group>

      <Group label="Level">
        {LEVEL_ORDER.map(l => {
          if (inCatalogue(r => r.row.certified?.level === l) === 0) return null;
          return (
            <Chip
              key={l}
              on={filter.level.has(l)}
              count={countIf({ level: new Set([l]) })}
              label={LEVELS[l]}
              onClick={() => onChange({ ...filter, level: toggle<Level>(filter.level, l) })}
            />
          );
        })}
      </Group>

      <Group label="Equipment">
        {EQUIPMENT_ORDER.map(e => {
          if (inCatalogue(r => r.row.certified?.equipment === e) === 0) return null;
          return (
            <Chip
              key={e}
              on={filter.equipment.has(e)}
              count={countIf({ equipment: new Set([e]) })}
              label={EQUIPMENT[e]}
              onClick={() =>
                onChange({ ...filter, equipment: toggle<Equipment>(filter.equipment, e) })
              }
            />
          );
        })}
      </Group>

      {mineCount > 0 && (
        <Group label="Yours">
          {/* The one chip with no `count`. Its label already carries the
              figure it would act on, and `Hide the 1 I already use 4` is two
              numbers about two different things in one pill. */}
          <Chip
            ghost
            on={filter.hideMine}
            label={`Hide the ${mineCount} I already use`}
            onClick={() => onChange({ ...filter, hideMine: !filter.hideMine })}
          />
        </Group>
      )}
    </>
  );

  /* Same, for the control the two feet share. */
  const clearAll = (
    <Button
      variant="secondary"
      size="sm"
      wide
      onClick={() => onChange({ ...filter, ...cleared() })}
    >
      Clear all filters
    </Button>
  );

  /* THE PHONE'S CONTROL, and it is drawn in BOTH branches below.
     FOUND BY RENDERING on the builder's own shelf, which had the same shape: an
     early return for the folded state that omits the phone's half leaves a
     trainer who folded this column at a desk with no filters at all on their
     phone — and no way to unfold something whose spine is `display:none`. The
     desk's fold and the phone's sheet are different questions about different
     surfaces, so neither branch may drop the other's.

     A `.chip` with a count, which is `Clients.tsx`'s own *Filter · 2* — that
     screen put filters behind a counted control first and this is the second
     instance, not a second idea. */
  const filterButton = (
    <UiChip
      className="certfb__b"
      aria-haspopup="dialog"
      aria-expanded={sheet}
      onClick={() => setSheet(true)}
    >
      <FunnelIcon />
      Filter
      {active > 0 && <span className="rail__n rail__n--acc">{active}</span>}
    </UiChip>
  );

  /* THE SEARCH, likewise once — it is the fastest filter on the screen and the
     one thing that stays visible at every width. */
  /* `ui/SearchField.tsx` and not a hand-written `<label className="search">`.
     The markup was identical to the component's by eye, which is exactly the
     drift the catalogue exists to stop — identical today, and one screen's
     private copy the next time `.search` grows a clear button.

     `label` is BOTH the placeholder and the accessible name there, so the two
     cannot disagree, and it is short on purpose: the column is 260px (see
     `--w-list` in `app.css`), where *Search workout plan templates* truncates
     — and the words it would spend its last pixels on are the ones the page's
     `<h1>`, the active tab and the count line above the grid all already say.

     `count` is deliberately NOT passed. It renders a second polite live region,
     and `.cert__count` over the grid is already one saying the same figure in
     more words — two regions announcing one change is the change read twice. */
  const search = (
    <SearchField
      label="Search templates"
      value={filter.query}
      onChange={e => onChange({ ...filter, query: e.target.value })}
    />
  );

  const theSheet = sheet && (
    <>
      <div className="pgsheet__scrim" role="presentation" onClick={() => setSheet(false)} />
      <div className="pgsheet" role="dialog" aria-modal="true" aria-label="Filter templates">
        <div className="pgsheet__grab" aria-hidden="true" />
        <header className="pgsheet__hd">
          <p className="pgsheet__t">Filter</p>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={() => setSheet(false)}
            title={undefined}
            icon={<CloseIcon />}
          />
        </header>
        <div className="pgsheet__scroll cert__rail cert__rail--sheet">{groups}</div>
        {/* THE FOOT SAYS WHAT THE SHEET DID. Every chip narrows the grid the
            instant it is pressed, and on a phone the sheet is over that grid —
            so without this the trainer is ticking chips at a surface that gives
            them no answer until they dismiss it. *Show 4 programs* is the answer
            and the way out in one control, which is why the scrim is not the
            only exit and why the count is in the label rather than a heading.

            AND AT ZERO THE TWO SWAP, which is `NoMatch`'s rule arriving in the
            foot: a lime primary reading *Show 0 programs* invites a trainer to
            dismiss a sheet in order to look at nothing, and the thing they
            actually want at that moment is the one control that undoes it. So
            the count becomes a sentence and *Clear all filters* becomes the
            primary. The ✕ and the scrim are still the way out — a dead end does
            not need a third exit, it needs the way back. */}
        <div className="pgsheet__ft">
          {shownCount === 0 ? (
            <>
              <p className="pgsheet__none">Nothing matches all of these.</p>
              <Button
                variant="primary"
                wide
                onClick={() => onChange({ ...filter, ...cleared() })}
              >
                Clear all filters
              </Button>
            </>
          ) : (
            <>
              {!filterIsEmpty(filter) && clearAll}
              <Button
                variant="primary"
                wide
                onClick={() => setSheet(false)}
              >
                Show {shownCount} program{shownCount === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (collapsed) {
    return (
      <div className="split__l cert__l split__l--min">
        <button
          className={active > 0 ? 'pgspine pgspine--on' : 'pgspine'}
          type="button"
          aria-label={
            active > 0
              ? `Show filters — ${active} in use: ${describeFilter(filter).join(', ')}`
              : 'Show filters'
          }
          aria-expanded="false"
          onClick={toggleCollapsed}
        >
          <span className="pgspine__i">
            <Panel size={15} />
          </span>
          <span className="pgspine__t">
            Filters{active > 0 && <b>{active}</b>}
          </span>
        </button>

        {/* The phone's bar, which the spine is not. See `filterButton`. */}
        <div className="split__hd">
          <div className="pgsh__q">
            {search}
            {filterButton}
          </div>
        </div>
        {theSheet}
      </div>
    );
  }

  return (
    <div className="split__l cert__l">
      <div className="split__hd">
        <div className="pgsh__q">
          {search}
          {/* Always drawn, never hover-revealed — `Rail.tsx`'s rule for its own
              twin of this control. It is the DESK's fold and stands down under
              900px, where there is no column beside a grid to fold away from. */}
          <Button
            variant="ghost"
            iconOnly
            label="Hide filters"
            className="pgsh__col"
            aria-expanded="true"
            onClick={toggleCollapsed}
            title={undefined}
            icon={<Panel size={16} />}
          />
          {filterButton}
        </div>
      </div>

      <div className="cert__rail">{groups}</div>


      {/* Absent rather than disabled when there is nothing to clear — the rule
          the profile's Save row already sets: nothing to do is better said by
          there being nothing to press. */}
      {!filterIsEmpty(filter) && (
        <div className="cert__railfoot">{clearAll}</div>
      )}
      {theSheet}
    </div>
  );
}

function cleared() {
  return {
    query: '',
    goal: new Set<GoalKey>(),
    days: new Set<number>(),
    weeks: new Set<number>(),
    level: new Set<Level>(),
    equipment: new Set<Equipment>(),
    hideMine: false,
  };
}

/** A heading and its chips. `role="group"` with `aria-label` rather than a bare
 *  `<p>` + row: a screen reader should hear which question these five chips are
 *  answers to before it reads the first one. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cert__fg" role="group" aria-label={label}>
      <span className="cert__fk">{label}</span>
      <div className="tools">{children}</div>
    </div>
  );
}

/**
 * ONE FILTER CHIP. `aria-pressed` on a toggle button, never `role="radio"` —
 * the same contract the shelf's goal row and every `Chip` in setup already use.
 *
 * — THE COUNT IS `.chip__n`, IN EVERY GROUP —
 *
 * It used to be interpolated into the label as plain text — `{g.label} {n}` —
 * in three of the six groups and absent from the other two. Three problems in
 * one line: the product's own count element (`.chip__n`, mono, tabular, 10.5px
 * at .72) was not used, so these chips did not look like `/clients`' or
 * `/schedule`'s; a proportional figure in a bold 12.5px label reads as part of
 * the NAME (*Hypertrophy 2* is a plausible program name); and two groups had
 * no figure at all, so a trainer could not see that `2 days` was one card.
 *
 * — AND ZERO DIMS, IT DOES NOT DISAPPEAR —
 *
 * This component's own docstring already said so: *a chip whose count is zero
 * against the OTHER filters is dimmed rather than removed — removed would make
 * the rail reflow under the pointer on every press.* The code removed it, with
 * `if (n === 0) return null`, and the two claims sat four hundred lines apart.
 * `aria-disabled` plus §04's `opacity:.38` is the product's existing answer,
 * and the block that introduced it in `app.css` makes the same argument: a
 * refused chip stays in the tab sequence so the refusal can be reached.
 *
 * The two questions stay separate. A chip that matches nothing IN THE
 * CATALOGUE is not drawn — *five chips over an empty shelf is five ways to find
 * nothing*, and that set does not change while a trainer ticks things. A chip
 * that matches nothing against the CURRENT filters dims in place.
 *
 * A PRESSED chip never dims, whatever it counts. It is the control that undoes
 * the state it is reporting on, and a filter you cannot switch off is a dead
 * end with no way back — which is the one thing an empty grid must not have.
 */
function Chip({
  on,
  ghost,
  count,
  label,
  spoken,
  onClick,
}: {
  on: boolean;
  ghost?: boolean;
  /** What the grid would hold if this were the only thing ticked in its group. */
  count?: number;
  label: string;
  /**
   * What a reader hears in place of `label`, where the pill is too narrow to
   * say it. `2` in the days group is `2 days a week` here.
   *
   * It is not a second name for the same thing: the rail is 260px, so two of
   * the six groups label their chips with a bare figure, and a bare figure in a
   * rotor is a stop that says nothing. The visible label is what fits and this
   * is what it MEANS — which is the same split `.certc__tl`'s own aria name
   * makes one component over.
   */
  spoken?: string;
  onClick: () => void;
}) {
  const dead = count === 0 && !on;
  const said = spoken ?? label;

  return (
    <UiChip
      pressed={on}
      ghost={ghost}
      aria-disabled={dead || undefined}
      /* The name a reader hears, because `.chip__n` beside a label is two
         separate runs of text and *Beginner 3* is one fact. `matching` rather
         than a bare figure for the same reason the visible count is a
         different element: three what? */
      aria-label={count === undefined ? spoken : `${said} · ${count} matching`}
      onClick={() => {
        if (!dead) onClick();
      }}
    >
      {label}
      {count !== undefined && <span className="chip__n">{count}</span>}
    </UiChip>
  );
}
