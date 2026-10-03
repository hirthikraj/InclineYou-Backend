import { EFFORT_RECORD_STEP, PLATE_STEP_KG, trim1, type Judged } from '@/lib/log/log';

import { formatDistance, formatDuration, rankingValue, saySet as saySetKinds, type SetLike } from './kinds';

/**
 * ONE SET IN WORDS, FOR EVERY KIND — AND THE ORIGINAL STRINGS, UNTOUCHED, FOR THE TWO IT KNEW.
 *
 * The original console's text builders (`saySet` in lib/log/log.ts) know exactly two shapes, because
 * the old model reduced every set to `loadKg` and `reps`: a set with a load in kilograms and a rep
 * count (`52.5 kg × 8`) and a set with only reps (`8 reps`). A timed hold, a carry measured in
 * metres or a 70 % set has neither number, so the old text said `0 reps` / `1 sets` for it.
 *
 * So the rule here is narrow on purpose:
 *   · weight × reps and bodyweight × reps print EXACTLY what they always did (those strings are not
 *     changed by this file — `isPlain` is the gate);
 *   · every other pair of kinds is said by the registry (`kinds.ts`): `50 s`, `1:30`, `24 kg × 40 m`,
 *     `70% 1RM × 5`, `RPE 8 × 5`.
 *
 * Only TEXT lives here. Which set is the best, whether it was a record, how volume adds up — none of
 * that moves; the old record rule stays the rule (the user's decision).
 */

/** The two shapes the original strings are right for. */
export function isPlainKinds(loadKind: SetLike['loadKind'], effortKind: SetLike['effortKind']): boolean {
  return effortKind === 'reps' && (loadKind === 'weight' || loadKind === 'bodyweight');
}

export function isPlain(set: Pick<SetLike, 'loadKind' | 'effortKind'>): boolean {
  return isPlainKinds(set.loadKind, set.effortKind);
}

/** True when any set is in a kind the original strings cannot say. */
export function hasExotic(sets: readonly Pick<SetLike, 'loadKind' | 'effortKind'>[]): boolean {
  return sets.some((s) => !isPlain(s));
}

/** One set in words. */
export function sayOne(set: SetLike): string {
  if (isPlain(set)) {
    const reps = set.effortValue ?? 0;
    // The original: "52.5 kg × 8", or "8 reps" when the set carries no load.
    if (set.loadKind === 'weight' && set.loadValue != null && set.loadValue > 0) {
      return `${trim1(set.loadValue)} kg × ${reps}`;
    }
    return `${reps} reps`;
  }
  return saySetKinds(set) || '—';
}

/**
 * THE TOP SET OF AN EXERCISE LOGGED IN KINDS THE ORIGINAL RULE CANNOT RANK — in one place.
 *
 * Best by the server's own ranking (`rankingValue`, the mirror of `LogSql.score`): for these kinds that
 * is the longest time, the longest distance, the most reps, else the highest load; on a tie the
 * heavier load, then the later set. It decides only WHICH set a summary line quotes. The verdicts
 * (record / matched / first) are still the old `judge`, unchanged. For weight × reps the original
 * `topSet` (heaviest, then most reps) is still what is used — this is never called for it.
 */
export function topOf<T extends SetLike>(sets: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of sets) {
    if (best === null) { best = s; continue; }
    const a = rankingValue(s);
    const b = rankingValue(best);
    if (a > b || (a === b && ((s.loadValue ?? 0) > (best.loadValue ?? 0) || (s.loadValue ?? 0) === (best.loadValue ?? 0)))) best = s;
  }
  return best;
}

/* ───────────────────────────────────── the record, said for a hold or a carry ── */

/**
 * THE VERDICT'S WORDS FOR A TIME OR A DISTANCE — the original sentences wherever they are still true.
 *
 * The verdict itself is `judgeEffort` (lib/log/log.ts): longer is a record, further is a record, the
 * same distance with more weight is a record, equal is matched. What it cannot do is SAY it, because
 * every sentence the old model writes is about kilograms and reps — and one of them, *Exactly what
 * they did last time*, was printed under a hold that had just gone from 50 s to 1:05. So the rows and
 * cards for these kinds are rebuilt here from the judge's own numbers (`Judged.effort`, `.wasEffort`,
 * `.by`, `.byUnit`), and `Exactly what they did last time` is said ONLY for `matched`, which now
 * means the numbers are equal.
 */
