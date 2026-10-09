'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { fetchExerciseMeta, searchExercises } from '@/lib/exercises/actions';
import type { ExerciseWire, ExercisesMeta } from '@/lib/exercises/api';
import { fetchWorkoutTemplates } from '@/lib/workouts/actions';
import { Skeleton } from '@/web-components/ui/Skeleton';

/* THE BONE WIDTHS, varied and fixed. Nine identical bars read as a table; nine
   different ones read as a list of names about to arrive. Fixed rather than
   random because a skeleton that reshuffles on every render is a skeleton that
   flickers, and `Math.random()` in a render is refused by `react-hooks/purity`
   for the same family of reason `Date.now()` is. */
const SKELETON_ROWS = ['62%', '78%', '54%', '70%', '58%', '84%', '66%', '74%', '60%'];
import type { WorkoutTemplateWire } from '@/lib/workouts/api';
import { DIVIDER_LABELS, metaOf } from '@/lib/workouts/draft';
import { SearchIcon } from '../Icons';
import { DIVIDER_MIME, EXERCISE_MIME, TEMPLATE_MIME } from './dnd';
import { DividerIcon, FunnelIcon, Grip, StackIcon } from './Icons';
import { useEscapeGuard } from '@/web-components/ui/Modal';

/**
 * THE WHOLE CATALOGUE, not a window onto it — and that is a change the filters
 * forced. The chips are multi-select and `/v1/exercises` takes ONE
 * `muscleGroup` and ONE `equipment`, so *Chest or Back, on a machine or a
 * pulley* is four requests the server cannot answer as one. It is answered in
 * the browser instead, which is only honest if the browser holds every row the
 * chips could match: a filter applied to the first 60 of 77 silently hides the
 * other 17, and nothing on screen would say so. The catalogue is ~1.3k rows at
 * its largest and this is one text column per row.
 */
const CAP = 500;

/** What the pane is listing. The reference design puts these in one select
 *  above the search, and the reason they share a control is that they are three
 *  answers to the same question — *what goes into this session next*. */
type Source = 'exercises' | 'templates' | 'dividers';

interface Filters {
  /** Muscle groups. Within a group the chips are OR, across groups AND. */
  categories: string[];
  equipment: string[];
  /** `'inclineyou' | 'mine'` — whose library the movement came from. */
  library: string[];
}

const NO_FILTERS: Filters = { categories: [], equipment: [], library: [] };

/**
 * THE LIBRARY, INSIDE THE DIALOG — the builder's left column.
 *
 * `LibraryDock` is the same list on the week sheet and this is deliberately not
 * it. That component's whole argument is about a surface that opens BESIDE a
 * board which is already on screen: it is a `DockPanel` in the shell's third
 * track, it is not `aria-modal`, it carries no scrim, and it is pinned to one
 * day whose name it prints in its header. Every one of those is a statement
 * about a screen, and in here there is no screen — there is one workout, the
 * dialog is the whole frame, and there is no day to pin to.
 *
 * What DOES carry over is the row, and it carries over exactly: a click adds to
 * the workout, a grip drags onto any position in it, and the two gestures are
 * stated once above the list. A trainer who has filled a week on the board
 * already knows how to fill a session in here.
 *
 * ── THREE SOURCES, ONE SELECT, AND NO SECOND PANEL ──────────────────────────
 *
 * A session is not written out of movements alone. It is written out of
 * movements, sessions the trainer has already written, and the words that mark
 * where one block ends — *Warm-up*, *Main set*, *Cool-down*. Each of those
 * could have been its own surface; the select says they are one surface with
 * three contents, which is the claim that matches how they are used: a trainer
 * writing a push day drops a heading, five movements and last month's finisher
 * into the same canvas in one sitting, and a tab strip or a second dock would
 * make two of those three a detour.
 *
 * ── AND THE FILTERS ARE A POPOVER, NOT TWO SELECTS ──────────────────────────
 *
 * This column was *All muscles* and *All kit*, two `<select>`s side by side,
 * which is one value from each and no way to say *chest or shoulders*. The
 * popover is the same vocabulary as chips — multi-select, grouped, with the
 * count on the funnel and one *Remove all filters* — and it costs a click to
 * open, which is the right price for a control a trainer touches on the search
 * that did not narrow enough rather than on every search.
 *
 * ── NO THUMBNAILS, AND THAT IS THE LIBRARY'S OWN RULE ───────────────────────
 *
 * The design this was drawn from puts a still frame on every row. **The
 * exercise library is text-only** — the upstream artwork is unlicensed and V22
 * dropped the media columns — so a poster here would be a 44px box drawn over a
 * file that does not exist, which is the defect `clips` was removed from the
 * seed to stop. The target and the kit carry the row instead, which is what
 * `ExerciseInfo`'s own notes argue is the deciding information anyway: *Barbell
 * Bench Press* and *Close-Grip Bench Press* are told apart by the target, never
 * by a photograph of a bench.
 */
