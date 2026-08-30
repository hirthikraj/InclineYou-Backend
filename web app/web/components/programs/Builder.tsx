'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AssignmentWire, ClientWire, ExerciseNameWire, TemplateWire } from '@/lib/programs/api';
import { assignTemplate, duplicateTemplate, removeTemplate, saveTemplate } from '@/lib/programs/actions';
import {
  addEntries,
  applyProgression,
  copyDay,
  copyWeek,
  daysOf,
  dropEntries,
  effectiveWeek,
  entriesFor,
  expandToWholeGroups,
  isRepeat,
  linkWithNext,
  moveEntries,
  newUid,
  nudge,
  reindex,
  relativeDay,
  removeEntries,
  shapeLine,
  toEntries,
  unlinkGroup,
  updateEntry,
  weekCountOf,
  type Entry,
  type ProgressionStep,
} from '@/lib/programs/blueprint';
import { AssignPanel } from './AssignPanel';
import { AssignedList } from './AssignedList';
import { DayColumn } from './DayColumn';
import { CopyIcon, DotsIcon, LadderIcon, PlusIcon, UsersIcon } from './Icons';
import { LibraryPanel, type BatchPrescription } from './LibraryPanel';
import { ProgressionPanel } from './ProgressionPanel';
import { RowPanel } from './RowPanel';
import { ProgramsTabs } from './tabs';

/**
 * THE BUILDER — Program → Week → Day → Exercise → Sets, on one plane.
 *
 * Every day of the week is a column, so a mistake in Day 3 is caught while
 * editing Day 1 — which is what the phone's three levels of push cannot do and
 * the whole reason this screen exists on a desk.
 *
 * ── IT OWNS THE PAGE, AND THE SHELF IS PASSED IN ─────────────────────────────
 *
 * "The list and the builder are one screen" is the IA's own row, so the shelf is
 * beside this and the page header is above both. Everything that header says
 * belongs to the DRAFT — the day and week counts as edited, the save state, the
 * actions — so the builder renders the header rather than a parent guessing at
 * it, and the shelf arrives as a prop. The alternative was lifting the whole
 * draft a level up to feed a header, which is a lot of state travelling one way
 * to serve one line of text.
 *
 * ── THE DRAFT AUTOSAVES; THERE IS NO SAVE BUTTON ─────────────────────────────
 *
 * The design set says so — *"adding, removing and reordering are local writes,
 * and the sync pill in the top bar is what answers 'is this safe yet'"* — and
 * this half has no sync pill, because it has no queue: the web app is
 * online-only. So the equivalent honest thing is an autosave with the status
 * said in the header, and a retry when it fails.
 *
 * It is debounced rather than per-keystroke because `template.structure` is one
 * jsonb column: there is no row to PATCH, so every save rewrites the whole
 * blueprint.
 *
 * The ROW PANEL keeps its explicit Save, which the design also draws and gives
 * the reason for: rewriting an entry's numbers is a different act from moving
 * one. It commits into the draft; the draft is what reaches the server.
 *
 * ── AND THE UNDO STACK IS REAL ───────────────────────────────────────────────
 *
 * The design's *still open · 01* is "the undo stack itself — specified at 20
 * steps and drawn here at one." Twenty here, because every write on this screen
 * is a pure function from one entry list to another, so the stack is a stack of
 * arrays and costs nothing to keep.
 */

type Panel =
  | { kind: 'row'; uid: string }
  | { kind: 'library'; week: number; day: number }
  | { kind: 'progression' }
  | { kind: 'assign' }
  | { kind: 'assigned' }
  | null;

type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

const UNDO_DEPTH = 20;
const SAVE_DEBOUNCE_MS = 900;