const stepWord = (unit: 's' | 'm'): string =>
  unit === 's' ? `${EFFORT_RECORD_STEP.time} seconds` : `${EFFORT_RECORD_STEP.distance} metres`;

/** What a hold or a carry was before: `50 s`, `24 kg × 40 m`. */
function wasSaid(j: Judged): string {
  const effort = j.family === 'time' ? formatDuration(j.wasEffort ?? 0) : formatDistance(j.wasEffort ?? 0);
  const load = j.wasLoad ?? 0;
  return j.family === 'distance' && load > 0 ? `${trim1(load)} kg × ${effort}` : effort;
}

/** "+15 s", "+1:10", "+20 m", "+2.5 kg" — the improvement in the unit it was made in. */
function deltaSaid(j: Judged): string | null {
  if (!j.byUnit || j.by <= 0) return null;
  if (j.byUnit === 'kg') return `+${trim1(j.by)} kg`;
  if (j.byUnit === 'm') return `+${trim1(j.by)} m`;
  return j.by < 60 ? `+${trim1(j.by)} s` : `+${formatDuration(j.by)}`;
}

/** A Bests row: the sentence under the figure. `null` for a verdict that has no row (`none`). */
export function effortBestRow(j: Judged, value: string): { was: string; delta: string | null; why: string; value: string } | null {
  if (!j.family) return null;
  const loadWins = j.byUnit === 'kg';
  switch (j.kind) {
    case 'record':
      return {
        value, was: `was ${wasSaid(j)}`, delta: deltaSaid(j),
        why: loadWins
          ? 'Heavier than they have ever lifted, by at least the smallest plate in the room. Gold, and their phone buzzes.'
          : j.family === 'time'
            ? `Held longer than they ever have, by at least ${stepWord('s')}. Gold, and their phone buzzes.`
            : `Carried further than they ever have, by at least ${stepWord('m')}. Gold, and their phone buzzes.`,
      };
    case 'quiet':
      return {
        value, was: `was ${wasSaid(j)}`, delta: deltaSaid(j),
        why: loadWins
          ? 'Real, and small — the same distance with more weight on it, but under the smallest plate. In their history. Not on their phone.'
          : j.family === 'time'
            ? `Real, and small — under ${stepWord('s')} longer than before. In their history. Not on their phone.`
            : `Real, and small — under ${stepWord('m')} further than before. In their history. Not on their phone.`,
      };
    case 'matched':
      return {
        value, was: `was ${wasSaid(j)}`, delta: null,
        why: 'Exactly what they did last time. Matching is not beating — no gold, and nothing to send.',
      };
    default:
      return null;
  }
}

/** A record card (Finish): the same sentences, in the card's voice. */
export function effortRecordCard(j: Judged, name: string, value: string): { value: string; unit: string; reps: null; was: string; delta: string; why: string } | null {
  if (!j.family || (j.kind !== 'record' && j.kind !== 'quiet')) return null;
  const delta = deltaSaid(j) ?? '';
  const lower = name.toLowerCase();
  const loud = j.kind === 'record';
  const why = loud
    ? j.byUnit === 'kg'
      ? `Heavier than they have ever carried it, and the jump is a whole ${trim1(PLATE_STEP_KG)} kg plate — so this one is worth sending.`
      : j.family === 'time'
        ? `Longest they have held the ${lower}, by at least ${stepWord('s')} — so this one is worth sending.`
        : `Furthest they have gone on the ${lower}, by at least ${stepWord('m')} — so this one is worth sending.`
    : `Real, and small: ${delta} on what they had managed. In their history. Not on their phone.`;
  return { value, unit: '', reps: null, was: `was ${wasSaid(j)}`, delta, why };
}
