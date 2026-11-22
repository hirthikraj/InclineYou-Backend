import type { SetWire } from '@/lib/portal/workout-api';

/** What a set is counted in, in words the client uses. Text only; nothing here is a health inference. */
export function loadUnit(kind: string): string | null {
  if (kind === 'weight' || kind === 'weight_range' || kind === 'rpe_weight') return 'kg';
  if (kind === 'percent_1rm') return '% 1RM';
  return null;
}

export function effortUnit(kind: string): string {
  if (kind === 'time' || kind === 'max_time') return 'sec';
  if (kind === 'distance' || kind === 'max_distance') return 'm';
  return 'reps';
}

export function hasLoad(kind: string): boolean {
  return kind !== 'bodyweight';
}

export function trim(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(Number(n.toFixed(2)));
}

/** "2 × 8 @ 60 kg" from a plan's sets (they usually agree); falls back to a count when they do not. */
export function prescription(sets: { loadKind: string; effortKind: string; targetLoad: number | null; targetEffort: number | null }[]): string {
  if (sets.length === 0) return 'No sets prescribed';
  const first = sets[0];
  const same = sets.every((s) => s.targetLoad === first.targetLoad && s.targetEffort === first.targetEffort);
  const eff = first.targetEffort === null ? effortUnit(first.effortKind) : `${trim(first.targetEffort)} ${effortUnit(first.effortKind) === 'reps' ? '' : effortUnit(first.effortKind)}`.trim();
  const unit = loadUnit(first.loadKind);
  const load = first.targetLoad !== null && unit ? ` @ ${trim(first.targetLoad)} ${unit}` : '';
  return same ? `${sets.length} × ${eff}${load}` : `${sets.length} sets`;
}

export function setLine(s: SetWire): string {
  const u = loadUnit(s.loadKind);
  const parts: string[] = [];
  if (s.loadValue !== null && u) parts.push(`${trim(s.loadValue)} ${u}`);
  if (s.effortValue !== null) parts.push(`${trim(s.effortValue)} ${effortUnit(s.effortKind)}`);
  return parts.join(' × ');
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** A finished workout's length as a reader says it — `54 min`, `1 h 5 min`. `clock` is for a running timer; `54:00` read back is a clock time. */
export function minutes(totalSeconds: number): string {
  const m = Math.max(1, Math.round(totalSeconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** A weight total with Indian digit grouping and no stray decimals — `4,522.5`, not `4522.5`. */
export function kg(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

/** A session's total lifted, the way Progress prints it: kilograms under a tonne, tonnes above (`850 kg`, `4.6 t`). Fits a three-up tile at 320. */
export function volume(totalKg: number): string {
  return totalKg < 1000 ? `${kg(totalKg)} kg` : `${(totalKg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t`;
}