export function Builder({
  template,
  assignments,
  clients,
  names,
  shelf,
  shelfCount,
}: {
  template: TemplateWire;
  assignments: AssignmentWire[];
  clients: ClientWire[];
  names: Record<string, ExerciseNameWire>;
  shelf: React.ReactNode;
  /** For the tab strip's count. The shelf itself holds the list. */
  shelfCount: number;
}) {
  const router = useRouter();
  const initial = useMemo(() => toEntries(template.exercises), [template.exercises]);

  /* ── the draft ── */
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [labels, setLabels] = useState<Record<string, string>>(() => ({ ...template.dayLabels }));
  const [days, setDays] = useState<number[]>(() => daysOf(template, initial));
  const [weeks, setWeeks] = useState(() => weekCountOf(template, initial));

  const [undoStack, setUndoStack] = useState<Entry[][]>([]);
  const [save, setSave] = useState<SaveState>('clean');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number>(template.updatedAt);

  /* ── the view ── */
  const [view, setView] = useState<'days' | 'weeks'>('days');
  const [week, setWeek] = useState(1);
  const [focusDay, setFocusDay] = useState(() => daysOf(template, initial)[0] ?? 1);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  /** The block a pointer is carrying — its head row's uid. Held here rather
   *  than in the column, because a drag that starts in Day 1 is a drop in
   *  Day 3 and both columns have to know about it. */
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  /* Adopt a genuinely different server version — another template opened, or a
     resync that changed this one. Keyed on identity AND stamp, so an edit made
     in a second tab lands rather than being papered over by a draft that never
     noticed; and NOT on every render, or this half of a save round trip would
     wipe the keystroke the trainer typed during it. */
  const loadedRef = useRef(`${template.id}:${template.updatedAt}`);
  useEffect(() => {
    const stamp = `${template.id}:${template.updatedAt}`;
    if (loadedRef.current === stamp) return;
    loadedRef.current = stamp;
    const fresh = toEntries(template.exercises);
    setEntries(fresh);
    setLabels({ ...template.dayLabels });
    setDays(daysOf(template, fresh));
    setWeeks(weekCountOf(template, fresh));
    setFocusDay(daysOf(template, fresh)[0] ?? 1);
    setUndoStack([]);
    setSelection(new Set());
    setPanel(null);
    setSave('clean');
    setSavedAt(template.updatedAt);
  }, [template]);

  /* ── the write funnel ─────────────────────────────────────────────────────
     Every structural change goes through here, which is what makes undo one
     stack rather than an undo per action, and autosave one effect rather than a
     call at thirteen call sites. */
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

  /* ── autosave ── */
  /* The latest draft, for the debounced save to read when it eventually fires.
     Written in an effect and not during render: a ref assigned during render is
     wrong under concurrent rendering, where a render can be thrown away — and
     this one would then be describing a draft that never existed. */
  const draftRef = useRef({ entries, labels, days, weeks });
  useEffect(() => {
    draftRef.current = { entries, labels, days, weeks };
  }, [entries, labels, days, weeks]);

  const flush = useCallback(async () => {
    const { entries: e, labels: l, days: d, weeks: w } = draftRef.current;
    setSave('saving');
    setSaveError(null);
    const result = await saveTemplate(template.id, {
      weeks: w,
      trainingDays: d,
      dayLabels: l,
      exercises: reindex(e).map(entry => ({
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
        groupId: entry.groupId,
        setDetail: entry.setDetail
          ? entry.setDetail.map(s => ({
              reps: s.reps,
              durationSeconds: s.durationSeconds,
              toFailure: s.toFailure,
            }))
          : null,
      })),
    });
    if (result.ok) {
      // Only clear if nothing was typed WHILE this was in flight — otherwise
      // the newer edit is marked saved and the debounce never fires for it.
      setSave(current => (current === 'saving' ? 'clean' : current));
      setSavedAt(Date.now());
      // The server's `updated_at` moves, and the shelf beside this reads it.
      // Refreshing after the write rather than before keeps the draft the thing
      // on screen throughout.
      loadedRef.current = `${template.id}:pending`;
      router.refresh();
    } else {
      setSave('failed');
      setSaveError(result.message);
    }
  }, [template.id, router]);

  useEffect(() => {
    if (save !== 'dirty') return;
    const timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [save, flush, entries, labels, days, weeks]);

  /* A tab closed mid-save loses the draft, and the browser is the only thing
     that can say so in time. Only while there is genuinely something unsaved. */
  useEffect(() => {
    if (save === 'clean') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  /* ── keyboard ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        if (moving) setMoving(false);
        else if (copyFrom !== null) setCopyFrom(null);
        else if (panel) setPanel(null);
        else if (selection.size > 0) setSelection(new Set());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, moving, panel, copyFrom, selection.size]);

  /* ── derived ── */
  const shown = effectiveWeek(entries, week);
  const sourceWeek = shown.repeat ? 1 : week;
  const readOnly = shown.repeat;

  const selected = useMemo(
    () => (panel?.kind === 'row' ? entries.find(e => e.uid === panel.uid) ?? null : null),
    [panel, entries],
  );

  /* ── actions ── */

  function toggleRow(uid: string, additive: boolean) {
    setSelection(prev => {
      if (!additive) {
        if (prev.size === 1 && prev.has(uid)) return new Set();
        return new Set([uid]);
      }
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  /**
   * Land a dragged block. `beforeUid` is null for the tail of the lane.
   *
   * A drag that starts on a row inside the selection carries the whole
   * selection, which is the rule the bulk bar's *Move to* already follows —
   * ticking four rows and then dragging one of them somewhere else is the one
   * reading of that gesture nobody means.
   */
  function dropInto(beforeUid: string | null, toWeek: number, toDay: number) {
    if (!dragUid) return;
    const carried = expandToWholeGroups(entries, new Set([dragUid]));
    const withSelection = selection.size > 1 && [...carried].some(uid => selection.has(uid));
    const payload = withSelection ? new Set([...selection, ...carried]) : carried;
    commit(prev => dropEntries(prev, payload, toWeek, toDay, beforeUid));
    setDragUid(null);
  }

  function addBatch(ids: string[], p: BatchPrescription, toWeek: number, toDay: number) {
    const tail = Math.max(-1, ...entriesFor(entries, toWeek, toDay).map(e => e.order)) + 1;
    const additions: Entry[] = ids.map((exerciseId, i) => ({
      uid: newUid(),
      exerciseId,
      day: toDay,
      week: toWeek,
      order: tail + i,
      sets: p.sets,
      reps: p.mode === 'reps' ? p.value : null,
      durationSeconds: p.mode === 'time' ? p.value : null,
      restSeconds: p.restSeconds,
      targetLoad: null,
      tempo: null,
      notes: null,
      altExerciseId: null,
      groupId: null,
      setDetail: null,
    }));
    commit(prev => addEntries(prev, additions));
    setPanel(null);
  }

  function duplicateRow(uid: string) {
    commit(prev => {
      const source = prev.find(e => e.uid === uid);
      if (!source) return prev;
      // `order + 0.5` lands it directly under the original and `reindex` makes
      // the halves whole again. `groupId` is dropped: a copy of one half of a
      // superset is a third movement, not a third member.
      const copy: Entry = { ...source, uid: newUid(), order: source.order + 0.5, groupId: null };
      return reindex([...prev, copy]);
    });
  }

  function setDayCount(count: number) {
    const next = Array.from({ length: count }, (_, i) => i + 1);
    setDays(next);
    setLabels(prev => {
      const out: Record<string, string> = {};
      for (const day of next) out[String(day)] = prev[String(day)] ?? '';
      return out;
    });
    if (focusDay > count) setFocusDay(count);
    // Rows on a day that no longer exists would be invisible and still saved,
    // so they move to the last remaining day. Losing work to a picker is the one
    // thing this control must not do.
    commit(prev =>
      prev.some(e => e.day > count)
        ? reindex(prev.map(e => (e.day > count ? { ...e, day: count } : e)))
        : [...prev],
    );
  }

  async function onDuplicate() {
    if (save !== 'clean') await flush();
    const result = await duplicateTemplate(template.id);
    if (result.ok) router.push(`/programs/${result.value.id}`);
    else setFlash(result.message);
  }

  async function onDelete() {
    const result = await removeTemplate(template.id);
    if (result.ok) router.push('/programs');
    else setFlash(result.message);
  }

  async function onAssign(input: {
    clientId: string;
    startDate: number | null;
    schedule: { day: number; weekday: number; time: string }[];
  }) {
    setAssignBusy(true);
    setAssignError(null);
    // The copy is made from what the SERVER holds, so an unsaved draft would
    // assign the previous version — silently, and to a real person.
    if (save !== 'clean') await flush();
    const result = await assignTemplate(template.id, {
      clientId: input.clientId,
      startDate: input.startDate,
      schedule: input.schedule,
    });
    setAssignBusy(false);
    if (result.ok) {
      setPanel(null);
      setFlash('Assigned. They have their own copy of it now.');
      router.refresh();
    } else {
      setAssignError(result.message);
    }
  }

  const columns = view === 'days' ? days : Array.from({ length: weeks }, (_, i) => i + 1);
  const selectedCount = expandToWholeGroups(entries, selection).size;

  return (
    <>
      <div className="ph">
        <div className="ph__row pg__ph">
          <div className="pg__phm">
            <h1 className="ph__t">{template.name}</h1>
            <p className="ph__sub">
              {shapeLine(days.length, weeks, template.activeAssignedCount)} ·{' '}
              <SaveLine
                state={save}
                savedAt={savedAt}
                error={saveError}
                onRetry={() => void flush()}
              />
            </p>
          </div>
          <div className="ph__acts">
            <button className="btn btn--secondary" type="button" onClick={() => setPanel({ kind: 'assigned' })}>
              <UsersIcon />
              {template.assignedCount === 0
                ? 'Nobody on this'
                : `${template.activeAssignedCount} on this`}
            </button>
            {/* DUPLICATE IS THE MOST-USED ACTION ON THIS SCREEN, so it is a
                labelled secondary beside the primary rather than a row in the
                overflow. Trainers build one good program and tweak it per
                client, and the copy is what makes the tweak safe. */}
            <button className="btn btn--secondary" type="button" onClick={() => void onDuplicate()}>
              <CopyIcon />
              Duplicate
            </button>
            <button className="btn btn--primary" type="button" onClick={() => setPanel({ kind: 'assign' })}>
              <PlusIcon />
              Assign
            </button>
            <div className="pg__hdmenu">
              <button
                className="btn btn--icon btn--ghost"
                type="button"
                aria-label="More actions for this program"
                aria-expanded={menu}
                onClick={() => setMenu(v => !v)}
              >
                <DotsIcon />
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <button
                    className="menu__i"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      undo();
                    }}
                    disabled={undoStack.length === 0}
                  >
                    Undo <kbd>⌘Z</kbd>
                  </button>
                  <div className="menu__sep" />
                  <button
                    className="menu__i menu__i--danger"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      void onDelete();
                    }}
                  >
                    Remove this program
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOUND BY RENDERING: this was in the shelf-only branch and nowhere
            else, so opening a program took the exercise library off the screen.
            `tabs.tsx` states the whole reason it stopped being a rail row —
            "trainers only visit it while building" — and a strip that
            disappears the moment building starts is that argument reversed.
            It is the last thing in `.ph`, which is what lets `.tab`'s
            `margin-bottom:-1px` sit the active underline ON the header's
            bottom border. */}
        <ProgramsTabs current="programs" templateCount={shelfCount} />
      </div>

      <div className="split">
        {shelf}

        <div className="split__r pg__builder">
          <Toolbar
            view={view}
            setView={setView}
            weeks={weeks}
            week={week}
            setWeek={setWeek}
            onAddWeek={() => {
              setWeeks(w => Math.min(52, w + 1));
              setSave('dirty');
            }}
            authored={new Set(entries.map(e => e.week))}
            days={days}
            focusDay={focusDay}
            setFocusDay={setFocusDay}
            dayCount={days.length}
            setDayCount={setDayCount}
            labels={labels}
            onProgression={() => setPanel({ kind: 'progression' })}
          />

          {flash && (
            <p className="pg__flash" role="status">
              {flash}
              <button className="btn btn--sm btn--ghost" type="button" onClick={() => setFlash(null)}>
                Dismiss
              </button>
            </p>
          )}

          {(selection.size > 0 || moving) && (
            <BulkBar
              count={selectedCount}
              moving={moving}
              onMove={() => setMoving(true)}
              onCancelMove={() => setMoving(false)}
              onClear={() => {
                setSelection(new Set());
                setMoving(false);
              }}
              onRemove={() => {
                commit(prev => removeEntries(prev, expandToWholeGroups(prev, selection)));
                setSelection(new Set());
              }}
            />
          )}

          <div className="bplane">
            {copyFrom !== null && (
              <div className="why">
                <p className="why__k">Copying Day {copyFrom}</p>
                <p>
                  Pick the day it should land on — whatever is there now is replaced. Press{' '}
                  <b>Escape</b> to stop.
                </p>
              </div>
            )}

            <div className="dayc-set">
              {columns.length === 0 ? (
                <p className="pg__none">
                  No days laid out yet. Use <b>days a week</b> above to add one.
                </p>
              ) : view === 'days' ? (
                columns.map(day => (
                  <DayColumn
                    key={day}
                    day={day}
                    label={labels[String(day)] ?? ''}
                    rows={entriesFor(shown.rows, sourceWeek, day)}
                    names={names}
                    selection={selection}
                    repeat={shown.repeat}
                    readOnly={readOnly}
                    dropTarget={moving}
                    onToggle={toggleRow}
                    onOpenRow={uid => setPanel({ kind: 'row', uid })}
                    onAdd={() => setPanel({ kind: 'library', week, day })}
                    onNudge={(uid, d) => commit(prev => nudge(prev, uid, d))}
                    dragUid={dragUid}
                    onDragRow={readOnly ? undefined : setDragUid}
                    onDragEnd={() => setDragUid(null)}
                    onDropRow={
                      readOnly ? undefined : beforeUid => dropInto(beforeUid, week, day)
                    }
                    onLink={uid => commit(prev => linkWithNext(prev, uid))}
                    onUnlink={groupId => commit(prev => unlinkGroup(prev, groupId))}
                    onDuplicateRow={duplicateRow}
                    onRemoveRow={uid => commit(prev => removeEntries(prev, new Set([uid])))}
                    onRelabel={
                      readOnly
                        ? undefined
                        : value => {
                            setLabels(prev => ({ ...prev, [String(day)]: value }));
                            setSave('dirty');
                          }
                    }
                    onMakeOwn={shown.repeat ? () => commit(prev => copyWeek(prev, 1, week)) : undefined}
                    onCopyDay={
                      readOnly
                        ? undefined
                        : copyFrom === null
                          ? () => setCopyFrom(day)
                          : copyFrom === day
                            ? () => setCopyFrom(null)
                            : () => {
                                commit(prev => copyDay(prev, week, copyFrom, day));
                                setCopyFrom(null);
                              }
                    }
                    onMoveHere={
                      moving
                        ? () => {
                            commit(prev =>
                              moveEntries(prev, expandToWholeGroups(prev, selection), week, day),
                            );
                            setMoving(false);
                            setSelection(new Set());
                          }
                        : undefined
                    }
                  />
                ))
              ) : (
                /* ── WEEKS ACROSS ──────────────────────────────────────────
                   The same day, down the block. Everfit's Master Planner can put
                   Week 1 Day 1 beside Week 2 Day 1, and the heuristic audit had
                   its absence open as a finding: judging progressive overload
                   without it is a recall task where a recognition one is
                   available.

                   A toggle on the builder rather than a third view mode with its
                   own dropdown — two views a trainer will find beat three they
                   will not. Only the figure that CHANGED is accented, so the
                   block reads as a progression rather than as four columns of
                   similar text. */
                columns.map(w => {
                  const content = effectiveWeek(entries, w);
                  const from = content.repeat ? 1 : w;
                  return (
                    <DayColumn
                      key={w}
                      day={focusDay}
                      label={`Week ${w}${content.repeat ? ' · repeats week 1' : ''}`}
                      rows={entriesFor(content.rows, from, focusDay)}
                      against={
                        w > 1 ? entriesFor(entries, previousAuthored(entries, w), focusDay) : null
                      }
                      names={names}
                      selection={selection}
                      repeat={content.repeat}
                      readOnly={content.repeat}
                      onToggle={toggleRow}
                      onOpenRow={uid => setPanel({ kind: 'row', uid })}
                      onAdd={() => setPanel({ kind: 'library', week: w, day: focusDay })}
                      onNudge={(uid, d) => commit(prev => nudge(prev, uid, d))}
                      dragUid={dragUid}
                      onDragRow={content.repeat ? undefined : setDragUid}
                      onDragEnd={() => setDragUid(null)}
                      onDropRow={
                        content.repeat ? undefined : beforeUid => dropInto(beforeUid, w, focusDay)
                      }
                      onLink={uid => commit(prev => linkWithNext(prev, uid))}
                      onUnlink={groupId => commit(prev => unlinkGroup(prev, groupId))}
                      onDuplicateRow={duplicateRow}
                      onRemoveRow={uid => commit(prev => removeEntries(prev, new Set([uid])))}
                      onMakeOwn={
                        content.repeat ? () => commit(prev => copyWeek(prev, 1, w)) : undefined
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── the panels ── */}
        {panel?.kind === 'row' && selected && (
          <RowPanel
            key={selected.uid}
            entry={selected}
            name={names[selected.exerciseId]?.name ?? 'This exercise'}
            names={names}
            pairName={pairNameFor(entries, selected, names)}
            canLink={Boolean(pairNameFor(entries, selected, names))}
            onClose={() => setPanel(null)}
            onSave={patch => {
              commit(prev => updateEntry(prev, selected.uid, patch));
              setPanel(null);
            }}
            onLink={() => {
              commit(prev => linkWithNext(prev, selected.uid));
              setPanel(null);
            }}
            onUnlink={() => {
              const groupId = selected.groupId;
              if (groupId) commit(prev => unlinkGroup(prev, groupId));
              setPanel(null);
            }}
          />
        )}

        {panel?.kind === 'library' && (
          <LibraryPanel
            key={`${panel.week}-${panel.day}`}
            destination={`Day ${panel.day}${labels[String(panel.day)] ? ` · ${labels[String(panel.day)]}` : ''}`}
            onClose={() => setPanel(null)}
            onAdd={(ids, prescription) => addBatch(ids, prescription, panel.week, panel.day)}
          />
        )}

        {panel?.kind === 'progression' && (
          <ProgressionPanel
            entries={entries}
            weeks={weeks}
            days={days}
            dayLabels={labels}
            onClose={() => setPanel(null)}
            onApply={(plan: ProgressionStep[], scope) => {
              commit(prev => applyProgression(prev, plan, scope));
              setWeeks(w => Math.max(w, plan[plan.length - 1]?.week ?? w));
              setPanel(null);
              // The whole point of a ladder is the comparison, and the view that
              // shows it is the one it was written in.
              setView('weeks');
            }}
          />
        )}

        {panel?.kind === 'assign' && (
          <AssignPanel
            templateName={template.name}
            days={days}
            dayLabels={labels}
            clients={clients}
            busy={assignBusy}
            error={assignError}
            onClose={() => setPanel(null)}
            onAssign={onAssign}
          />
        )}

        {panel?.kind === 'assigned' && (
          <AssignedList
            templateId={template.id}
            assignments={assignments}
            onDone={() => setPanel(null)}
          />
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────── the save line ── */

/**
 * What the design set puts in the sync pill, said where this half can honestly
 * say it: beside the shape, in the header, about this program.
 *
 * A failure is a sentence and a retry, not a colour — an autosave that failed
 * quietly is the reason a Save button feels safer than it is.
 */
function SaveLine({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  savedAt: number;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'saving') return <span>saving…</span>;
  if (state === 'dirty') return <span>unsaved changes</span>;
  if (state === 'failed') {
    return (
      <span className="pg__savefail">
        {error ?? 'Not saved.'}{' '}
        <button className="btn btn--sm btn--ghost" type="button" onClick={onRetry}>
          Try again
        </button>
      </span>
    );
  }
  return <span>saved {relativeDay(savedAt)}</span>;
}

/* ─────────────────────────────────────────────── the toolbar ── */

function Toolbar({
  view,
  setView,
  weeks,
  week,
  setWeek,
  onAddWeek,
  authored,
  days,
  focusDay,
  setFocusDay,
  dayCount,
  setDayCount,
  labels,
  onProgression,
}: {
  view: 'days' | 'weeks';
  setView: (v: 'days' | 'weeks') => void;
  weeks: number;
  week: number;
  setWeek: (w: number) => void;
  onAddWeek: () => void;
  authored: Set<number>;
  days: number[];
  focusDay: number;
  setFocusDay: (d: number) => void;
  dayCount: number;
  setDayCount: (n: number) => void;
  labels: Record<string, string>;
  onProgression: () => void;
}) {
  return (
    <div className="pg__tools">
      {view === 'days' ? (
        <div className="wk">
          <span className="wk__k">Weeks</span>
          {Array.from({ length: weeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              /* A SOLID chip is a week somebody authored; a GHOST chip is a week
                 that repeats week 1. That distinction is the whole model, so the
                 strip draws it — twelve identical chips would be the blank
                 twelve-week grid the phone deliberately refuses. */
              className={authored.has(w) ? 'chip' : 'chip chip--ghost'}
              type="button"
              aria-pressed={week === w}
              onClick={() => setWeek(w)}
            >
              {w}
            </button>
          ))}
          <button className="chip chip--ghost" type="button" aria-label="Add a week" onClick={onAddWeek}>
            <PlusIcon size={12} />
          </button>
        </div>
      ) : (
        <div className="wk">
          <span className="wk__k">Day</span>
          {days.map(d => (
            <button
              key={d}
              className="chip"
              type="button"
              aria-pressed={focusDay === d}
              onClick={() => setFocusDay(d)}
            >
              {labels[String(d)] || `Day ${d}`}
            </button>
          ))}
        </div>
      )}

      <span className="tools__sp" />

      {/* THE DAY COUNT IS A CONTROL, not a consequence of where exercises
          landed. Building the day list from the blueprint alone is the phone's
          old rule and it had a trap in it: the first exercise went on Day 1, Day
          1 became the only day the program had, and there was nowhere left to
          put Day 2's first exercise. */}
      <label className="fld pg__daycount">
        <span className="fld__l">Days a week</span>
        <select className="ctl" value={dayCount} onChange={e => setDayCount(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <option key={n} value={n}>
              {n} day{n === 1 ? '' : 's'} a week
            </option>
          ))}
        </select>
      </label>

      <button className="btn btn--sm btn--secondary" type="button" onClick={onProgression}>
        <LadderIcon size={13} />
        Progression
      </button>

      <div className="tools" role="group" aria-label="How to read the program">
        <button className="chip" type="button" aria-pressed={view === 'days'} onClick={() => setView('days')}>
          Days across
        </button>
        <button className="chip" type="button" aria-pressed={view === 'weeks'} onClick={() => setView('weeks')}>
          Weeks across
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── the bulk bar ── */

/**
 * SELECTION IS A FIRST-CLASS STATE, because moving an exercise had no keyboard
 * path and WCAG 2.2 SC 2.5.7 requires the single-pointer alternative.
 *
 * Space ticks a row, this names the size of the set, and *Move to* is a control
 * rather than a gesture — TrainHeroic's pattern, and the one bulk affordance in
 * the category that survives being used from a keyboard. The count earns the
 * row: eleven of the twelve exercises a trainer reorders in a session belong to
 * the same day.
 *
 * **The move reports in the bar that performed it**, not in a corner toast — the
 * app's rule is that a reversible action is reversible in place, in the thing
 * that changed, and a toast is a second place to look.
 */
function BulkBar({
  count,
  moving,
  onMove,
  onCancelMove,
  onClear,
  onRemove,
}: {
  count: number;
  moving: boolean;
  onMove: () => void;
  onCancelMove: () => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="pg__bulk" role="status">
      <b>
        {count} exercise{count === 1 ? '' : 's'} selected
      </b>
      {moving ? (
        <>
          <span className="small">Pick the day it should land in.</span>
          <span className="tools__sp" />
          <button className="btn btn--sm btn--ghost" type="button" onClick={onCancelMove}>
            Cancel the move
          </button>
        </>
      ) : (
        <>
          <span className="tools__sp" />
          <button className="btn btn--sm btn--secondary" type="button" onClick={onMove}>
            Move to…
          </button>
          <button className="btn btn--sm btn--ghost" type="button" onClick={onRemove}>
            Remove
          </button>
          <button className="btn btn--sm btn--ghost" type="button" onClick={onClear}>
            Clear
          </button>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────── helpers ── */

/** The week a weeks-across column compares against: the last one with content
 *  of its own, not simply `w - 1` — a repeating week in between would make every
 *  figure look changed. */
function previousAuthored(entries: Entry[], week: number): number {
  for (let w = week - 1; w >= 1; w -= 1) {
    if (!isRepeat(entries, w)) return w;
  }
  return 1;
}

/** The row this one would pair with — the next in the same day. Named in the
 *  panel so the pairing is understood before it is made rather than discovered
 *  after. */
function pairNameFor(
  entries: Entry[],
  entry: Entry,
  names: Record<string, ExerciseNameWire>,
): string | null {
  const lane = entriesFor(entries, entry.week, entry.day);
  const at = lane.findIndex(e => e.uid === entry.uid);
  const next = lane[at + 1];
  if (!next) return null;
  return names[next.exerciseId]?.name ?? 'the next exercise';
}
