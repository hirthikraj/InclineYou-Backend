'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TemplateExerciseWire, TemplatePatch } from './api';
import type { Result } from './actions';
import { daysOf, reindex, toEntries, weekCountOf, type Entry } from './blueprint';

/**
 * THE DRAFT — twenty deep, debounced, and the same on both sides of the copy.
 *
 * This is `Builder`'s own machinery, lifted out of it unchanged and given a
 * second caller: `/clients/:id/program/:pid`, where a trainer edits ONE
 * CLIENT'S copy of a plan. The two screens are not the same screen — one has a
 * shelf, an Assign panel and thirteen people downstream of it; the other has a
 * client, a history and nothing downstream at all — but the thing in the middle
 * is identical, and it is the part with the sharp edges:
 *
 * - one write funnel, so undo is ONE stack rather than an undo per action;
 * - one debounce, so a save is one rewrite of the whole blueprint rather than
 *   one per keystroke (`template.structure` is a single jsonb column and a
 *   program's rows are replaced wholesale — neither has a row to PATCH);
 * - one `beforeunload`, armed only while something is genuinely unsaved;
 * - one rule for adopting a server version that is genuinely newer, and one
 *   defence against adopting our OWN save coming back (see `selfSaved`).
 *
 * `CertifiedPreview` deliberately does NOT use this, and its own note says why:
 * a preview can write nothing, so every allocation here would be dead weight
 * and every future change to it would owe a branch nothing on that screen can
 * reach. The line is drawn at the draft, which is the machinery that EDITS a
 * program — the board that draws one is shared by all three screens.
 *
 * ── WHAT STAYS IN THE SHELL ─────────────────────────────────────────────────
 *
 * View state: which week is up, which day is open, which panel, the library
 * drawer, the density. None of it is part of the draft, none of it is saved,
 * and the two shells want different amounts of it. `onAdopt` is the one seam —
 * when a genuinely newer version arrives the shell has to close what it had
 * open, because the row a panel was editing may no longer exist.
 */

export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

const UNDO_DEPTH = 20;
const SAVE_DEBOUNCE_MS = 900;

/** The four fields a draft IS, with no machinery around them. The staged mode
 *  keeps one of these as the last-saved state so the screen can say what an
 *  edit session changed and put it back if the trainer walks away. */
export interface DraftSnapshot {
  entries: Entry[];
  labels: Record<string, string>;
  days: number[];
  weeks: number;
}

/** What both a `TemplateWire` and a client's copy can answer. The copy's three
 *  shape fields are optional on the wire — see `ProgramWire` — and `daysOf` and
 *  `weekCountOf` already fall back to deriving them from the rows. */
export interface DraftSource {
  id: string;
  updatedAt: number;
  exercises: TemplateExerciseWire[];
  dayLabels?: Record<string, string>;
  weeks?: number | null;
  trainingDays?: number[];
}

export interface Draft {
  entries: Entry[];
  labels: Record<string, string>;
  days: number[];
  weeks: number;

  /** EVERY structural change goes through here — that is what makes undo one
   *  stack and autosave one effect. */
  commit: (next: Entry[] | ((prev: Entry[]) => Entry[])) => void;
  undo: () => void;
  undoDepth: number;

  /* The three shape writes. They mark the draft dirty themselves, because a
     renamed day that never saved is the same defect as a lost exercise. */
  setLabels: (next: (prev: Record<string, string>) => Record<string, string>) => void;
  setDays: (next: number[] | ((prev: number[]) => number[])) => void;
  setWeeks: (next: number | ((prev: number) => number)) => void;

  save: SaveState;
  saveError: string | null;
  savedAt: number;
  /**
   * Write now rather than at the end of the debounce. Awaited before any act
   * that reads the SERVER's copy — assigning, duplicating, pushing.
   *
   * Resolves to WHETHER THE WRITE LANDED. Autosaving callers ignore it and read
   * `save`/`saveError` instead, which is the right shape for a save nobody
   * asked for. A staged caller cannot: it has to know, in the same tick, if the
   * thing it just did on the trainer's behalf worked, and `save` read straight
   * after an `await` is the value from the render that scheduled it.
   */
  flush: () => Promise<boolean>;

  /* ── staged mode only (`autosave: false`) ──────────────────────────────────
     Both are inert under autosave: `baseline` tracks the draft itself, so a
     diff against it is always empty, and `discard` has nothing to put back. */

  /** THE LAST STATE THE SERVER ACKNOWLEDGED, and the thing a review panel
   *  diffs against. It moves on a successful `flush` and on adopting a newer
   *  server version, and at no other time — an edit must not quietly become
   *  part of the baseline it is supposed to be measured against. */
  baseline: DraftSnapshot;
  /** Put the baseline back and empty the undo stack. The *Discard* half of the
   *  exit prompt; nothing is written, because nothing was. */
  discard: () => void;
}

