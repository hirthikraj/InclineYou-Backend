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
