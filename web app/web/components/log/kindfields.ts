import { boxesFor, EFFORT, LOAD, type Parsed } from '@/lib/sessionlog/kinds';
import type { EffortKind, LoadKind } from '@/lib/sessionlog/wire';

/**
 * WHAT A SET'S TWO BOXES SAY AND ACCEPT, BY THE SET'S OWN KINDS (R39).
 *
 * The grid and the set panel draw the same two boxes they always drew — a load
 * and an effort — and this file is the one place that says what each is called,
 * what it steps by and how its text becomes a number, for all seven × seven
 * kinds. For weight × reps every answer here is the answer the console already
 * gave (`Load kg`, `Reps`, 2.5, 1), which is what keeps the old screen exactly
 * as it was; the other kinds get the same boxes with their own words.
 */

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** What a stored load looks like in the box: `80`, `62.5`, `70` (a percentage). Empty when nothing is logged. */
export function loadText(value: number | null): string {
  return value === null ? '' : trim(value);
}

/** What a stored effort looks like in the box: `8` reps, `1:30` for a hold, `400` metres. */
export function effortText(kind: EffortKind, value: number | null): string {
  if (value === null) return '';
  if (!EFFORT[kind].timer) return trim(value);
  const s = Math.round(value);
  return s < 60 ? String(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The load column's head — `Load kg` for every kilogram kind, the kind's own word otherwise. */
export function loadHead(kind: LoadKind): string {
  const d = LOAD[kind];
  if (d.kilograms) return 'Load kg';
  return d.hasBox ? d.label : 'Load';
}

/** The effort column's head — `Reps`, `Time` or `Distance`. */
export function effortHead(kind: EffortKind): string {
  return EFFORT[kind].label;
}

/** Whether the kind has a load box at all (bodyweight has none: the column stays and says so). */
export function hasLoadBox(loadKind: LoadKind, effortKind: EffortKind): boolean {
  return boxesFor(loadKind, effortKind).load !== null;
}

export function parseLoad(kind: LoadKind, text: string): Parsed {
  return LOAD[kind].parse(text);
}

export function parseEffort(kind: EffortKind, text: string): Parsed {
  return EFFORT[kind].parse(text);
}

/** One press of the load stepper: from what is shown, by the kind's step, never below its floor. */
export function stepLoad(kind: LoadKind, shown: string, sign: 1 | -1): string {
  const d = LOAD[kind];
  const parsed = d.parse(shown);
  const base = parsed.ok && parsed.value !== null ? parsed.value : 0;
  return trim(Math.max(d.min, Math.round((base + sign * d.step) * 100) / 100));
}

/** One press of the effort stepper. Reps stop at 1 (a set of 0 reps is not a set); holds and distances may reach 0. */
export function stepEffort(kind: EffortKind, shown: string, sign: 1 | -1): string {
  const d = EFFORT[kind];
  const parsed = d.parse(shown);
  const base = parsed.ok && parsed.value !== null ? parsed.value : 0;
  const floor = d.repetitions ? 1 : 0;
  return effortText(kind, Math.max(floor, base + sign * d.step));
}

/** The words on the stepper buttons — the console's own for kilograms and reps, the kind's step otherwise. */
export function loadStepLabel(kind: LoadKind, sign: 1 | -1, set: number): string {
  const d = LOAD[kind];
  const unit = d.kilograms ? ' kg' : d.unit ? ` ${d.unit}` : '';
  return `Load ${sign === 1 ? 'up' : 'down'} ${trim(d.step)}${unit}, set ${set}`;
}

export function effortStepLabel(kind: EffortKind, sign: 1 | -1, set: number): string {
  const d = EFFORT[kind];
  if (d.repetitions) return `${sign === 1 ? 'One rep more' : 'One rep fewer'}, set ${set}`;
  return `${d.label} ${sign === 1 ? 'up' : 'down'} ${trim(d.step)}${d.unit ? ` ${d.unit}` : kind.endsWith('time') ? ' s' : ''}, set ${set}`;
}

/**
 * THE TICK'S ONE QUESTION, ANSWERED IN ONE PLACE: does this tick write anything?
 *
 * The original console wrote on a tick only when the row had a number in it — typed, or the
 * last-time numbers the field is showing as its dashed placeholder (those are read as if typed;
 * `readDraft(…, true)`). A planned, not-yet-logged set with neither is NOT written: the row says
 * 'Put a number in the row before ticking it.' and nothing is sent. The plan's own target is never
 * silently logged by a tick, because the trainer did not see that number in the box.
 *
 * A set that is already logged is a CORRECTION and is written whatever the boxes hold (clearing a
 * box is a correction). `load` / `effort` here are what the row HOLDS after typed + placeholder.
 */
export function tickNeedsNumber(wasDone: boolean, held: { load: number | null; effort: number | null }): boolean {
  return !wasDone && held.load === null && held.effort === null;
}