export function useBlueprintDraft({
  source,
  save: write,
  onAdopt,
  autosave = true,
}: {
  source: DraftSource;
  /** Where this draft goes: `saveTemplate` for a blueprint, `saveClientPlan`
   *  for one client's copy. The patch shape is the same on both routes. */
  save: (patch: TemplatePatch) => Promise<Result<null>>;
  /** A genuinely newer server version has been adopted — close anything the
   *  shell had open over rows that may no longer exist. */
  onAdopt?: () => void;
  /**
   * WHETHER A DIRTY DRAFT WRITES ITSELF, and the one place the two callers
   * genuinely want different behaviour.
   *
   * ON (the default, and the blueprint builder) — the debounce fires 900ms
   * after the last keystroke. A blueprint is the trainer's own document, they
   * are the only reader, and a save that has to be asked for is a save that
   * gets forgotten.
   *
   * OFF (one client's copy) — the draft stays local until `flush` is called by
   * hand. The difference is not a preference: a copy is a prescription somebody
   * is CURRENTLY TRAINING ON, and a half-finished edit reaching it means a
   * client opening their plan mid-thought and finding four sets of nothing.
   * So the edits stage, the trainer reads what they changed, and the save is
   * the moment they agree to it. `baseline` and `discard` are what make that
   * reviewable, and `beforeunload` below stops being a courtesy and becomes
   * the only thing between an accidental tab close and lost work.
   */
  autosave?: boolean;
}): Draft {
  const router = useRouter();
  const initial = useMemo(() => toEntries(source.exercises), [source.exercises]);

  const [entries, setEntries] = useState<Entry[]>(initial);
  const [labels, setLabelsState] = useState<Record<string, string>>(() => ({
    ...(source.dayLabels ?? {}),
  }));
  const [days, setDaysState] = useState<number[]>(() => daysOf(source, initial));
  const [weeks, setWeeksState] = useState(() => weekCountOf(source, initial));

  const [undoStack, setUndoStack] = useState<Entry[][]>([]);
  const [save, setSave] = useState<SaveState>('clean');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number>(source.updatedAt);

  /* THE LAST ACKNOWLEDGED STATE. Seeded from the same values the draft is, so
     an untouched screen diffs to nothing. */
  const [baseline, setBaseline] = useState<DraftSnapshot>(() => ({
    entries: initial,
    labels: { ...(source.dayLabels ?? {}) },
    days: daysOf(source, initial),
    weeks: weekCountOf(source, initial),
  }));

  /* Adopt a genuinely different server version — another program opened, or a
     push that changed this one. Keyed on identity AND stamp, so an edit made in
     a second tab lands rather than being papered over by a draft that never
     noticed; and NOT on every render, or this half of a save round trip would
     wipe the keystroke the trainer typed during it. */
  const loadedRef = useRef(`${source.id}:${source.updatedAt}`);
  /* OUR OWN SAVE COMING BACK IS NOT A DIFFERENT VERSION.
     `flush` refreshes after a successful write so everything beside this screen
     picks up the new `updated_at` — which arrives here as a source whose stamp
     differs from the one we loaded, and therefore looked exactly like somebody
     else's edit. The reload it triggered adopted rows IDENTICAL to the draft
     already on screen and, on the way, emptied the 20-deep undo stack and
     closed whatever was open. An undo stack that resets every 900ms is not 20
     deep, and the reset was invisible because the rows never changed.
     An edit from a SECOND TAB still lands, because that arrives without the
     flag. */
  const selfSaved = useRef(false);
  useEffect(() => {
    const stamp = `${source.id}:${source.updatedAt}`;
    if (loadedRef.current === stamp) return;
    if (selfSaved.current && source.id === loadedRef.current.split(':')[0]) {
      selfSaved.current = false;
      loadedRef.current = stamp;
      setSavedAt(source.updatedAt);
      return;
    }
    loadedRef.current = stamp;
    const fresh = toEntries(source.exercises);
    const freshLabels = { ...(source.dayLabels ?? {}) };
    const freshDays = daysOf(source, fresh);
    const freshWeeks = weekCountOf(source, fresh);
    setEntries(fresh);
    setLabelsState(freshLabels);
    setDaysState(freshDays);
    setWeeksState(freshWeeks);
    /* The adopted version IS the acknowledged one — somebody else's edit is
       not this trainer's unreviewed change, and leaving the old baseline here
       would report their work as ours on the next review. */
    setBaseline({ entries: fresh, labels: freshLabels, days: freshDays, weeks: freshWeeks });
    setUndoStack([]);
    setSave('clean');
    setSavedAt(source.updatedAt);
    onAdopt?.();
    // `onAdopt` is deliberately out of the deps: it is a shell closure that is
    // rebuilt every render, and adopting is an event about the SOURCE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const commit = useCallback((next: Entry[] | ((prev: Entry[]) => Entry[])) => {
    setEntries(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value === prev) return prev;
      setUndoStack(stack => [prev, ...stack].slice(0, UNDO_DEPTH));
      setSave('dirty');
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const [previous, ...rest] = stack;
      setEntries(previous);
      setSave('dirty');
      return rest;
    });
  }, []);

  const setLabels = useCallback(
    (next: (prev: Record<string, string>) => Record<string, string>) => {
      setLabelsState(next);
      setSave('dirty');
    },
    [],
  );

  const setDays = useCallback((next: number[] | ((prev: number[]) => number[])) => {
    setDaysState(next);
    setSave('dirty');
  }, []);

  const setWeeks = useCallback((next: number | ((prev: number) => number)) => {
    setWeeksState(next);
    setSave('dirty');
  }, []);

  /** Back to the last acknowledged state. The undo stack goes with it: those
   *  twenty steps all describe edits that no longer exist, and an undo after a
   *  discard that resurrected one of them would be the worst kind of surprise. */
  const discard = useCallback(() => {
    setEntries(baseline.entries);
    setLabelsState(baseline.labels);
    setDaysState(baseline.days);
    setWeeksState(baseline.weeks);
    setUndoStack([]);
    setSave('clean');
    setSaveError(null);
  }, [baseline]);

  /* ── autosave ── */
  /* The latest draft, for the debounced save to read when it eventually fires.
     Written in an effect and not during render: a ref assigned during render is
     wrong under concurrent rendering, where a render can be thrown away — and
     this one would then be describing a draft that never existed. */
  const draftRef = useRef({ entries, labels, days, weeks });
  useEffect(() => {
    draftRef.current = { entries, labels, days, weeks };
  }, [entries, labels, days, weeks]);

  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  }, [write]);

  const flush = useCallback(async (): Promise<boolean> => {
    const { entries: e, labels: l, days: d, weeks: w } = draftRef.current;
    setSave('saving');
    setSaveError(null);
    const result = await writeRef.current(patchOf(e, l, d, w));
    if (result.ok) {
      // Only clear if nothing was typed WHILE this was in flight — otherwise
      // the newer edit is marked saved and the debounce never fires for it.
      setSave(current => (current === 'saving' ? 'clean' : current));
      setSavedAt(Date.now());
      /* WHAT WENT OVER THE WIRE, not what is on screen now. The two differ when
         something was typed during the round trip, and a baseline taken from
         the live draft would swallow that edit — it would be neither saved nor
         reported as a change. `e/l/d/w` are the exact values sent. */
      setBaseline({ entries: e, labels: l, days: d, weeks: w });
      // The server's `updated_at` moves, and everything beside this screen
      // reads it. Refreshing after the write rather than before keeps the draft
      // the thing on screen throughout.
      selfSaved.current = true;
      router.refresh();
      return true;
    }
    setSave('failed');
    setSaveError(result.message);
    return false;
  }, [router]);

  useEffect(() => {
    if (!autosave) return;
    if (save !== 'dirty') return;
    const timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [autosave, save, flush, entries, labels, days, weeks]);

  /* A tab closed mid-save loses the draft, and the browser is the only thing
     that can say so in time. Only while there is genuinely something unsaved. */
  useEffect(() => {
    if (save === 'clean') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  return {
    entries,
    labels,
    days,
    weeks,
    commit,
    undo,
    undoDepth: undoStack.length,
    setLabels,
    setDays,
    setWeeks,
    save,
    saveError,
    savedAt,
    flush,
    baseline,
    discard,
  };
}

/**
 * The draft, as the wire wants it.
 *
 * Exported because the client plan screen diffs its own unsaved draft against
 * the blueprint it was copied from, and the diff works on wire rows — so the
 * conversion has to exist outside the save path anyway. One function, so a row
 * cannot be saved with one set of fields and compared with another.
 */
export function patchOf(
  entries: Entry[],
  labels: Record<string, string>,
  days: number[],
  weeks: number,
): TemplatePatch {
  return {
    weeks,
    trainingDays: days,
    dayLabels: labels,
    exercises: reindex(entries).map(entry => ({
      exerciseId: entry.exerciseId,
      sets: entry.sets,
      reps: entry.reps,
      restSeconds: entry.restSeconds,
      targetLoad: entry.targetLoad,
      notes: entry.notes,
      dayOfWeek: entry.day,
      orderIndex: entry.order,
      week: entry.week,
      durationSeconds: entry.durationSeconds,
      tempo: entry.tempo,
      altExerciseId: entry.altExerciseId,
      /* Law 5. Written on every row, including the ones a pre-law-5 blueprint
         seeded — the seed id is stable per slot, so a day that has never been
         touched saves the container it is already being drawn as. */
      workoutId: entry.workoutId,
      workoutName: entry.workoutName,
      groupId: entry.groupId,
      setDetail: entry.setDetail
        ? entry.setDetail.map(s => ({
            reps: s.reps,
            durationSeconds: s.durationSeconds,
            toFailure: s.toFailure,
          }))
        : null,
    })),
  };
}