export function LibraryPane({
  onAdd,
  onCarry,
  countFor,
  countLabel,
  onAddTemplate,
  onCarryTemplate,
  onAddDivider,
  onCarryDivider,
}: {
  /** One click. No batch and no confirm — the canvas beside it is the receipt. */
  onAdd: (exercise: ExerciseWire) => void;
  /**
   * The movement a pointer has picked up, or null when it has let go. Held by
   * the dialog, because a drag that starts here ends on the canvas and the
   * canvas is the half that needs the record.
   *
   * `null` FOR THE PROP ITSELF IS *THERE IS NOWHERE TO DROP*. `AltPanel` lists
   * substitutes in a ranked order it gives a ↑ for; a drop position inside it
   * would be a second way to say the same thing, aimed at a list that is
   * usually two rows long. So the grips come off and the sentence above the
   * list stops promising a gesture that does nothing.
   */
  onCarry: ((exercise: ExerciseWire | null) => void) | null;
  /** How many of this movement the workout already carries. */
  countFor: (exerciseId: string) => number;
  /** What that count is OF, when it is not *in this workout* — `AltPanel`
   *  counts substitutes, and `in · 1` against the wrong noun is a lie the row
   *  has no room to qualify. */
  countLabel?: string;
  /**
   * A SAVED SESSION, POURED IN WHOLE. Omitted is *this surface has no workout
   * to pour into* — `AltPanel` is picking ONE substitute for one movement, and
   * a twelve-movement template arriving in that list is not a thing it could
   * mean. Omitting both of these drops the select entirely rather than drawing
   * a picker with one option in it.
   */
  onAddTemplate?: (template: WorkoutTemplateWire) => void;
  /**
   * The saved session a pointer has picked up, or null when it has let go — the
   * same arrangement `onCarry` and `onCarryDivider` use, and for the same
   * reason: the drag starts in this pane and ENDS on the canvas, so the canvas
   * is the half that needs the record. Absent is *there is nowhere to drop
   * one*, and the rows then lose their grips rather than promising a gesture
   * that does nothing.
   */
  onCarryTemplate?: (template: WorkoutTemplateWire | null) => void;
  /** A labelled break, on the end of the workout. Omitted for the same reason. */
  onAddDivider?: (label: string) => void;
  /**
   * The heading a pointer has picked up, or null when it has let go — the same
   * arrangement `onCarry` uses for a movement and for the same reason: the drag
   * starts in this pane and ENDS on the canvas, so the canvas is the half that
   * needs the record. Absent is *there is nowhere to drop one*, and the rows
   * then lose their grips rather than promising a gesture that does nothing.
   */
  onCarryDivider?: (label: string | null) => void;
}) {
  const [source, setSource] = useState<Source>('exercises');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ExerciseWire[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<ExercisesMeta | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplateWire[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLElement>(null);

  const sourced = Boolean(onAddTemplate || onAddDivider);

  useEffect(() => {
    start(async () => {
      const [page, m] = await Promise.all([searchExercises({ size: CAP }), fetchExerciseMeta()]);
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
      if (m) setMeta(m);
      setLoaded(true);
    });
  }, []);

  /* THE SHELF IS FETCHED ON THE FIRST LOOK AT IT, not beside the catalogue. A
     trainer who never opens *Workout Templates* — most of them, most sittings —
     should not pay a request for a list they did not ask for, and the source
     they DID ask for is the one that must be on screen fast. */
  useEffect(() => {
    if (source !== 'templates' || templates !== null) return;
    start(async () => setTemplates(await fetchWorkoutTemplates()));
  }, [source, templates]);

  /* ESCAPE CLOSES THE POPOVER AND NOTHING ELSE. It was said in
     capture, which does not work (see the guard below): `ModalHost` binds the builder's own Escape the same way and
     answers first, so an un-consumed press here would shut the whole dialog
     over a trainer who meant *put the filters away*. The same arrangement
     `LibraryDock` uses for its inner info panel. */
  /* The guard holds Escape away from the builder while the popover is up (trap 49); consuming it here in capture cannot. */
  useEscapeGuard(filtersOpen);
  useEffect(() => {
    if (!filtersOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setFiltersOpen(false);
    };
    const down = (e: MouseEvent) => {
      if (!pane.current?.contains(e.target as Node | null)) setFiltersOpen(false);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('mousedown', down);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('mousedown', down);
    };
  }, [filtersOpen]);

  function refetch(next: { q?: string }) {
    const q = next.q ?? query;
    start(async () => {
      const page = await searchExercises({ size: CAP, ...(q ? { q } : {}) });
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
    });
  }

  /* THE CHIPS, APPLIED. OR inside a group and AND across them, which is the
     reading a trainer gives a set of chips without being told: *chest or
     shoulders* narrows to two muscles, and adding *machine* narrows those two
     to the machines. A group with nothing picked is not a filter at all. */
  const shown = useMemo(() => {
    const { categories, equipment, library } = filters;
    if (categories.length === 0 && equipment.length === 0 && library.length === 0) return rows;
    return rows.filter(row => {
      if (categories.length > 0 && !(row.muscleGroup && categories.includes(row.muscleGroup))) {
        return false;
      }
      if (equipment.length > 0 && !(row.equipment && equipment.includes(row.equipment))) {
        return false;
      }
      if (library.length > 0 && !library.includes(row.isCustom ? 'mine' : 'inclineyou')) {
        return false;
      }
      return true;
    });
  }, [rows, filters]);

  const active = filters.categories.length + filters.equipment.length + filters.library.length;

  /* The templates are searched in the browser: the shelf is tens of rows, it is
     already here, and a second endpoint for a substring is a request against a
     list that is fully in hand. */
  const shownTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = templates ?? [];
    return q ? list.filter(t => t.name.toLowerCase().includes(q)) : list;
  }, [templates, query]);

  const shownDividers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DIVIDER_LABELS.filter(l => l.toLowerCase().includes(q)) : DIVIDER_LABELS;
  }, [query]);

  function toggle(group: keyof Filters, value: string) {
    setFilters(f => ({
      ...f,
      [group]: f[group].includes(value) ? f[group].filter(v => v !== value) : [...f[group], value],
    }));
  }

  return (
    <aside className="wkl" aria-label="The exercise library" ref={pane}>
      {sourced && (
        <div className="wkl__src">
          <select
            className="ctl"
            value={source}
            aria-label="What to add to this workout"
            onChange={e => {
              setSource(e.target.value as Source);
              /* THE SEARCH IS CLEARED WITH THE SOURCE, and the filters with it.
                 *bench* typed against the catalogue means nothing against three
                 saved sessions, and a source that opened empty because of a word
                 typed for the previous one reads as a source with nothing in
                 it. */
              setQuery('');
              setFilters(NO_FILTERS);
              setFiltersOpen(false);
              if (query) refetch({ q: '' });
            }}
          >
            <option value="exercises">Exercises</option>
            {onAddTemplate && <option value="templates">Workout Templates</option>}
            {onAddDivider && <option value="dividers">Dividers</option>}
          </select>
        </div>
      )}

      <div className="wkl__q">
        <label className="search">
          <SearchIcon />
          <input
            ref={search}
            type="search"
            value={query}
            placeholder="Search"
            aria-label={
              source === 'templates'
                ? 'Search your saved workouts'
                : source === 'dividers'
                  ? 'Search the dividers'
                  : 'Search the exercise library'
            }
            onChange={e => {
              setQuery(e.target.value);
              if (source === 'exercises') refetch({ q: e.target.value });
            }}
          />
        </label>

        {/* ONLY ON THE CATALOGUE. Every chip in the panel is an exercise
            attribute — a muscle, a piece of kit, whose library it came from —
            and none of the three says anything about a saved session or a
            heading. A funnel that opened a panel of controls that cannot narrow
            what is on screen is a control drawn over something that does not
            exist. */}
        {source === 'exercises' && (
          <button
            className={`wkl__fn${active > 0 ? ' wkl__fn--on' : ''}`}
            type="button"
            aria-expanded={filtersOpen}
            aria-label={active > 0 ? `Filters — ${active} on` : 'Filters'}
            title="Filters"
            onClick={() => setFiltersOpen(v => !v)}
          >
            <FunnelIcon />
            {active > 0 && <span className="wkl__fnn">{active}</span>}
          </button>
        )}
      </div>

      {filtersOpen && (
        /* DRAWN BEFORE THE META ARRIVES, with the groups it can fill. The
           library chips are two literals and need no fetch, so a panel that
           waited for the catalogue's vocabulary would open EMPTY on a slow
           request and read as a broken control rather than a loading one. */
        <FiltersPanel
          meta={meta ?? { muscleGroups: [], bodyParts: [], targets: [], equipment: [], levels: [] }}
          filters={filters}
          active={active}
          onToggle={toggle}
          onClear={() => setFilters(NO_FILTERS)}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* THE TWO GESTURES, SAID ONCE, and the grip is the only thing on a row
          that does not add to the workout — so it is the only one that needs a
          sentence. `LibraryDock` states the same pair in the same place. The
          other two sources have no grip and therefore no second sentence: a
          template and a heading both land on the end. */}
      <p className="wkl__drag">
        {source !== 'exercises'
          ? source === 'templates'
            ? onCarryTemplate
              ? 'A click adds every movement of that workout to the end. Drag by the grip to drop the whole session between two movements.'
              : 'A click adds every movement of that workout to the end.'
            : onCarryDivider
              ? 'A click adds the heading to the end. Drag by the grip to drop it between two movements.'
              : 'A click adds the heading to the end. Type over it on the canvas to rename it.'
          : onCarry
            ? 'A click adds to the end. Drag by the grip to drop it anywhere.'
            : 'A click adds it to the end of the list.'}
      </p>

      <div className="wkl__b">
        {source === 'templates' ? (
          /* THE SAME WAIT ON THE SAME PANE, so the same instrument. A shelf that
             drew a sentence while the catalogue one rail-switch away drew bones
             would be two answers to one question, one keystroke apart — which is
             the argument the Templates TAB was rebuilt on a rung up. */
          templates === null ? (
            <Skeleton label="Loading your saved workouts">
              {SKELETON_ROWS.slice(0, 4).map((w, i) => (
                <Skeleton.Row key={i} height={47}>
                  <Skeleton.Line width={w} height={11} />
                  <Skeleton.Line width="46%" height={8} />
                </Skeleton.Row>
              ))}
            </Skeleton>
          ) : shownTemplates.length === 0 ? (
            <p className="wkl__none">
              {templates.length === 0
                ? 'You have not saved a workout yet. The one you are writing is the first.'
                : 'No saved workout matches.'}
            </p>
          ) : (
            shownTemplates.map(row => (
              <TemplateRow
                key={row.id}
                row={row}
                onAdd={() => onAddTemplate?.(row)}
                onCarry={onCarryTemplate}
              />
            ))
          )
        ) : source === 'dividers' ? (
          <>
            {shownDividers.map(label => (
              <DividerRow
                key={label}
                label={label}
                onAdd={() => onAddDivider?.(label)}
                onCarry={onCarryDivider}
              />
            ))}
            {/* THE ESCAPE HATCH, and it is last rather than first: the ten
                above are what a session is usually written in, and a trainer
                who wants *Sled work* types it once on the canvas rather than
                hunting for a free-text box before every heading. */}
            <DividerRow
              label="New section"
              name="Custom divider"
              hint="Name it on the canvas"
              onAdd={() => onAddDivider?.('New section')}
              onCarry={onCarryDivider}
            />
          </>
        ) : !loaded ? (
          /* THE CATALOGUE IS 1,324 MOVEMENTS AND IT IS FETCHED ON MOUNT, inside
             a dialog that has already opened — so this column is the one part
             of the builder a trainer waits for, and it was answering with the
             sentence `Loading the library…`: one 11.5px line in a 329 × 428px
             box, which reports that a wait is happening and nothing about what
             is arriving.

             Split OUT of the `shown.length === 0` branch rather than left
             inside it. Those two states are not the same thing said twice — an
             empty list is an answer and a list that has not arrived is not one
             — and folded together the pane could only ever say the first while
             meaning the second. `c-skeleton` owns the 300ms, so a fast
             catalogue draws nothing at all. */
          <Skeleton label="Loading the exercise library">
            {SKELETON_ROWS.map((w, i) => (
              <Skeleton.Row key={i} height={47}>
                <Skeleton.Line width={w} height={11} />
                <Skeleton.Line width="46%" height={8} />
              </Skeleton.Row>
            ))}
          </Skeleton>
        ) : shown.length === 0 ? (
          <p className="wkl__none">
            {active > 0 && rows.length > 0
              ? 'Nothing matches those filters.'
              : 'Nothing matches.'}
          </p>
        ) : (
          <>
            {shown.map(row => (
              <LibraryRow
                key={row.id}
                row={row}
                on={countFor(row.id)}
                onLabel={countLabel}
                onAdd={() => onAdd(row)}
                onCarry={onCarry}
              />
            ))}
            {/* WHAT THE FILTERS TOOK OUT, said as a figure. `total` is the
                server's count for the search; `shown` is what the chips left of
                it. The line is only interesting when the two disagree. */}
            {shown.length < total && (
              <p className="wkl__cut">
                Showing {shown.length} of {total}.{' '}
                {active > 0 ? 'The filters are hiding the rest.' : 'Narrow the search to see the rest.'}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * THE FILTERS — grouped chips, multi-select, one clear.
 *
 * Absolutely positioned over the canvas rather than pushed into the column: it
 * is 300px of chips against a 330px rail, so laying it out in flow would either
 * squeeze every chip onto its own line or push the list it filters off the
 * bottom of the screen. It overlays the surface it does not act on, which is
 * the one surface a trainer is not reading while they pick.
 */
function FiltersPanel({
  meta,
  filters,
  active,
  onToggle,
  onClear,
  onClose,
}: {
  meta: ExercisesMeta;
  filters: Filters;
  active: number;
  onToggle: (group: keyof Filters, value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="wkfl" role="group" aria-label="Filters">
      <div className="wkfl__hd">
        <span className="wkfl__k">Filters</span>
        {/* ALWAYS IN THE HEADER, and `disabled` rather than dropped when nothing
            is picked: the row is the same three controls every time it opens, so
            the ✕ does not move under the pointer the moment a first chip is
            chosen. */}
        <button className="wkfl__clr" type="button" disabled={active === 0} onClick={onClear}>
          Remove all filters
        </button>
        <button className="wkfl__x" type="button" aria-label="Close the filters" onClick={onClose}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <ChipGroup
        label="Categories"
        values={meta.muscleGroups}
        picked={filters.categories}
        onPick={v => onToggle('categories', v)}
      />
      <ChipGroup
        label="Exercise type"
        values={meta.equipment}
        picked={filters.equipment}
        onPick={v => onToggle('equipment', v)}
      />
      <ChipGroup
        label="Library"
        values={['inclineyou', 'mine']}
        names={{ inclineyou: 'By InclineYou', mine: 'My library' }}
        picked={filters.library}
        onPick={v => onToggle('library', v)}
      />
    </div>
  );
}

function ChipGroup({
  label,
  values,
  names,
  picked,
  onPick,
}: {
  label: string;
  values: string[];
  /** What a value is CALLED, where the stored word is not the printed one —
   *  `isCustom` is a boolean and *mine* is not a sentence. */
  names?: Record<string, string>;
  picked: string[];
  onPick: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="wkfl__g">
      <span className="wkfl__gk">{label}</span>
      <div className="wkfl__chips">
        {values.map(value => (
          <button
            key={value}
            type="button"
            className={`wkfl__c${picked.includes(value) ? ' wkfl__c--on' : ''}`}
            /* A CHIP IS A CHECKBOX AND SAYS SO. It is a toggle drawn as a pill,
               and a screen reader that reads it as a plain button gives no way
               to tell the picked ones from the rest. */
            aria-pressed={picked.includes(value)}
            onClick={() => onPick(value)}
          >
            {names?.[value] ?? value}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * ONE HEADING — a click that appends, a grip that aims.
 *
 * THE SAME TWO GESTURES AS A MOVEMENT, and deliberately the same shape of row:
 * a trainer who has learned that a click drops a bench press on the end and a
 * grip puts it between two cards has learned this row as well. The click is
 * still the primary — most headings are written before the movements under
 * them, where the end IS the place — and the grip is what a session already
 * half-written needs, because *Cool-down* almost never belongs last in the
 * order it was thought of.
 */
function DividerRow({
  label,
  name,
  hint,
  onAdd,
  onCarry,
}: {
  /** What lands on the canvas. */
  label: string;
  /** What the ROW is called, where that is not the heading itself — *Custom
   *  divider* adds a *New section*, and a row printing the word it writes would
   *  be a tenth ordinary heading rather than the escape hatch. */
  name?: string;
  hint?: string;
  onAdd: () => void;
  onCarry?: (label: string | null) => void;
}) {
  const [armed, setArmed] = useState(false);

  /* The same disarm as `LibraryRow`: a grip pressed and released without a drag
     would otherwise leave the row draggable after the pointer has gone. */
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  return (
    <div
      className={`wkl__w${onCarry ? '' : ' wkl__w--nog'}`}
      draggable={(Boolean(onCarry) && armed) || undefined}
      onDragStart={e => {
        if (!onCarry) return;
        /* COPY — the ten rows are a vocabulary, not a stock of headings, and
           dragging *Warm-up* out of it does not use it up. */
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(DIVIDER_MIME, label);
        // Firefox starts no drag without a plain type alongside the private one.
        e.dataTransfer.setData('text/plain', label);
        onCarry(label);
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry?.(null);
      }}
    >
      <button
        className="wkl__r"
        type="button"
        title={`Add a ${label} heading`}
        onClick={onAdd}
      >
        <span className="wkl__nm">
          {name ?? label}
          {hint && <span className="wkl__mt">{hint}</span>}
        </span>
        <span className="wkl__rr">
          <span className="wkl__ic" aria-hidden="true">
            <DividerIcon />
          </span>
          <span className="wkl__plus" aria-hidden="true">
            +
          </span>
        </span>
      </button>
      {onCarry && (
        <span
          className="wkl__g"
          aria-hidden="true"
          title={`Drag the ${label} heading into the workout`}
          onMouseDown={() => setArmed(true)}
        >
          <Grip />
        </span>
      )}
    </div>
  );
}

/**
 * ONE SAVED SESSION — a click that pours it on the end, a grip that carries it
 * anywhere.
 *
 * THE GRIP CARRIES THE WHOLE WORKOUT AND NOT A MOVEMENT OUT OF IT. That is the
 * only reading of the gesture that matches what the row says it is: the row
 * prints *5 movements · 16 sets*, so letting go of it has to leave five cards
 * in their own order, their circuits intact and their headings above the blocks
 * they open. Anything less is a drag that quietly did a different, smaller
 * thing than the one the trainer aimed.
 *
 * ARMED BY THE GRIP, like `LibraryRow` and `DividerRow`, and the argument is
 * theirs unchanged: the click is still the primary gesture — most sessions are
 * poured into an empty canvas, where the end IS the place — and a row that is
 * permanently draggable turns a click that wandered three pixels into a drag.
 */
function TemplateRow({
  row,
  onAdd,
  onCarry,
}: {
  row: WorkoutTemplateWire;
  onAdd: () => void;
  onCarry?: (template: WorkoutTemplateWire | null) => void;
}) {
  const [armed, setArmed] = useState(false);

  /* The same disarm the other two rows make: a grip pressed and released
     without a drag would otherwise leave the row draggable after the pointer
     has gone. */
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  const count = `${row.exerciseCount} ${row.exerciseCount === 1 ? 'movement' : 'movements'}`;

  return (
    <div
      className={`wkl__w${onCarry ? '' : ' wkl__w--nog'}`}
      draggable={(Boolean(onCarry) && armed) || undefined}
      onDragStart={e => {
        if (!onCarry) return;
        /* COPY. The shelf is not emptied by a session being poured out of it —
           the same rule the delete confirm states: a template lands in a
           workout as a copy, never as a link back. */
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(TEMPLATE_MIME, row.id);
        // Firefox starts no drag without a plain type alongside the private one.
        e.dataTransfer.setData('text/plain', row.name);
        onCarry(row);
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry?.(null);
      }}
    >
      <button
        className="wkl__r"
        type="button"
        title={`Add every movement of ${row.name}`}
        onClick={onAdd}
      >
        <span className="wkl__nm">
          {row.name}
          <span className="wkl__mt">
            {count} · {row.setCount} sets
          </span>
        </span>
        <span className="wkl__rr">
          <span className="wkl__ic" aria-hidden="true">
            <StackIcon />
          </span>
          <span className="wkl__plus" aria-hidden="true">
            +
          </span>
        </span>
      </button>
      {onCarry && (
        <span
          className="wkl__g"
          aria-hidden="true"
          title={`Drag all ${count} of ${row.name} into the workout`}
          onMouseDown={() => setArmed(true)}
        >
          <Grip />
        </span>
      )}
    </div>
  );
}

/**
 * ONE MOVEMENT — a click that adds, a grip that carries.
 *
 * DRAGGABLE ONLY WHILE THE GRIP IS HELD, which is the arming `DockRow` and
 * `DayColumn` both use. A row that is permanently draggable turns a click that
 * wandered three pixels into a drag that adds nothing, and the click is still
 * the primary gesture: most movements go on the end.
 */
function LibraryRow({
  row,
  on,
  onLabel,
  onAdd,
  onCarry,
}: {
  row: ExerciseWire;
  on: number;
  onLabel?: string;
  onAdd: () => void;
  onCarry: ((exercise: ExerciseWire | null) => void) | null;
}) {
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

  const meta = metaOf(row);

  return (
    <div
      className={`wkl__w${onCarry ? '' : ' wkl__w--nog'}`}
      draggable={(onCarry !== null && armed) || undefined}
      onDragStart={e => {
        if (!onCarry) return;
        /* COPY, NOT MOVE. The library is not emptied by being drawn from, and
           the cursor is the only place a trainer is told which of the two this
           is before they let go. */
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(EXERCISE_MIME, row.id);
        // Firefox starts no drag without a plain type alongside the private one.
        e.dataTransfer.setData('text/plain', row.name);
        onCarry(row);
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry?.(null);
      }}
    >
      <button className="wkl__r" type="button" onClick={onAdd} title={`Add ${row.name}`}>
        <span className="wkl__nm">
          {row.name}
          {meta && <span className="wkl__mt">{meta}</span>}
        </span>
        <span className="wkl__rr">
          {/* ALREADY IN THIS WORKOUT, stated rather than prevented — a second
              run of curls later in a session is a real prescription, so this
              informs and never refuses. */}
          {on > 0 && <span className="wkl__on">{onLabel ?? 'in'} · {on}</span>}
          <span className="wkl__plus" aria-hidden="true">
            +
          </span>
        </span>
      </button>
      {onCarry && (
        <span
          className="wkl__g"
          aria-hidden="true"
          title={`Drag ${row.name} into the workout`}
          onMouseDown={() => setArmed(true)}
        >
          <Grip />
        </span>
      )}
    </div>
  );
}
