/**
 * The lowest value a reading may take, as the backend sends it on each measurement (`min`, `minInclusive`; V28, 4 Nov
 * 2026). Most measurements are a size or a mass and must be above 0; a count or score (push-ups, plank, overhead squat)
 * may be 0, and sit-and-reach may be negative. Every reading is below 100,000. The rule lives in the backend's
 * `AssessmentCatalogue.boundOf`; this file only reads what came on the wire, so a backend from before V28 (no fields)
 * gets the old rule, above 0.
 */
export interface Bounded {
  min?: number;
  minInclusive?: boolean;
}

const BELOW = 100_000;

export function readingAllowed(m: Bounded, n: number): boolean {
  if (!Number.isFinite(n) || n >= BELOW) return false;
  const min = m.min ?? 0;
  return m.minInclusive ? n >= min : n > min;
}

/** "a number above 0 and below 100,000", "0 or more and below 100,000", … — the backend's sentence, so both say the same. */
export function readingRule(m: Bounded): string {
  const min = m.min ?? 0;
  const low = min === 0 ? '0' : min.toLocaleString('en-US');
  return `${m.minInclusive ? `a number, ${low} or more,` : `a number above ${low}`} and below 100,000`;
}

/** A keypad with a minus sign only where a negative is a real answer: iOS's decimal pad has none. */
export function readingInputMode(m: Bounded): 'decimal' | 'text' {
  return (m.min ?? 0) < 0 ? 'text' : 'decimal';
}
